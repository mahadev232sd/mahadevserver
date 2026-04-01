import mongoose from 'mongoose';
import { GameID } from '../models/GameID.js';

export async function connectDB() {
  const uri = (process.env.MONGODB_URI || process.env.DATABASE_URL)?.trim();
  if (!uri) {
    throw new Error(
      'MONGODB_URI (or DATABASE_URL) is not set or is empty. In server/.env set one line with no line break, e.g. MONGODB_URI=mongodb+srv://user:pass@cluster.../dbname?retryWrites=true&w=majority'
    );
  }
  await mongoose.connect(uri);
  await GameID.updateMany(
    { $or: [{ approvalStatus: { $exists: false } }, { approvalStatus: null }] },
    { $set: { approvalStatus: 'approved' } }
  );
  console.log('MongoDB connected');
}
