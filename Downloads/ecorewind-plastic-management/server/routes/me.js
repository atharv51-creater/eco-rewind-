import { getDb } from '../db.js';
import { getWallet } from '../wallet.js';
import { formatInr } from '../utils.js';
import { isAdmin } from '../middleware/auth.js';

const LABELS = {
  plastic_bottle: 'Plastic bottle',
  aluminium_can: 'Aluminium can',
  plastic_bag: 'Plastic bag',
};

function displayLabel(itemType) {
  return LABELS[itemType] || 'Invalid item';
}

function serializeTransaction(row) {
  return {
    id: String(row.id),
    kind: 'deposit',
    status: 'accepted',
    label: row.item_type,
    display_label: displayLabel(row.item_type),
    confidence: row.confidence ?? 0,
    weight_grams: row.weight_g,
    rate_paise_per_gram:
      row.weight_g > 0 ? Math.round((row.amount_paise / row.weight_g) * 100) / 100 : 0,
    payout_paise: row.amount_paise,
    bonus_paise: 0,
    reason: `${displayLabel(row.item_type)}, ${row.weight_g} g`,
    machine_id: row.kiosk_id,
    user_id: row.user_id,
    created_at: row.created_at,
    // Legacy static-app aliases
    itemType: row.item_type,
    amount_paise: row.amount_paise,
    amountPaise: row.amount_paise,
    amountInr: formatInr(row.amount_paise),
    weight_g: row.weight_g,
    deposit_created: row.created_at,
    formattedTime: row.created_at,
  };
}

export function getMe(req, res) {
  const userId = req.user.userId;
  const db = getDb();

  const wallet = getWallet(userId);
  const userRow = db.prepare('SELECT id, name, phone, email, created_at FROM users WHERE id = ?').get(userId);
  const role = req.user.role || (userRow && isAdmin({ phone: userRow.phone }) ? 'admin' : 'user');

  const statsRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(l.amount_paise), 0) as total_paise,
         COUNT(l.id) as total_transactions,
         COALESCE(SUM(d.weight_g), 0) as total_weight_g,
         COUNT(CASE WHEN d.item_type = 'plastic_bottle' THEN 1 END) as bottles,
         COUNT(CASE WHEN d.item_type = 'aluminium_can' THEN 1 END) as cans,
         COUNT(CASE WHEN d.item_type = 'plastic_bag' THEN 1 END) as bags
       FROM ledger l
       JOIN deposit_sessions d ON l.deposit_session_id = d.id
       WHERE l.user_id = ?`
    )
    .get(userId);

  const transactions = db
    .prepare(
      `SELECT l.id, l.user_id, l.amount_paise, l.created_at,
              d.item_type, d.weight_g, d.kiosk_id, d.confidence
       FROM ledger l
       JOIN deposit_sessions d ON l.deposit_session_id = d.id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 50`
    )
    .all(userId)
    .map(serializeTransaction);

  const totalKg = (statsRow.total_weight_g || 0) / 1000;
  const co2Avoided = totalKg * 1.5;

  res.json({
    userId,
    user: userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          phone: userRow.phone,
          email: userRow.email || '',
          role,
          created_at: userRow.created_at,
        }
      : null,
    role,
    wallet,
    balancePaise: wallet.balance_paise,
    balanceInr: formatInr(wallet.balance_paise),
    availablePaise: wallet.balance_paise,
    lifetimeEarnedPaise: statsRow.total_paise,
    lifetimeEarnedInr: formatInr(statsRow.total_paise),
    kgRecycled: totalKg,
    co2Avoided,
    bottleCount: statsRow.bottles,
    canCount: statsRow.cans,
    bagCount: statsRow.bags,
    totalTransactions: statsRow.total_transactions,
    transactions,
    milestonePaise: 10000,
    milestonePct: Math.min(100, ((statsRow.total_paise || 0) / 10000) * 100),
  });
}

export function getTransactions(req, res) {
  const userId = req.user.userId;
  const db = getDb();

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
  const offset = (page - 1) * limit;

  const count = db.prepare('SELECT COUNT(*) as c FROM ledger WHERE user_id = ?').get(userId).c;

  const transactions = db
    .prepare(
      `SELECT l.id, l.user_id, l.amount_paise, l.created_at,
              d.item_type, d.weight_g, d.kiosk_id, d.confidence
       FROM ledger l
       JOIN deposit_sessions d ON l.deposit_session_id = d.id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset)
    .map(serializeTransaction);

  res.json({
    transactions,
    items: transactions,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
    limit,
    offset,
  });
}
