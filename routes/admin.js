import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { GameID } from '../models/GameID.js';
import { Transaction } from '../models/Transaction.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { writeAllUsersExcel } from '../utils/writeUsersExcel.js';
import { generatePlatformPassword, generateUniqueId, generateUsername } from '../utils/generateCredentials.js';
import { PLATFORMS } from '../config/platforms.js';

const router = Router();

router.use(requireAuth, requireAdmin);

function strongPlatformPassword(value) {
  const v = String(value || '');
  if (v.length < 8) return false;
  if (!/[a-z]/.test(v)) return false;
  if (!/[A-Z]/.test(v)) return false;
  if (!/\d/.test(v)) return false;
  if (!/[^A-Za-z0-9]/.test(v)) return false;
  return true;
}

router.get('/platforms', (req, res) => {
  return res.json({ platforms: PLATFORMS });
});

router.get('/stats', async (req, res) => {
  const [users, gameIds, pendingDeposits, pendingWithdraws] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    GameID.countDocuments(),
    Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
    Transaction.countDocuments({ type: 'withdraw', status: 'pending' }),
  ]);
  return res.json({ users, gameIds, pendingDeposits, pendingWithdraws });
});

router.get(
  '/users',
  [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 500 })],
  async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      User.find({ role: 'user' }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments({ role: 'user' }),
    ]);
    return res.json({ users: items, total, page, limit });
  }
);

router.get('/users/export', async (req, res) => {
  try {
    await writeAllUsersExcel(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ message: 'Export failed' });
  }
});

router.get('/users/:id', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const user = await User.findById(req.params.id);
  if (!user || user.role !== 'user') return res.status(404).json({ message: 'User not found' });
  return res.json({ user });
});

router.get('/users/:id/game-ids', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const list = await GameID.find({ userId: req.params.id }).sort({ createdAt: -1 });
  return res.json({ gameIds: list });
});

router.post(
  '/users/:id/game-ids',
  [param('id').isMongoId(), body('platformName').trim().notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { platformName } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'user') return res.status(404).json({ message: 'User not found' });
    const platform = PLATFORMS.find((p) => p.name === platformName);
    if (!platform) return res.status(400).json({ message: 'Unknown platform' });
    const existing = await GameID.findOne({ userId: user._id, platformName });
    if (existing && existing.approvalStatus !== 'rejected') {
      return res.status(409).json({ message: 'ID already exists for this platform' });
    }
    if (existing && existing.approvalStatus === 'rejected') {
      await GameID.deleteOne({ _id: existing._id });
    }
    let uniqueId = generateUniqueId();
    for (let i = 0; i < 5; i += 1) {
      const clash = await GameID.findOne({ uniqueId });
      if (!clash) break;
      uniqueId = generateUniqueId();
    }
    const gameId = await GameID.create({
      userId: user._id,
      platformName: platform.name,
      platformUrl: platform.url,
      uniqueId,
      username: generateUsername(),
      password: generatePlatformPassword(),
      status: 'active',
      approvalStatus: 'approved',
      clientName: String(req.body.clientName || '').trim().toLowerCase().slice(0, 6) || '',
    });
    return res.status(201).json({ gameId });
  }
);

router.patch(
  '/users/:id/wallet',
  [param('id').isMongoId(), body('walletBalance').isFloat({ min: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'user') return res.status(404).json({ message: 'User not found' });
    user.walletBalance = req.body.walletBalance;
    await user.save();
    return res.json({ user });
  }
);

router.post(
  '/users/:id/reset-password',
  [param('id').isMongoId(), body('newPassword').isLength({ min: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'user') return res.status(404).json({ message: 'User not found' });
    user.password = req.body.newPassword;
    await user.save();
    return res.json({ message: 'Password updated' });
  }
);

router.get(
  '/game-ids',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('approvalStatus')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Invalid approval filter'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.approvalStatus) {
      filter.approvalStatus = req.query.approvalStatus;
    }
    const [items, total] = await Promise.all([
      GameID.find(filter)
        .populate('userId', 'name email phone walletBalance')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GameID.countDocuments(filter),
    ]);
    return res.json({ gameIds: items, total, page, limit });
  }
);

router.patch(
  '/game-ids/:id/status',
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const doc = await GameID.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    if (doc.approvalStatus !== 'approved') {
      return res.status(400).json({ message: 'Approve the ID before changing status' });
    }
    doc.status = req.body.status;
    await doc.save();
    return res.json({ gameId: doc });
  }
);

router.post(
  '/game-ids/:id/approve',
  [
    param('id').isMongoId(),
    body('uniqueId')
      .trim()
      .notEmpty()
      .isLength({ min: 3, max: 64 })
      .matches(/^[a-zA-Z0-9]+$/)
      .withMessage('Gaming ID must be alphanumeric (no spaces/symbols)'),
    body('password')
      .trim()
      .notEmpty()
      .custom((v) => {
        if (!strongPlatformPassword(v)) {
          throw new Error(
            'Password must be 8+ characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character'
          );
        }
        return true;
      }),
  ],
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const doc = await GameID.findById(req.params.id);
  if (!doc || doc.approvalStatus !== 'pending') {
    return res.status(400).json({ message: 'Not pending' });
  }

  // Admin-provided credentials (no random generation in this flow)
  const uniqueId = String(req.body.uniqueId || '').trim();
  const password = String(req.body.password || '').trim();

  const clash = await GameID.findOne({ uniqueId, _id: { $ne: doc._id } });
  if (clash) return res.status(409).json({ message: 'Gaming ID already exists' });

  doc.uniqueId = uniqueId;
  if (!doc.username || !String(doc.username).trim()) {
    doc.username = generateUsername();
  }
  doc.password = password;
  doc.approvalStatus = 'approved';
  doc.status = 'active';
  await doc.save();
  return res.json({ gameId: doc });
  }
);

router.post('/game-ids/:id/reject', [param('id').isMongoId()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const doc = await GameID.findById(req.params.id);
  if (!doc || doc.approvalStatus !== 'pending') {
    return res.status(400).json({ message: 'Not pending' });
  }
  doc.approvalStatus = 'rejected';
  doc.status = 'inactive';
  doc.uniqueId = `rej-${Date.now()}`;
  doc.username = '';
  doc.password = '';
  await doc.save();
  return res.json({ gameId: doc });
});

router.get('/transactions', async (req, res) => {
  const type = req.query.type;
  const status = req.query.status;
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  const transactions = await Transaction.find(filter)
    .populate('userId', 'name email phone')
    .populate('gameId')
    .populate('bankAccountId', 'bankName accountNumber accountHolderName ifscCode upiId')
    .sort({ createdAt: -1 })
    .limit(500);
  return res.json({ transactions });
});

router.post(
  '/transactions/:id/approve',
  [param('id').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid transaction' });
    }
    const user = await User.findById(tx.userId);
    if (!user) return res.status(400).json({ message: 'User missing' });
    if (tx.type === 'deposit') {
      user.walletBalance += tx.amount;
    } else {
      if (user.walletBalance < tx.amount) {
        return res.status(400).json({ message: 'User balance too low to approve withdrawal' });
      }
      user.walletBalance -= tx.amount;
    }
    tx.status = 'approved';
    tx.adminNote = req.body?.note || tx.adminNote;
    await Promise.all([user.save(), tx.save()]);
    return res.json({ transaction: tx, user });
  }
);

router.post(
  '/transactions/:id/reject',
  [param('id').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid transaction' });
    }
    tx.status = 'rejected';
    tx.adminNote = req.body?.note || tx.adminNote;
    await tx.save();
    return res.json({ transaction: tx });
  }
);

export default router;
