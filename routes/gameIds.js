import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { customAlphabet } from 'nanoid';
import { GameID } from '../models/GameID.js';
import { PLATFORMS } from '../config/platforms.js';
import { generateUniqueId, generateUsername, generatePlatformPassword } from '../utils/generateCredentials.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const PLATFORM_USERNAME_RE = /^[a-zA-Z0-9]{1,6}$/;
const genPendingRef = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 14);

function forUserResponse(doc) {
  const g = doc.toObject ? doc.toObject() : { ...doc };
  const appr = g.approvalStatus || 'approved';
  if (g.approvalStatus === 'pending') {
    delete g.password;
    g.uniqueId = '';
    g.credentialsPending = true;
  } else if (g.approvalStatus === 'rejected') {
    delete g.password;
    g.uniqueId = '';
  } else if (appr === 'approved' && g.status === 'inactive') {
    delete g.password;
    g.uniqueId = '';
    g.username = '';
    g.credentialsInactive = true;
  }
  return g;
}

router.get('/platforms', (req, res) => {
  return res.json({ platforms: PLATFORMS });
});

router.get('/', async (req, res) => {
  const ids = await GameID.find({ userId: req.user._id }).sort({ createdAt: -1 });
  return res.json({ gameIds: ids.map((d) => forUserResponse(d)) });
});

router.post(
  '/',
  [body('platformName').trim().notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { platformName } = req.body;
    const requestedUsername = String(req.body.username ?? req.body.clientName ?? '')
      .trim()
      .toLowerCase();
    if (!requestedUsername || !PLATFORM_USERNAME_RE.test(requestedUsername)) {
      return res.status(400).json({ message: 'Username is required (letters & numbers, max 6)' });
    }
    const platform = PLATFORMS.find((p) => p.name === platformName);
    if (!platform) {
      return res.status(400).json({ message: 'Unknown platform' });
    }
    const existing = await GameID.findOne({ userId: req.user._id, platformName });
    if (existing) {
      if (existing.approvalStatus === 'approved') {
        return res.status(409).json({ message: 'ID already created for this platform' });
      }
      if (existing.approvalStatus === 'pending') {
        return res.status(409).json({ message: 'A request is already pending for this platform' });
      }
      if (existing.approvalStatus === 'rejected') {
        existing.username = requestedUsername;
        existing.clientName = '';
        existing.approvalStatus = 'pending';
        existing.status = 'inactive';
        existing.uniqueId = `pend-${genPendingRef()}`;
        existing.password = '';
        await existing.save();
        return res.status(201).json({ gameId: forUserResponse(existing) });
      }
    }
    const gameId = await GameID.create({
      userId: req.user._id,
      platformName: platform.name,
      platformUrl: platform.url,
      uniqueId: `pend-${genPendingRef()}`,
      username: requestedUsername,
      password: '',
      status: 'inactive',
      clientName: '',
      approvalStatus: 'pending',
    });
    return res.status(201).json({ gameId: forUserResponse(gameId) });
  }
);

router.post(
  '/:id/reset-password',
  [param('id').isMongoId()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const doc = await GameID.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Game ID not found' });
    if (doc.approvalStatus !== 'approved') {
      return res.status(400).json({ message: 'ID is not active yet' });
    }
    doc.password = generatePlatformPassword();
    await doc.save();
    return res.json({ gameId: forUserResponse(doc), message: 'Password reset' });
  }
);

function strongPlatformPassword(value) {
  const v = String(value || '');
  if (v.length < 8) return false;
  if (!/[a-z]/.test(v)) return false;
  if (!/[A-Z]/.test(v)) return false;
  if (!/\d/.test(v)) return false;
  if (!/[^A-Za-z0-9]/.test(v)) return false;
  return true;
}

/** Set platform password to a value chosen by the user (validated). */
router.patch(
  '/:id/password',
  [
    param('id').isMongoId(),
    body('newPassword').custom((v) => {
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
    if (!errors.isEmpty()) {
      const first = errors.array()[0];
      return res.status(400).json({ message: first.msg || 'Invalid password', errors: errors.array() });
    }
    const doc = await GameID.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Game ID not found' });
    if (doc.approvalStatus !== 'approved' || doc.status !== 'active') {
      return res.status(400).json({ message: 'ID must be approved and active' });
    }
    doc.password = String(req.body.newPassword);
    await doc.save();
    return res.json({ gameId: forUserResponse(doc), message: 'Password updated' });
  }
);

export default router;
