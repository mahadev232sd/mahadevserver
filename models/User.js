import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/** New signups get this balance (also set explicitly in auth register so it always applies). */
export const DEFAULT_SIGNUP_WALLET_BALANCE = 0;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Login handle: max 6 chars, alphanumeric (lowercase in DB). */
    username: { type: String, trim: true, lowercase: true, sparse: true, maxlength: 6 },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 8 },
    walletBalance: { type: Number, default: DEFAULT_SIGNUP_WALLET_BALANCE, min: 0 },
    branch: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  return obj;
};

export const User = mongoose.model('User', userSchema);
