/** In-memory OTP for phone verification (single-instance dev/small deploy). */
const store = new Map();
const TTL_MS = 5 * 60 * 1000;

export function setOtp(phone, code) {
  store.set(phone, { code: String(code), exp: Date.now() + TTL_MS });
}

export function verifyOtp(phone, code) {
  const key = String(phone);
  const v = store.get(key);
  if (!v) return false;
  if (Date.now() > v.exp) {
    store.delete(key);
    return false;
  }
  if (String(v.code) !== String(code)) return false;
  store.delete(key);
  return true;
}
