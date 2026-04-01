/** Normalize to last 10 digits (India-style mobile). */
export function normalizePhone(input) {
  const d = String(input || '').replace(/\D/g, '');
  if (d.length >= 10) return d.slice(-10);
  return d;
}
