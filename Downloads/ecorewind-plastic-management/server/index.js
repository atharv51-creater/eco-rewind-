import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import QRCode from 'qrcode';

import { initDb, getDb, getRates, setRates, audit, closeDb, getDbPath } from './db.js';
import {
  authMiddleware,
  optionalAuthMiddleware,
  kioskAuthMiddleware,
  rateLimitMiddleware,
  requireAdmin,
  requireSelfOrAdmin,
  isAdmin,
  resolveUserId,
} from './middleware/auth.js';
import { registerUser, loginUser, logoutUser } from './routes/auth.js';
import { createDeposit, getDepositStatus } from './routes/kiosk.js';
import { claimDeposit, getClaimDetails } from './routes/claim.js';
import { getMe, getTransactions } from './routes/me.js';
import { handleScan } from './routes/scan.js';
import {
  createWithdrawal,
  listWithdrawals,
  listAllWithdrawals,
  completeWithdrawal,
  cancelWithdrawal,
} from './routes/withdrawals.js';
import { getWallet } from './wallet.js';
import { forwardToMl, getMlHealth } from './ml.js';
import {
  PORT,
  CORS_ORIGINS,
  ML_URL,
  ML_PORT,
  ML_THRESHOLD,
  IS_PRODUCTION,
  NODE_ENV,
  SESSION_TTL_DAYS,
} from './config.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, '..');

let mlProcess = null;

function ensureMlService() {
  const checkReq = http.get(`${ML_URL}/health`, (res) => {
    if (res.statusCode === 200) {
      console.log(`[ML] Python classifier online at ${ML_URL}`);
    }
    res.resume();
  });

  checkReq.on('error', () => {
    console.log(`[ML] Starting Python classifier on port ${ML_PORT}...`);
    const candidates = [
      path.resolve(PROJECT_ROOT, '../ecorewind/ecorewind_ml/.venv/bin/python'),
      path.resolve(PROJECT_ROOT, '.venv/bin/python'),
      'python3',
      'python',
    ];
    const pythonExe = candidates.find((c) => fs.existsSync(c)) || 'python3';

    try {
      mlProcess = spawn(
        pythonExe,
        ['-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', String(ML_PORT)],
        { cwd: PROJECT_ROOT, stdio: 'inherit' }
      );
      mlProcess.on('error', (err) => console.warn('[ML] spawn error:', err.message));
      mlProcess.on('exit', (code) => {
        console.log(`[ML] Python classifier exited with code ${code}`);
        mlProcess = null;
      });
    } catch (err) {
      console.warn('[ML] spawn error:', err.message);
    }
  });
}

function cleanupExpiredSessions() {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE deposit_sessions SET status = 'expired' WHERE status = 'pending' AND datetime(expires_at) < datetime('now')"
    )
    .run();
  if (result.changes > 0) {
    console.log(`Cleanup: ${result.changes} expired deposit session(s)`);
  }
}

function displayLabel(itemType) {
  const labels = {
    plastic_bottle: 'Plastic bottle',
    aluminium_can: 'Aluminium can',
    plastic_bag: 'Plastic bag',
    other_invalid: 'Invalid item',
  };
  return labels[itemType] || 'Invalid item';
}

function transactionFromRow(row) {
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
    user_name: row.user_name || undefined,
    created_at: row.created_at,
  };
}

function listTransactions({ userId = null, limit = 50, offset = 0 }) {
  const db = getDb();
  const where = userId ? 'WHERE l.user_id = ?' : '';
  const params = userId ? [userId] : [];
  const rows = db
    .prepare(
      `SELECT l.id, l.user_id, l.amount_paise, l.created_at,
              d.item_type, d.weight_g, d.kiosk_id, d.confidence,
              u.name AS user_name
       FROM ledger l
       JOIN deposit_sessions d ON l.deposit_session_id = d.id
       LEFT JOIN users u ON u.id = l.user_id
       ${where}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM ledger l ${where}`)
    .get(...params).c;
  return { items: rows.map(transactionFromRow), total, limit, offset };
}

export function createApp({ startMl = false } = {}) {
  initDb();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 5000, standardHeaders: true, legacyHeaders: false }));

  // --- Auth ---
  app.post('/api/auth/register', rateLimitMiddleware(30, 60 * 1000), registerUser);
  app.post('/api/auth/login', rateLimitMiddleware(30, 60 * 1000), loginUser);
  app.post('/api/auth/logout', logoutUser);

  app.get('/api/users/me', authMiddleware, (req, res) => {
    const db = getDb();
    const user = db
      .prepare('SELECT id, name, phone, email, created_at FROM users WHERE id = ?')
      .get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    return res.json({
      user: { ...user, role: isAdmin({ phone: user.phone }) ? 'admin' : 'user' },
      wallet: getWallet(user.id),
    });
  });

  app.get('/api/profile', authMiddleware, (req, res) => {
    const user = getDb()
      .prepare('SELECT id, name, phone, email, created_at FROM users WHERE id = ?')
      .get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    return res.json({ ...user, role: isAdmin({ phone: user.phone }) ? 'admin' : 'user' });
  });

  // --- Kiosk & reward lifecycle ---
  app.post('/api/kiosk/deposit', kioskAuthMiddleware, createDeposit);
  app.get('/api/kiosk/deposit/:id', kioskAuthMiddleware, getDepositStatus);
  // Public, token-free status for the kiosk screen (session ids are random).
  app.get('/api/deposit/:id/status', getDepositStatus);
  app.post(['/api/scan', '/scan'], optionalAuthMiddleware, handleScan);
  app.get('/api/claim/:token', getClaimDetails);
  app.post('/api/claim/:token', authMiddleware, claimDeposit);
  app.get(['/api/me', '/api/users/me'], authMiddleware, getMe);
  app.get(['/api/me/transactions', '/api/users/me/transactions'], authMiddleware, getTransactions);

  // --- ML inference proxy (read-only) ---
  app.get(['/api/model-info', '/model-info'], (req, res) => forwardToMl(req, res, '/api/model-info'));
  app.get(['/api/sample', '/sample'], (req, res) => forwardToMl(req, res, req.originalUrl || req.url));
  app.post(['/api/classify', '/classify'], (req, res) => forwardToMl(req, res, '/api/classify'));

  // --- Tariff (DB-backed) ---
  app.get(['/api/rates', '/rates'], (req, res) => res.json(getRates()));

  app.get('/api/admin/rates', authMiddleware, requireAdmin, (req, res) => res.json(getRates()));
  app.put('/api/admin/rates', authMiddleware, requireAdmin, (req, res) => {
    try {
      const updated = setRates(req.body);
      audit(req.user.userId, 'rates.update', 'tariff', updated);
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: 'invalid_rates', message: err.message });
    }
  });

  // --- Wallet & transactions (owner or admin) ---
  app.get('/api/users/:userId/wallet', authMiddleware, requireSelfOrAdmin('userId'), (req, res) => {
    res.json(getWallet(req.targetUserId));
  });

  app.get(
    '/api/users/:userId/transactions',
    authMiddleware,
    requireSelfOrAdmin('userId'),
    (req, res) => {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      res.json(listTransactions({ userId: req.targetUserId, limit, offset }));
    }
  );

  app.get('/api/transactions', authMiddleware, requireAdmin, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(listTransactions({ limit, offset }));
  });

  // --- Withdrawals ---
  app.post(
    '/api/users/:userId/withdrawals',
    authMiddleware,
    requireSelfOrAdmin('userId'),
    (req, res) => {
      if (req.params.userId === 'all') {
        return res.status(400).json({ error: 'invalid_user' });
      }
      return createWithdrawal(req, res);
    }
  );

  app.get(
    '/api/users/:userId/withdrawals',
    authMiddleware,
    requireSelfOrAdmin('userId'),
    (req, res) => {
      if (req.params.userId === 'all') return listAllWithdrawals(req, res);
      return listWithdrawals(req, res);
    }
  );

  app.get('/api/admin/withdrawals', authMiddleware, requireAdmin, listAllWithdrawals);
  app.post(
    '/api/admin/withdrawals/:id/complete',
    authMiddleware,
    requireAdmin,
    completeWithdrawal
  );
  app.post('/api/admin/withdrawals/:id/cancel', authMiddleware, requireAdmin, cancelWithdrawal);

  // --- Admin ---
  app.get('/api/admin/stats', authMiddleware, requireAdmin, (req, res) => {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const depositCount = db
      .prepare("SELECT COUNT(*) AS count FROM deposit_sessions WHERE status = 'claimed'")
      .get().count;
    const moneySum = db.prepare('SELECT COALESCE(SUM(amount_paise), 0) AS total FROM ledger').get()
      .total;
    const weightSum = db
      .prepare(
        "SELECT COALESCE(SUM(weight_g), 0) AS total FROM deposit_sessions WHERE status = 'claimed'"
      )
      .get().total;
    const activeMachines = db
      .prepare("SELECT COUNT(*) AS count FROM kiosks WHERE status = 'online'")
      .get().count;

    res.json({
      total_users: userCount,
      total_bottles_collected: depositCount,
      total_money_paid_paise: moneySum,
      active_machines: activeMachines,
      total_weight_kg: Number((weightSum / 1000).toFixed(2)),
    });
  });

  app.get('/api/admin/users', authMiddleware, requireAdmin, (req, res) => {
    const db = getDb();
    const users = db.prepare('SELECT id, name, phone, email, created_at FROM users').all();
    res.json(
      users.map((u) => {
        const wallet = getWallet(u.id);
        const bottles = db
          .prepare(
            `SELECT COUNT(*) AS c FROM ledger l
             JOIN deposit_sessions d ON l.deposit_session_id = d.id
             WHERE l.user_id = ? AND d.item_type = 'plastic_bottle'`
          )
          .get(u.id).c;
        return {
          id: u.id,
          name: u.name,
          email: u.email || '',
          phone: u.phone,
          role: isAdmin({ phone: u.phone }) ? 'admin' : 'user',
          balance_paise: wallet.balance_paise,
          bottles_recycled: bottles,
          upi_id: '',
          joined_date: (u.created_at || '').split('T')[0].split(' ')[0],
        };
      })
    );
  });

  app.get('/api/admin/machines', authMiddleware, requireAdmin, (req, res) => {
    const db = getDb();
    const kiosks = db
      .prepare('SELECT id, name, location, status, last_seen, created_at FROM kiosks')
      .all();
    res.json(
      kiosks.map((k) => {
        const total = db
          .prepare(
            "SELECT COUNT(*) AS c FROM deposit_sessions WHERE kiosk_id = ? AND status = 'claimed'"
          )
          .get(k.id).c;
        return {
          id: k.id,
          name: k.name,
          location: k.location || 'Unassigned',
          status: k.status === 'online' ? 'online' : 'offline',
          bin_pet_pct: 0,
          bin_cans_pct: 0,
          bin_bags_pct: 0,
          total_bottles_collected: total,
          last_maintenance: k.created_at,
          last_ping: k.last_seen,
        };
      })
    );
  });

  app.get('/api/admin/transactions', authMiddleware, requireAdmin, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(listTransactions({ limit, offset }));
  });

  app.get('/api/admin/audit', authMiddleware, requireAdmin, (req, res) => {
    const rows = getDb()
      .prepare(
        'SELECT id, admin_id, action, target, details, created_at FROM admin_audit_log ORDER BY id DESC LIMIT 200'
      )
      .all();
    res.json({ items: rows });
  });

  // --- QR helper (server-rendered SVG, no third-party CDN) ---
  app.get('/api/qr', async (req, res) => {
    const text = String(req.query.text || '').trim();
    if (!text || text.length > 512) {
      return res.status(400).json({ error: 'invalid_text' });
    }
    try {
      const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 220 });
      return res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
    } catch {
      return res.status(500).json({ error: 'qr_failed' });
    }
  });

  // --- Health ---
  app.get(['/api/health', '/health'], async (req, res) => {
    const ml = await getMlHealth();
    res.json({
      status: 'ok',
      service: 'EcoRewind',
      environment: NODE_ENV,
      database: getDbPath(),
      ml_service: ML_URL,
      model_ready: Boolean(ml.model_ready),
      model_detail: ml.model_detail || 'unknown',
      threshold: ml.threshold ?? ML_THRESHOLD,
      accepted_classes: getRates().accepted_classes,
      version: ml.version || '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // --- Static sites ---
  const kioskDir = path.resolve(PROJECT_ROOT, 'public/kiosk');
  const appDir = path.resolve(PROJECT_ROOT, 'public/app');
  app.use('/kiosk', express.static(kioskDir, { index: 'index.html' }));
  app.use('/app', express.static(appDir, { index: 'index.html' }));

  app.get(['/app', '/app/'], (req, res) =>
    res.sendFile(path.resolve(appDir, 'login/login.html'))
  );
  app.get('/app/login(.html)?', (req, res) =>
    res.sendFile(path.resolve(appDir, 'login/login.html'))
  );
  app.get('/app/register(.html)?', (req, res) =>
    res.sendFile(path.resolve(appDir, 'register/register.html'))
  );
  app.get(['/app/claim(.html)?', '/app/claim/:token'], (req, res) =>
    res.sendFile(path.resolve(appDir, 'claim/claim.html'))
  );
  app.get('/app/dashboard(.html)?', (req, res) =>
    res.sendFile(path.resolve(appDir, 'dashboard/dashboard.html'))
  );

  const distDir = path.resolve(PROJECT_ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/kiosk') ||
        req.path.startsWith('/app')
      ) {
        return next();
      }
      const indexHtml = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
      return next();
    });
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'endpoint_not_found' }));
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  if (startMl) ensureMlService();
  return app;
}

export function startServer(port = PORT) {
  const app = createApp({ startMl: true });
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`EcoRewind server running on http://localhost:${port}`);
    console.log(`App (Mobile Wallet): http://localhost:${port}/app`);
    console.log(`Kiosk (RVM):         http://localhost:${port}/kiosk`);
    console.log(`React Platform SPA:  http://localhost:${port}/`);
    console.log(`Database:            ${getDbPath()}`);
  });

  cleanupExpiredSessions();
  const interval = setInterval(cleanupExpiredSessions, 10 * 60 * 1000);
  interval.unref();

  const shutdown = () => {
    if (mlProcess) {
      try {
        mlProcess.kill();
      } catch {
        // ignore
      }
    }
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  startServer();
}
