import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { Transaction } from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  [
    query('status').optional().isIn(['pending', 'approved', 'rejected']),
    query('type').optional().isIn(['deposit', 'withdraw']),
    query('minAmount').optional().isFloat({ min: 0 }),
    query('maxAmount').optional().isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const filter = { userId: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    const minA =
      req.query.minAmount !== undefined && req.query.minAmount !== ''
        ? Number(req.query.minAmount)
        : null;
    const maxA =
      req.query.maxAmount !== undefined && req.query.maxAmount !== ''
        ? Number(req.query.maxAmount)
        : null;
    if ((minA != null && !Number.isNaN(minA)) || (maxA != null && !Number.isNaN(maxA))) {
      filter.amount = {};
      if (minA != null && !Number.isNaN(minA)) filter.amount.$gte = minA;
      if (maxA != null && !Number.isNaN(maxA)) filter.amount.$lte = maxA;
    }
    const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).limit(500);
    return res.json({ transactions });
  }
);

export default router;
