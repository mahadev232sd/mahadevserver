import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';
import { customAlphabet } from 'nanoid';
import { Transaction } from '../models/Transaction.js';
import { GameID } from '../models/GameID.js';
import { User } from '../models/User.js';
import { BankAccount } from '../models/BankAccount.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getDepositPaymentDisplay,
  buildUpiPayUri,
  DEPOSIT_SESSION_MS,
} from '../config/depositPayment.js';
import { DepositPaymentConfig } from '../models/DepositPaymentConfig.js';

const genRef = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', 12);

function cloudinarySignature(params, apiSecret) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(`${sorted}${apiSecret}`)
    .digest('hex');
}

async function uploadProofToCloudinary(file) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env is missing (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'deposit-proofs';
  const signature = cloudinarySignature({ folder, timestamp }, apiSecret);
  const ext = (file.originalname || '').split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(ext) ? ext : 'jpg';

  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype || 'image/jpeg' }), `proof.${safeExt}`);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || 'Cloudinary upload failed');
  }
  return data.secure_url || data.url;
}

const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

const router = Router();
router.use(requireAuth);

const MIN_DEPOSIT = 100;
const MIN_WITHDRAW = 200;

router.post(
  '/deposit-start',
  [
    body('amount')
      .isFloat({ gt: 0 })
      .custom((value) => {
        if (Number(value) < MIN_DEPOSIT) throw new Error(`Minimum deposit amount is ₹${MIN_DEPOSIT}`);
        return true;
      }),
    body('paymentMethod').optional().isString().trim(),
    body('gameId').optional().isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { amount, paymentMethod, gameId: gid } = req.body;
    const amt = Number(amount);
    let gameRef;
    if (gid) {
      gameRef = await GameID.findOne({
        _id: gid,
        userId: req.user._id,
        approvalStatus: 'approved',
        status: 'active',
      });
      if (!gameRef) return res.status(400).json({ message: 'Invalid game ID' });
    }
    const pay = getDepositPaymentDisplay();
    const override = await DepositPaymentConfig.findOne().sort({ updatedAt: -1 });
    const payMerged = override
      ? {
          ...pay,
          upiId: override.upiId || pay.upiId,
          payeeName: override.payeeName || pay.payeeName,
          accountNumber: override.accountNumber || pay.accountNumber,
          ifsc: override.ifsc || pay.ifsc,
          bankName: override.bankName || pay.bankName,
          accountHolder: override.accountHolder || pay.accountHolder,
          ...(override.qrImageUrl ? { qrImageUrl: override.qrImageUrl } : {}),
        }
      : pay;
    const referenceCode = genRef();
    const depositExpiresAt = new Date(Date.now() + DEPOSIT_SESSION_MS);
    const upiUri = buildUpiPayUri(amt, referenceCode, payMerged.payeeName, payMerged.upiId);

    const tx = await Transaction.create({
      userId: req.user._id,
      type: 'deposit',
      amount: amt,
      status: 'pending',
      gameId: gameRef?._id,
      paymentMethod: paymentMethod || 'mahadev',
      referenceCode,
      depositExpiresAt,
      depositUpiUri: upiUri,
    });

    return res.status(201).json({
      transaction: tx,
      expiresAt: depositExpiresAt.toISOString(),
      upiUri,
      paymentDetails: payMerged,
    });
  }
);

router.post(
  '/deposit-verify/:id',
  uploadProof.single('proof'),
  [
    param('id').isMongoId(),
    body('utr').trim().notEmpty().isLength({ min: 8, max: 22 }).withMessage('Enter a valid UTR'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.file) {
      return res.status(400).json({ message: 'Payment screenshot is required' });
    }
    const tx = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'deposit',
      status: 'pending',
    });
    if (!tx) {
      return res.status(404).json({ message: 'Deposit request not found' });
    }
    if (tx.proofImage) {
      return res.status(400).json({ message: 'Already submitted' });
    }
    let uploadedUrl;
    try {
      uploadedUrl = await uploadProofToCloudinary(req.file);
    } catch (e) {
      return res.status(500).json({ message: e.message || 'Failed to upload payment screenshot' });
    }
    tx.utr = String(req.body.utr).trim();
    tx.proofImage = uploadedUrl;
    tx.note = [tx.note, `UTR:${tx.utr}`].filter(Boolean).join(' · ');
    await tx.save();
    return res.json({ transaction: tx });
  }
);

router.post(
  '/withdraw-request',
  [
    body('amount')
      .isFloat({ gt: 0 })
      .custom((value, { req }) => {
        const amt = Number(value);
        if (amt < MIN_WITHDRAW) throw new Error(`Minimum withdrawal amount is ₹${MIN_WITHDRAW}`);
        const method = req.body.paymentMethod;
        if (method === 'instant_payout') {
          if (amt < 1000 || amt > 10000) {
            throw new Error('Instant payout amount must be between ₹1000 and ₹10000');
          }
        }
        return true;
      }),
    body('paymentMethod').isIn(['mahadev', 'instant_payout']).withMessage('Invalid payout method'),
    body('bankAccountId').isMongoId().withMessage('Bank account is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { amount, gameId: gid, note, paymentMethod, bankAccountId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.walletBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    const bank = await BankAccount.findOne({ _id: bankAccountId, userId: req.user._id });
    if (!bank) return res.status(400).json({ message: 'Bank account not found' });
    let gameRef;
    if (gid) {
      gameRef = await GameID.findOne({
        _id: gid,
        userId: req.user._id,
        approvalStatus: 'approved',
        status: 'active',
      });
      if (!gameRef) return res.status(400).json({ message: 'Invalid game ID' });
    }
    const tx = await Transaction.create({
      userId: req.user._id,
      type: 'withdraw',
      amount,
      status: 'pending',
      gameId: gameRef?._id,
      note,
      paymentMethod,
      bankAccountId: bank._id,
    });
    return res.status(201).json({ transaction: tx });
  }
);

export default router;
