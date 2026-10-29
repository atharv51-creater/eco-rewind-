import { getDb, audit } from '../db.js';
import { getWallet } from '../wallet.js';
import { MIN_WITHDRAWAL_PAISE } from '../config.js';
import { isUpiOrPhone, toFiniteNumber } from '../utils.js';

function toWithdrawal(row) {
  return {
    id: String(row.id),
    user_id: row.user_id,
    amount_paise: row.amount_paise,
    destination: row.destination,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createWithdrawal(req, res) {
  const db = getDb();
  const userId = req.targetUserId || req.params.userId;
  const amountPaise = toFiniteNumber(req.body?.amountPaise ?? req.body?.amount_paise);
  const destination = String(req.body?.destination ?? req.body?.upiId ?? '').trim();
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey || null;

  if (amountPaise == null || !Number.isInteger(amountPaise) || amountPaise < MIN_WITHDRAWAL_PAISE) {
    return res.status(400).json({
      error: 'invalid_amount',
      message: `Minimum withdrawal is ${MIN_WITHDRAWAL_PAISE} paise`,
    });
  }
  if (!isUpiOrPhone(destination)) {
    return res.status(400).json({ error: 'invalid_destination', message: 'Enter a valid UPI ID or mobile number' });
  }

  if (idempotencyKey) {
    const existing = db
      .prepare('SELECT * FROM withdrawals WHERE user_id = ? AND idempotency_key = ?')
      .get(userId, idempotencyKey);
    if (existing) {
      return res.json({
        duplicate: true,
        withdrawal: toWithdrawal(existing),
        wallet: getWallet(userId),
      });
    }
  }

  const available = getWallet(userId).balance_paise;
  if (amountPaise > available) {
    return res.status(409).json({
      error: 'insufficient_funds',
      message: 'Withdrawal exceeds available balance',
      availablePaise: available,
    });
  }

  try {
    const info = db
      .prepare(
        'INSERT INTO withdrawals (user_id, amount_paise, destination, status, idempotency_key) VALUES (?, ?, ?, \'pending\', ?)'
      )
      .run(userId, amountPaise, destination, idempotencyKey);
    const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({
      duplicate: false,
      withdrawal: toWithdrawal(row),
      wallet: getWallet(userId),
    });
  } catch (err) {
    if (String(err?.code || '').includes('SQLITE_CONSTRAINT') && idempotencyKey) {
      const existing = db
        .prepare('SELECT * FROM withdrawals WHERE user_id = ? AND idempotency_key = ?')
        .get(userId, idempotencyKey);
      if (existing) {
        return res.json({
          duplicate: true,
          withdrawal: toWithdrawal(existing),
          wallet: getWallet(userId),
        });
      }
    }
    console.error('[withdrawals] create failed:', err.message);
    return res.status(500).json({ error: 'withdrawal_failed' });
  }
}

export function listWithdrawals(req, res) {
  const db = getDb();
  const userId = req.targetUserId || req.params.userId;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const total = db.prepare('SELECT COUNT(*) AS c FROM withdrawals WHERE user_id = ?').get(userId).c;
  const items = db
    .prepare(
      'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
    )
    .all(userId, limit, offset)
    .map(toWithdrawal);

  return res.json({ items, total, limit, offset });
}

export function listAllWithdrawals(req, res) {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const status = req.query.status;

  const where = status && ['pending', 'paid', 'cancelled'].includes(status) ? 'WHERE status = ?' : '';
  const params = where ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) AS c FROM withdrawals ${where}`).get(...params).c;
  const items = db
    .prepare(
      `SELECT * FROM withdrawals ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)
    .map(toWithdrawal);

  return res.json({ items, total, limit, offset });
}

function transition(req, res, nextStatus, action) {
  const db = getDb();
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  if (row.status === nextStatus) {
    return res.json({
      duplicate: true,
      withdrawal: toWithdrawal(row),
      wallet: getWallet(row.user_id),
    });
  }
  if (row.status !== 'pending') {
    return res.status(409).json({ error: 'invalid_state', status: row.status });
  }

  db.prepare("UPDATE withdrawals SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    nextStatus,
    id
  );
  const updated = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
  audit(req.user.userId, action, `withdrawal:${id}`, {
    userId: row.user_id,
    amountPaise: row.amount_paise,
    destination: row.destination,
  });

  return res.json({
    duplicate: false,
    withdrawal: toWithdrawal(updated),
    wallet: getWallet(row.user_id),
  });
}

export function completeWithdrawal(req, res) {
  return transition(req, res, 'paid', 'withdrawal.complete');
}

export function cancelWithdrawal(req, res) {
  return transition(req, res, 'cancelled', 'withdrawal.cancel');
}
