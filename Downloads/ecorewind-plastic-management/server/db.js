import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { DEFAULT_RATES, KIOSK_API_KEY_HASH, validateRates } from './config.js';

const DB_DIR = path.resolve(process.cwd(), 'database');
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DB_DIR, 'ecorewind.db');

let db = null;

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumn(table, column, definition) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDefaults() {
  // Tariff is stored in the DB so admin changes take effect immediately.
  const existingRates = db.prepare("SELECT value FROM settings WHERE key = 'rates'").get();
  if (!existingRates) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('rates', ?)").run(
      JSON.stringify(DEFAULT_RATES)
    );
  }

  // Seed the demo kiosk with a valid bcrypt hash.
  const existing = db.prepare('SELECT id FROM kiosks WHERE id = ?').get('RVM-01');
  if (!existing) {
    db.prepare(
      'INSERT INTO kiosks (id, name, location, api_key_hash) VALUES (?, ?, ?, ?)'
    ).run('RVM-01', 'RVM-01', 'kiosk-location', KIOSK_API_KEY_HASH);
  }

  // Seed demo user accounts if they do not exist (skip during automated test runs)
  if (process.env.NODE_ENV !== 'test') {
    const demoUsers = [
      {
        id: 'user-demo-user',
        name: 'EcoRewind Demo User',
        phone: '9876543210',
        email: 'user@ecorewind.com',
      },
      {
        id: 'user-demo-admin',
        name: 'EcoRewind Demo Admin',
        phone: '9811122233',
        email: 'admin@ecorewind.com',
      },
    ];

    for (const u of demoUsers) {
      const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(u.phone);
      if (!exists) {
        const passwordHash = bcrypt.hashSync('password123', 10);
        db.prepare(
          'INSERT INTO users (id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?)'
        ).run(u.id, u.name, u.phone, u.email, passwordHash);
      }
    }
  }
}

export function initDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kiosks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      api_key_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deposit_sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      kiosk_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      weight_g INTEGER NOT NULL,
      amount_paise INTEGER NOT NULL,
      status TEXT CHECK(status IN ('pending','claimed','expired')) DEFAULT 'pending',
      claimed_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      claimed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      deposit_session_id TEXT UNIQUE NOT NULL,
      amount_paise INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      destination TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending','paid','cancelled')) DEFAULT 'pending',
      idempotency_key TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deposit_sessions_token ON deposit_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_deposit_sessions_status ON deposit_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_session ON ledger(deposit_session_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
  `);

  // --- Forward-only migrations for existing databases ---
  addColumn('users', 'email', 'TEXT');
  addColumn('deposit_sessions', 'token_hash', 'TEXT');
  addColumn('deposit_sessions', 'image_sha256', 'TEXT');
  addColumn('deposit_sessions', 'predicted_label', 'TEXT');
  addColumn('deposit_sessions', 'confidence', 'REAL');
  addColumn('deposit_sessions', 'idempotency_key', 'TEXT');
  addColumn('deposit_sessions', 'source', 'TEXT');
  addColumn('kiosks', 'last_seen', 'TEXT');
  addColumn('kiosks', 'status', "TEXT DEFAULT 'online'");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
      ON users(email) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_sessions_token_hash
      ON deposit_sessions(token_hash) WHERE token_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_sessions_idem
      ON deposit_sessions(kiosk_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idem
      ON withdrawals(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at);
  `);

  seedDefaults();
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function getDbPath() {
  return dbPath;
}

function mergeRates(stored) {
  const parsed = stored ? JSON.parse(stored) : {};
  return {
    ...DEFAULT_RATES,
    ...parsed,
    rates_paise_per_gram: {
      ...DEFAULT_RATES.rates_paise_per_gram,
      ...(parsed.rates_paise_per_gram || {}),
    },
    min_weight_by_item: {
      ...DEFAULT_RATES.min_weight_by_item,
      ...(parsed.min_weight_by_item || {}),
    },
    accepted_classes:
      Array.isArray(parsed.accepted_classes) && parsed.accepted_classes.length
        ? parsed.accepted_classes
        : DEFAULT_RATES.accepted_classes,
  };
}

export function getRates() {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'rates'").get();
  return mergeRates(row?.value);
}

export function setRates(next) {
  const validated = validateRates(next);
  getDb()
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('rates', ?, datetime('now')) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')'
    )
    .run(JSON.stringify(validated));
  return getRates();
}

export function audit(adminId, action, target = null, details = null) {
  getDb()
    .prepare(
      'INSERT INTO admin_audit_log (admin_id, action, target, details) VALUES (?, ?, ?, ?)'
    )
    .run(adminId, action, target, details == null ? null : JSON.stringify(details));
}

export function closeDb() {
  if (db) {
    try {
      db.close();
    } finally {
      db = null;
    }
  }
}
