import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { BankAccount } from '../models/BankAccount.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const bankAccounts = await BankAccount.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  return res.json({ bankAccounts });
});

router.post(
  '/',
  [
    body('upiId').trim().notEmpty().withMessage('UPI ID is required'),
    body('bankName').trim().notEmpty().withMessage('Bank name is required'),
    body('accountNumber').trim().notEmpty().withMessage('Account number is required'),
    body('accountHolderName').trim().notEmpty().withMessage('Account holder name is required'),
    body('ifscCode').trim().notEmpty().withMessage('IFSC code is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { upiId, bankName, accountNumber, accountHolderName, ifscCode } = req.body;
    const doc = await BankAccount.create({
      userId: req.user._id,
      upiId,
      bankName,
      accountNumber,
      accountHolderName,
      ifscCode,
    });
    return res.status(201).json({ bankAccount: doc });
  }
);

export default router;
