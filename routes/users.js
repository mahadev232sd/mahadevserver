import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/me', async (req, res) => {
  const user = await User.findById(req.user._id);
  return res.json({ user });
});

router.patch(
  '/me',
  [
    body('name').optional().trim().notEmpty(),
    body('branch').optional().isString(),
    body('city').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Not found' });
    if (req.body.name) user.name = req.body.name;
    if (req.body.branch !== undefined) user.branch = String(req.body.branch).trim();
    if (req.body.city !== undefined) user.city = String(req.body.city).trim();
    await user.save();
    return res.json({ user });
  }
);

export default router;
