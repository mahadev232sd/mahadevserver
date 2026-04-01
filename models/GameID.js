import mongoose from 'mongoose';

const gameIdSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platformName: { type: String, required: true, trim: true },
    platformUrl: { type: String, required: true, trim: true },
    /** Placeholder until admin approves (e.g. pend-xxx); then real gaming ID */
    uniqueId: { type: String, required: true, trim: true, default: '' },
    /** User-chosen login name while pending; kept after approve unless empty */
    username: { type: String, trim: true, lowercase: true, default: '' },
    /** Filled when admin approves */
    password: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    /** User-submitted label (max 6 chars) */
    clientName: { type: String, trim: true, lowercase: true, maxlength: 6, default: '' },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
  },
  { timestamps: true }
);

gameIdSchema.index({ userId: 1, platformName: 1 }, { unique: true });

export const GameID = mongoose.model('GameID', gameIdSchema);
