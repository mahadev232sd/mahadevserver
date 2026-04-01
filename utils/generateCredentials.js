import crypto from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const NUM = '23456789';
const SPECIAL = '@#';

function randomFrom(chars, len) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

/** Unique gaming ID like Md1234L0531 */
export function generateUniqueId() {
  const p1 = randomFrom(UPPER, 1) + randomFrom(LOWER, 1);
  const mid = randomFrom(NUM + LOWER + UPPER, 6);
  const tail = randomFrom(NUM, 4);
  return `${p1}${mid}${tail}`;
}

/** Username for display */
export function generateUsername() {
  return `user_${randomFrom(LOWER + NUM, 8)}`;
}

/** Strong password for platform */
export function generatePlatformPassword() {
  const a = randomFrom(UPPER, 2);
  const b = randomFrom(LOWER, 4);
  const c = randomFrom(NUM, 2);
  const d = randomFrom(SPECIAL, 1);
  const pieces = (a + b + c + d).split('');
  for (let i = pieces.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces.join('');
}
