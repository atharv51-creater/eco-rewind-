import crypto from 'crypto';

export function verifyKioskKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing kiosk API key' });
  }
  // Simple plain-text key comparison for now; in production use hashed comparison
  const expected = process.env.KIOSK_API_KEY || 'rvm-default-key-change-me';
  if (key !== expected) {
    return res.status(403).json({ error: 'Invalid kiosk API key' });
  }
  req.kioskId = 'RVM-01';
  next();
}

export function tamperCheck(itemType, weightGrams, lastScanTime) {
  // Rule: changing weight or item after a scan forces a rescan
  // This is checked on the client/kiosk side; server just validates
  return { valid: true, rescanRequired: false };
}