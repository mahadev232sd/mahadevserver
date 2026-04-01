/**
 * Creates or updates the default admin user (role: admin).
 *
 * Defaults (if ADMIN_EMAIL / ADMIN_PASSWORD not set in server/.env):
 *   Email (login ID): admin@mahadev.local
 *   Password:          Admin123!
 *
 * Run from server folder: npm run seed-admin
 * Requires MONGODB_URI or DATABASE_URL in server/.env
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const uri = (process.env.MONGODB_URI || process.env.DATABASE_URL)?.trim();
  if (!uri) {
    console.error('Set MONGODB_URI or DATABASE_URL in server/.env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const email = (process.env.ADMIN_EMAIL || 'admin@mahadev.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  let admin = await User.findOne({ email });
  if (admin) {
    admin.role = 'admin';
    admin.password = password;
    await admin.save();
    console.log('Updated existing user to admin:', email);
  } else {
    admin = await User.create({
      name: 'Admin',
      email,
      password,
      role: 'admin',
      walletBalance: 0,
    });
    console.log('Created admin:', email);
  }
  await mongoose.disconnect();

  console.log('\n--- Admin login (admin panel) ---');
  console.log('  Email (ID):', email);
  console.log('  Password: ', password);
  console.log('  Override via ADMIN_EMAIL / ADMIN_PASSWORD in server/.env');
  console.log('---\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
