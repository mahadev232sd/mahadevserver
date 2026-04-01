import mongoose from 'mongoose';

const depositPaymentConfigSchema = new mongoose.Schema(
  {
    upiId: { type: String, trim: true, default: '' },
    payeeName: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
    ifsc: { type: String, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    accountHolder: { type: String, trim: true, default: '' },
    /** Optional uploaded QR image (shown to users instead of generated QR) */
    qrImageUrl: { type: String, trim: true, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const DepositPaymentConfig = mongoose.model('DepositPaymentConfig', depositPaymentConfigSchema);

