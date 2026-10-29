import { getDb } from './db.js';

/**
 * Canonical wallet view. Balance is derived from the append-only deposit
 * ledger minus withdrawals that are pending or already paid out.
 */
export function getWallet(userId) {
  const db = getDb();

  const balanceRow = db
    .prepare('SELECT COALESCE(SUM(amount_paise), 0) AS total FROM ledger WHERE user_id = ?')
    .get(userId);

  const withdrawnRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount_paise), 0) AS total FROM withdrawals WHERE user_id = ? AND status IN ('pending','paid')"
    )
    .get(userId);

  const depositRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(d.weight_g), 0) AS grams,
         COUNT(l.id) AS count,
         MIN(l.created_at) AS first_at,
         MAX(l.created_at) AS last_at
       FROM ledger l
       JOIN deposit_sessions d ON l.deposit_session_id = d.id
       WHERE l.user_id = ?`
    )
    .get(userId);

  const lifetime = balanceRow.total;
  return {
    user_id: userId,
    balance_paise: lifetime - withdrawnRow.total,
    total_paid_paise: lifetime,
    total_grams: depositRow.grams,
    accepted_count: depositRow.count,
    rejected_count: 0,
    created_at: depositRow.first_at || null,
    updated_at: depositRow.last_at || null,
  };
}

/** Available balance for spending (never negative). */
export function getAvailableBalance(userId) {
  return Math.max(0, getWallet(userId).balance_paise);
}
