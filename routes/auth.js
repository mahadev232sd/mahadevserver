import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { User, DEFAULT_SIGNUP_WALLET_BALANCE } from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { normalizePhone } from '../utils/phone.js';
import { setOtp, verifyOtp } from '../utils/otpStore.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9]{1,6}$/;

router.post(
  '/send-otp',
  [body('phone').trim().notEmpty().withMessage('Phone is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const phone = normalizePhone(req.body.phone);
    if (phone.length !== 10) {
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    setOtp(phone, code);
    const payload = { message: 'OTP sent successfully' };
    if (process.env.NODE_ENV !== 'production' || String(process.env.ALLOW_DEV_OTP || '') === 'true') {
      payload.devOtp = code;
    }
    return res.json(payload);
  }
);

router.post(
  '/send-login-otp',
  [body('phone').trim().notEmpty().withMessage('Phone is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const phone = normalizePhone(req.body.phone);
    if (phone.length !== 10) {
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    }
    const user = await User.findOne({ phone, role: 'user' });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this phone number' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    setOtp(phone, code);
    const payload = { message: 'OTP sent successfully' };
    if (process.env.NODE_ENV !== 'production' || String(process.env.ALLOW_DEV_OTP || '') === 'true') {
      payload.devOtp = code;
    }
    return res.json(payload);
  }
);

router.post(
  '/register',
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ max: 6 })
      .withMessage('Username max 6 characters')
      .matches(USERNAME_RE)
      .withMessage('Only letters and numbers allowed'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('phone').trim().notEmpty(),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const username = String(req.body.username).trim().toLowerCase();
    const password = req.body.password;
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp).trim();

    if (phone.length !== 10) {
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    }
    if (!verifyOtp(phone, otp)) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    try {
      const existsUser = await User.findOne({
        $or: [{ username }, { phone }],
      });
      if (existsUser) {
        return res.status(409).json({ message: 'Username or phone already registered' });
      }
      const user = await User.create({
        name: username,
        username,
        phone,
        password,
        walletBalance: DEFAULT_SIGNUP_WALLET_BALANCE,
      });
      const token = signToken({ sub: user._id.toString(), role: user.role });
      return res.status(201).json({ user, token });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: 'Username or phone already taken' });
      }
      return res.status(500).json({ message: e.message || 'Registration failed' });
    }
  }
);

router.post(
  '/login-otp',
  [body('phone').trim().notEmpty(), body('otp').trim().notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp).trim();
    if (phone.length !== 10) {
      return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    }
    if (!verifyOtp(phone, otp)) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    const user = await User.findOne({ phone, role: 'user' });
    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }
    const token = signToken({ sub: user._id.toString(), role: user.role });
    return res.json({ user, token });
  }
);

router.post(
  '/login',
  [
    body('password').notEmpty(),
    body('identifier').optional().trim(),
    body('email').optional({ checkFalsy: true }).trim().isEmail(),
    body('phone').optional({ checkFalsy: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { password } = req.body;
    const identifier = String(req.body.identifier ?? '').trim();
    const emailTrim =
      req.body.email != null && String(req.body.email).trim()
        ? String(req.body.email).trim().toLowerCase()
        : '';
    if (!identifier && !emailTrim && !req.body.phone) {
      return res.status(400).json({ message: 'Enter phone number, username, or email' });
    }

    let user;

    if (identifier) {
      const id = identifier.trim();
      if (id.includes('@')) {
        user = await User.findOne({ email: id.toLowerCase() });
      } else {
        const digits = id.replace(/\D/g, '');
        if (digits.length >= 10) {
          user = await User.findOne({ phone: normalizePhone(id) });
        }
        if (!user) {
          user = await User.findOne({ username: id.toLowerCase() });
        }
      }
    } else if (emailTrim) {
      user = await User.findOne({ email: emailTrim });
    } else if (req.body.phone) {
      user = await User.findOne({ phone: normalizePhone(req.body.phone) });
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = signToken({ sub: user._id.toString(), role: user.role });
    return res.json({ user, token });
  }
);

router.post(
  '/forgot-password',
  [body('email').optional({ checkFalsy: true }).isEmail(), body('phone').optional({ checkFalsy: true })],
  async (req, res) => {
    const { email, phone } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ message: 'Email or phone is required' });
    }
    const user = await User.findOne(email ? { email: email.toLowerCase() } : { phone: normalizePhone(phone) });
    if (!user) {
      return res.json({ message: 'If an account exists, reset instructions will be sent.' });
    }
    const raw = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(raw).digest('hex');
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    return res.json({
      message: 'Use the reset token with /auth/reset-password within 1 hour.',
      resetToken: raw,
    });
  }
);

router.post(
  '/reset-password',
  [body('resetToken').notEmpty(), body('newPassword').isLength({ min: 8 }).withMessage('Password min 8 chars')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const hashed = crypto.createHash('sha256').update(req.body.resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpire: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    user.password = req.body.newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    return res.json({ message: 'Password updated. You can log in now.' });
  }
);

export default router;
