import crypto from 'crypto';

/** SHA-256 hex digest. Used for claim tokens and image fingerprints. */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Mask a 10-digit Indian phone as 98•••••210. */
export function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 6) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return `${digits.slice(0, 2)}•••••${digits.slice(-3)}`;
}

/** Current time in SQLite's canonical UTC format (sortable/comparable). */
export function sqliteNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** SQLite UTC timestamp `minutes` in the future. */
export function sqliteNowPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

/** Format paise as an Indian-grouped rupee string without the symbol. */
export function formatInr(paise) {
  return (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Parse a value that may be a number or numeric string. */
export function toFiniteNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isUpiOrPhone(destination) {
  if (typeof destination !== 'string') return false;
  const value = destination.trim();
  if (/^[6-9]\d{9}$/.test(value)) return true;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(value);
}
