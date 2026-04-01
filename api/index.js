import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from '../config/db.js';
import authRoutes from '../routes/auth.js';
import userRoutes from '../routes/users.js';
import gameIdRoutes from '../routes/gameIds.js';
import transactionRoutes from '../routes/transactions.js';
import walletRoutes from '../routes/wallet.js';
import bankAccountRoutes from '../routes/bankAccounts.js';
import adminRoutes from '../routes/admin.js';
import exportPublicRoutes from '../routes/exportPublic.js';

const app = express();
const PORT = process.env.PORT || 5000;

const explicitOrigins = [process.env.CLIENT_URL, process.env.ADMIN_URL]
  .map((x) => String(x || '').trim().replace(/\/$/, ''))
  .filter(Boolean);

const extraOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((x) => x.trim().replace(/\/$/, ''))
  .filter(Boolean);

const origins = [...new Set([...explicitOrigins, ...extraOrigins])];

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  const cleanOrigin = String(origin).trim().replace(/\/$/, '');
  const host = (() => {
    try {
      return new URL(cleanOrigin).hostname;
    } catch {
      return '';
    }
  })();
  if (origins.length === 0) return callback(null, true);
  if (origins.includes(cleanOrigin)) return callback(null, true);
  if (host === 'www.mahadev2015.online' || host === 'mahadev2015.online') {
    return callback(null, true);
  }
  try {
    const { hostname } = new URL(cleanOrigin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return callback(null, true);
    }
    // Allow Vercel preview/prod frontend domains.
    if (hostname.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production') {
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)) {
        return callback(null, true);
      }
    }
  } catch {
    /* ignore */
  }
  return callback(new Error('Not allowed by CORS'));
}

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json());

const uploadBase = path.join(__dirname, '../uploads');
try {
  fs.mkdirSync(path.join(uploadBase, 'deposit-proofs'), { recursive: true });
  app.use('/uploads', express.static(uploadBase));
} catch (e) {
  // Serverless platforms can have read-only or missing local paths.
  console.warn('Skipping local uploads static mount:', e.message);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use('/api/export', exportPublicRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/game-ids', gameIdRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

await connectDB();
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
