import { getDb } from '../db.js';
import { getRates } from '../db.js';
import { evaluate } from '../evaluate.js';
import crypto from 'crypto';
import { KIOSK_NAME, TOKEN_TTL_MINUTES } from '../config.js';
import { sha256, sqliteNowPlusMinutes, formatInr, maskPhone, toFiniteNumber } from '../utils.js';

export function resolveClaimUrl(req, token) {
  if (!token) return null;
  if (process.env.PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL.includes('localhost')) {
    return `${process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/app/claim/${token}`;
  }
  if (req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) {
      return `${proto}://${host}/app/claim/${token}`;
    }
  }
  return `/app/claim/${token}`;
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeItem(body) {
  return body?.itemType ?? body?.item_type ?? body?.label ?? null;
}

function normalizeWeight(body) {
  return toFiniteNumber(body?.weightGrams ?? body?.weight_grams ?? body?.weight_g);
}

function publicSession(row) {
  return {
    sessionId: row.id,
    amountPaise: row.amount_paise,
    amountInr: formatInr(row.amount_paise),
    itemType: row.item_type,
    weightGrams: row.weight_g,
    expiresAt: row.expires_at,
    status: row.status,
  };
}

/**
 * Create a QR reward session for a physical kiosk deposit.
 * The payout is always computed here from server-side tariff data.
 */
export function createDeposit(req, res) {
  const db = getDb();
  const body = req.body || {};
  const itemType = normalizeItem(body);
  const weightGrams = normalizeWeight(body);
  const confidence = toFiniteNumber(body?.confidence ?? body?.confidence_score);
  const kioskId = req.kioskId || KIOSK_NAME;
  const idempotencyKey = req.get('Idempotency-Key') || body?.idempotencyKey || null;

  const rates = getRates();
  if (!rates.accepted_classes.includes(itemType)) {
    return res.status(400).json({
      error: 'item_not_accepted',
      message: 'Item type not accepted',
    });
  }

  if (weightGrams == null || weightGrams <= 0) {
    return res.status(400).json({
      error: 'invalid_weight',
      message: 'A positive weight reading is required',
    });
  }

  const grams = Math.round(weightGrams);
  const validation = evaluate(itemType, grams, rates);
  if (!validation.ok) {
    return res.status(400).json({
      error: validation.code === 'LOW_DENSITY' ? 'low_density' : 'rejected',
      code: validation.code,
      message: validation.message,
    });
  }

  const amountPaise = validation.paise;

  if (idempotencyKey) {
    const existing = db
      .prepare(
        'SELECT * FROM deposit_sessions WHERE kiosk_id = ? AND idempotency_key = ?'
      )
      .get(kioskId, idempotencyKey);
    if (existing) {
      if (existing.status === 'pending') {
        // Rotate the claim token so the latest kiosk response always works.
        const token = makeToken();
        const tokenHash = sha256(token);
        const expiresAt = sqliteNowPlusMinutes(TOKEN_TTL_MINUTES);
        db.prepare(
          "UPDATE deposit_sessions SET token = ?, token_hash = ?, expires_at = ? WHERE id = ?"
        ).run(tokenHash, tokenHash, expiresAt, existing.id);
        return res.json({
          ...publicSession({ ...existing, expires_at: expiresAt }),
          token,
          claimUrl: resolveClaimUrl(req, token),
          claimPath: `/app/claim/${token}`,
          duplicate: true,
        });
      }
      return res.json({
        ...publicSession(existing),
        duplicate: true,
        token: null,
      });
    }
  }

  const token = makeToken();
  const tokenHash = sha256(token);
  const expiresAt = sqliteNowPlusMinutes(TOKEN_TTL_MINUTES);
  const sessionId = crypto.randomBytes(16).toString('hex');

  try {
    db.prepare(`
      INSERT INTO deposit_sessions
        (id, token, token_hash, kiosk_id, item_type, weight_g, amount_paise, status,
         created_at, expires_at, predicted_label, confidence, idempotency_key, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?, ?, ?, ?, 'trusted_kiosk')
    `).run(
      sessionId,
      tokenHash,
      tokenHash,
      kioskId,
      itemType,
      grams,
      amountPaise,
      expiresAt,
      itemType,
      confidence == null ? null : Math.max(0, Math.min(1, confidence)),
      idempotencyKey
    );

    return res.json({
      sessionId,
      token,
      claimUrl: resolveClaimUrl(req, token),
      claimPath: `/app/claim/${token}`,
      amountPaise,
      amountInr: formatInr(amountPaise),
      itemType,
      weightGrams: grams,
      basePaise: validation.basePaise,
      bonusPaise: validation.bonusPaise,
      expiresAt,
      confidence,
    });
  } catch (err) {
    // Unique constraint on (kiosk_id, idempotency_key): return the winner.
    if (String(err?.code || '').includes('SQLITE_CONSTRAINT')) {
      const existing = db
        .prepare('SELECT * FROM deposit_sessions WHERE kiosk_id = ? AND idempotency_key = ?')
        .get(kioskId, idempotencyKey);
      if (existing) {
        return res.json({ ...publicSession(existing), duplicate: true, token: null });
      }
    }
    console.error('[kiosk] deposit failed:', err.message);
    return res.status(500).json({ error: 'deposit_failed' });
  }
}

export function getDepositStatus(req, res) {
  const { id } = req.params;
  const session = getDb()
    .prepare(
      `SELECT d.id, d.status, d.claimed_by, d.amount_paise, d.item_type, d.weight_g,
              d.created_at, d.expires_at, d.claimed_at, u.phone AS claimer_phone
       FROM deposit_sessions d
       LEFT JOIN users u ON u.id = d.claimed_by
       WHERE d.id = ?`
    )
    .get(id);

  if (!session) {
    return res.status(404).json({ error: 'not_found' });
  }

  return res.json({
    id: session.id,
    status: session.status,
    amountPaise: session.amount_paise,
    amountInr: formatInr(session.amount_paise),
    itemType: session.item_type,
    weightGrams: session.weight_g,
    claimerInfo: session.status === 'claimed' ? maskPhone(session.claimer_phone) : null,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
  });
}
