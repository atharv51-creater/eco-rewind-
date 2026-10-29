import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDb } from '../db.js';
import {
  JWT_SECRET,
  KIOSK_API_KEY,
  KIOSK_API_KEY_HASH,
  ADMIN_PHONES,
  IS_PRODUCTION,
} from '../config.js';
import { sqliteNow } from '../utils.js';

function readToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.cookies?.session || null;
}

export function authMiddleware(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'unauthenticated' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

/** Populates req.user when a valid token is present, but never blocks. */
export function optionalAuthMiddleware(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // Ignore invalid tokens for optional auth.
    }
  }
  return next();
}

export function isAdmin(user) {
  if (!user) return false;
  return user.role === 'admin' || ADMIN_PHONES.includes(user.phone);
}

/**
 * Accept either an internal user id or a phone number and return the canonical
 * ledger id. This keeps the mobile app (which keys on phone) in sync with the
 * QR claim flow (which keys on user id).
 */
export function resolveUserId(identifier) {
  if (!identifier) return identifier;
  const db = getDb();
  const byPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(String(identifier));
  return byPhone?.id || String(identifier);
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
  return next();
}

/** Allow the owner of `param` (default userId) or an admin. */
export function requireSelfOrAdmin(param = 'userId') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    const rawTarget = req.params[param];
    const target = rawTarget === 'me' ? req.user.userId : resolveUserId(rawTarget);
    req.targetUserId = target;
    if (
      isAdmin(req.user) ||
      req.user.userId === target ||
      req.user.phone === req.params[param] ||
      req.params[param] === 'me'
    ) {
      return next();
    }
    return res.status(403).json({ error: 'forbidden' });
  };
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authenticates a physical kiosk. Accepts a plain key (dev) or a bcrypt hash
 * stored against a kiosk row. Sets req.kioskId and refreshes last_seen.
 */
export async function kioskAuthMiddleware(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers['x-kiosk-key'];
  if (!key || typeof key !== 'string') {
    return res.status(401).json({ error: 'missing_kiosk_key' });
  }

  // In production the shared default demo key is never accepted.
  if (IS_PRODUCTION && key === 'rvm-key-2024') {
    return res.status(401).json({ error: 'invalid_kiosk_key' });
  }

  try {
    const db = getDb();

    if (KIOSK_API_KEY && timingSafeEqual(key, KIOSK_API_KEY)) {
      const kiosk = db.prepare('SELECT id FROM kiosks ORDER BY created_at LIMIT 1').get();
      req.kioskId = kiosk?.id || 'RVM-01';
      db.prepare("UPDATE kiosks SET last_seen = ?, status = 'online' WHERE id = ?").run(
        sqliteNow(),
        req.kioskId
      );
      return next();
    }

    const kiosks = db.prepare('SELECT id, api_key_hash FROM kiosks').all();
    for (const kiosk of kiosks) {
      if (!kiosk.api_key_hash) continue;
      let match = false;
      try {
        match = await bcrypt.compare(key, kiosk.api_key_hash);
      } catch {
        match = false;
      }
      if (match) {
        req.kioskId = kiosk.id;
        db.prepare("UPDATE kiosks SET last_seen = ?, status = 'online' WHERE id = ?").run(
          sqliteNow(),
          kiosk.id
        );
        return next();
      }
    }

    // Optional env-provided hash fallback.
    if (KIOSK_API_KEY_HASH) {
      try {
        if (await bcrypt.compare(key, KIOSK_API_KEY_HASH)) {
          req.kioskId = 'RVM-01';
          return next();
        }
      } catch {
        // fall through
      }
    }
  } catch {
    return res.status(500).json({ error: 'kiosk_auth_failed' });
  }

  return res.status(401).json({ error: 'invalid_kiosk_key' });
}

export function rateLimitMiddleware(limit = 100, windowMs = 60 * 1000) {
  const attempts = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    const userAttempts = attempts.get(ip) || [];
    const recent = userAttempts.filter((t) => t > windowStart);
    if (recent.length >= limit) {
      return res.status(429).json({ error: 'too_many_requests' });
    }
    recent.push(now);
    attempts.set(ip, recent);
    return next();
  };
}
