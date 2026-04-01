import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['deposit', 'withdraw'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameID' },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
    paymentMethod: { type: String, trim: true },
    note: { type: String, trim: true },
    adminNote: { type: String, trim: true },
    /** In-house UPI deposit flow */
    referenceCode: { type: String, trim: true, sparse: true, unique: true },
    depositExpiresAt: { type: Date },
    depositUpiUri: { type: String, trim: true },
    utr: { type: String, trim: true },
    proofImage: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
