import ExcelJS from 'exceljs';
import { User } from '../models/User.js';

/** Writes all role=user rows to an .xlsx download response. */
export async function writeAllUsersExcel(res) {
  const users = await User.find({ role: 'user' }).sort({ createdAt: -1 }).lean();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MAHADEV Admin';
  const sheet = workbook.addWorksheet('Users');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Wallet (₹)', key: 'walletBalance', width: 12 },
    { header: 'Branch', key: 'branch', width: 16 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Mongo User ID', key: 'userId', width: 28 },
    { header: 'Registered', key: 'createdAt', width: 22 },
  ];
  users.forEach((u) => {
    sheet.addRow({
      name: u.name,
      email: u.email || '',
      phone: u.phone || '',
      walletBalance: u.walletBalance ?? 0,
      branch: u.branch || '',
      city: u.city || '',
      userId: u._id.toString(),
      createdAt: u.createdAt ? new Date(u.createdAt).toLocaleString('en-IN') : '',
    });
  });
  sheet.getRow(1).font = { bold: true };
  const filename = `mahadev-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}
