import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    upiId: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    accountHolderName: { type: String, required: true, trim: true },
    ifscCode: { type: String, required: true, trim: true, uppercase: true },
  },
  { timestamps: true }
);

bankAccountSchema.pre('save', function normalizeIfsc(next) {
  if (this.isModified('ifscCode') && this.ifscCode) {
    this.ifscCode = this.ifscCode.trim().toUpperCase();
  }
  next();
});

export const BankAccount = mongoose.model('BankAccount', bankAccountSchema);
