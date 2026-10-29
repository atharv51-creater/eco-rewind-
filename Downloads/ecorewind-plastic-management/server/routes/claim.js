import { getDb } from '../db.js';
import { getWallet } from '../wallet.js';
import { sha256, formatInr, maskPhone } from '../utils.js';

const ITEM_LABELS = {
  plastic_bottle: 'Plastic bottle',
  aluminium_can: 'Aluminium can',
  plastic_bag: 'Plastic bag',
  other_invalid: 'Invalid item',
};

/**
 * Retrieve public metadata for a claim token without authentication.
 * Safe to call when a mobile camera scans the QR code.
 */
export function getClaimDetails(req, res) {
  const { token } = req.params;
  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.status(404).json({ error: 'invalid_token', status: 'invalid' });
  }

  const db = getDb();
  const tokenHash = sha256(token);

  const session =
    db.prepare(`
      SELECT d.id, d.status, d.amount_paise, d.item_type, d.weight_g,
             d.created_at, d.expires_at, d.claimed_at, d.kiosk_id,
             u.phone AS claimer_phone
      FROM deposit_sessions d
      LEFT JOIN users u ON u.id = d.claimed_by
      WHERE d.token_hash = ?
    `).get(tokenHash) ||
    db.prepare(`
      SELECT d.id, d.status, d.amount_paise, d.item_type, d.weight_g,
             d.created_at, d.expires_at, d.claimed_at, d.kiosk_id,
             u.phone AS claimer_phone
      FROM deposit_sessions d
      LEFT JOIN users u ON u.id = d.claimed_by
      WHERE d.token = ? AND d.token_hash IS NULL
    `).get(token);

  if (!session) {
    return res.status(404).json({ error: 'invalid_token', status: 'invalid' });
  }

  let status = session.status;
  const expiresAtMs = Date.parse(String(session.expires_at).replace(' ', 'T') + 'Z');
  if (status === 'pending' && Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
    db.prepare(
      "UPDATE deposit_sessions SET status = 'expired' WHERE id = ? AND status = 'pending'"
    ).run(session.id);
    status = 'expired';
  }

  return res.json({
    id: session.id,
    sessionId: session.id,
    status,
    itemType: session.item_type,
    displayLabel: ITEM_LABELS[session.item_type] || session.item_type,
    weightGrams: session.weight_g,
    amountPaise: session.amount_paise,
    amountInr: formatInr(session.amount_paise),
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    claimedAt: session.claimed_at,
    kioskId: session.kiosk_id,
    claimerInfo: status === 'claimed' ? maskPhone(session.claimer_phone) : null,
  });
}

/**
 * Atomically claim a QR reward. Tokens are stored only as SHA-256 hashes.
 * The conditional UPDATE guarantees a single claim even under concurrency.
 */
export function claimDeposit(req, res) {
  const { token } = req.params;
  const userId = req.user?.userId;

  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.status(404).json({ error: 'invalid_token' });
  }

  const db = getDb();
  const tokenHash = sha256(token);

  // New rows store the hash in token_hash; legacy rows stored plaintext in token.
  // The legacy fallback only applies when token_hash is NULL, so a leaked hash
  // can never be replayed as if it were the original token.
  const session =
    db.prepare('SELECT * FROM deposit_sessions WHERE token_hash = ?').get(tokenHash) ||
    db
      .prepare('SELECT * FROM deposit_sessions WHERE token = ? AND token_hash IS NULL')
      .get(token);

  if (!session) {
    return res.status(404).json({ error: 'invalid_token' });
  }

  if (session.status === 'claimed') {
    return res.status(409).json({ error: 'already_claimed' });
  }

  if (session.status === 'expired') {
    return res.status(410).json({ error: 'expired' });
  }

  // Fast expiry check (works for both SQLite and ISO timestamps).
  const expiresAtMs = Date.parse(String(session.expires_at).replace(' ', 'T') + 'Z');
  if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
    db.prepare(
      "UPDATE deposit_sessions SET status = 'expired' WHERE id = ? AND status = 'pending'"
    ).run(session.id);
    return res.status(410).json({ error: 'expired' });
  }

  const claimTxn = db.transaction(() => {
    const claimedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const update = db
      .prepare(
        `UPDATE deposit_sessions
         SET status = 'claimed', claimed_by = ?, claimed_at = ?
         WHERE id = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')`
      )
      .run(userId, claimedAt, session.id);

    if (update.changes !== 1) {
      const current = db
        .prepare('SELECT status, expires_at FROM deposit_sessions WHERE id = ?')
        .get(session.id);
      if (current?.status === 'claimed') {
        const err = new Error('already_claimed');
        err.code = 'ALREADY_CLAIMED';
        throw err;
      }
      const err = new Error('expired');
      err.code = 'EXPIRED';
      throw err;
    }

    db.prepare(
      'INSERT INTO ledger (user_id, deposit_session_id, amount_paise) VALUES (?, ?, ?)'
    ).run(userId, session.id, session.amount_paise);

    return { claimedAt };
  });

  try {
    const result = claimTxn();
    const wallet = getWallet(userId);
    return res.json({
      success: true,
      amountPaise: session.amount_paise,
      amountInr: formatInr(session.amount_paise),
      claimedAt: result.claimedAt,
      walletBalancePaise: wallet.balance_paise,
      transactionId: session.id,
      sessionId: session.id,
      itemType: session.item_type,
      weightGrams: session.weight_g,
    });
  } catch (err) {
    if (err.code === 'ALREADY_CLAIMED') {
      return res.status(409).json({ error: 'already_claimed' });
    }
    if (err.code === 'EXPIRED') {
      return res.status(410).json({ error: 'expired' });
    }
    if (String(err?.code || '').includes('SQLITE_CONSTRAINT')) {
      // Ledger uniqueness: another request won the race.
      return res.status(409).json({ error: 'already_claimed' });
    }
    console.error('[claim] failed:', err.message);
    return res.status(500).json({ error: 'claim_failed' });
  }
}

