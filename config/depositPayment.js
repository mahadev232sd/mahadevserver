/** Merchant / UPI details shown on deposit QR flow (configure via env). */

export const DEPOSIT_SESSION_MS = (Number(process.env.DEPOSIT_SESSION_MINUTES) || 10) * 60 * 1000;

export function getDepositPaymentDisplay() {
  return {
    upiId: process.env.DEPOSIT_UPI_ID || 'merchant@upi',
    payeeName: process.env.DEPOSIT_UPI_PAYEE_NAME || process.env.DEPOSIT_UPI_NAME || 'Mahadev',
    accountNumber: process.env.DEPOSIT_BANK_ACCOUNT || '—',
    ifsc: process.env.DEPOSIT_IFSC || '—',
    bankName: process.env.DEPOSIT_BANK_NAME || 'Mahadev Pay',
    accountHolder: process.env.DEPOSIT_ACCOUNT_HOLDER || 'Mahadev',
  };
}

export function buildUpiPayUri(amount, referenceCode, payeeName, upiId) {
  const am = Number(amount).toFixed(2);
  const pa = encodeURIComponent(String(upiId).trim());
  const pn = encodeURIComponent(String(payeeName || 'Payee').slice(0, 50));
  const tn = encodeURIComponent(`DEP${referenceCode}`);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}
