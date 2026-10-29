# EcoRewind: Reverse Vending Machine Simulation

EcoRewind is a reverse-vending-machine (RVM) demo with a server-authoritative reward ledger. It preserves the original teal/gold visual style (Bricolage Grotesque + Plus Jakarta Sans) and reuses the existing React UI wherever possible.

All money is stored as integer paise (100 paise = ₹1.00). Rewards are internal ledger credits, not real UPI transfers.

---

## Architecture

The system has **two websites**, a **React SPA**, and **two backends**:

- **Node.js/Express + SQLite** is the canonical backend for auth, tariff, deposits, ledger, withdrawals, admin, and QR claims.
- **Python/FastAPI + Keras** is an **inference-only** classifier. It does not write to the reward ledger.

### Site 1: RVM Kiosk (`/kiosk`)

Used on the machine screen. The kiosk user is anonymous — no login, no wallet, no balance display.

- Camera scanner with detected item + confidence
- Weight reading from the load cell (demo slider/buttons included)
- Accepted items: **Plastic Bottle (PET)**, **Aluminium Can**, **Plastic Bag**
- Rejected items show a red "No payout" state and produce no QR
- On an accepted item: `POST /api/scan` classifies server-side, recomputes the tariff, and returns a single-use QR token valid for 5 minutes
- QR is rendered by the server at `/api/qr?text=...` (no third-party CDN)
- Polls `GET /api/deposit/:id/status` (token-free); when claimed, shows "Credited to 98••••210" and resets
- Weight rules: bottles/cans have a 100 g minimum; bags have a 20 g minimum

### Site 2: User Wallet App (`/app`)

Mobile-first static application: register, login, claim, dashboard.

- **register.html**: name, 10-digit Indian mobile number, email, password (min 8 chars)
- **login.html**: mobile/email + password; preserves a `token` query parameter through auth
- **claim.html?token=...**: requires login; `POST /api/claim/:token`; handles `already_claimed`, `expired`, and `invalid_token`
- **dashboard.html**: balance from the ledger, lifetime earned, kg recycled, CO₂ avoided, item counts, milestone progress, transaction history, logout

### React SPA (`/`)

The Vite/React dashboard includes the user wallet, machine simulator, admin console, and viva page. It talks to the same Node API. In live mode (`VITE_API_MODE=live`) backend failures are surfaced as errors — there are no silent mock fallbacks.

---

## Backend

**Folder layout**: `server/` (index.js, db.js, config.js, wallet.js, evaluate.js, ml.js, routes/, middleware/), `public/kiosk`, `public/app`, `src/` (React).

One Node process serves the API, both static sites, and the built SPA.

### Database Tables

| Table | Key Columns |
|---|---|
| `users` | id, name, phone UNIQUE, email, password_hash, created_at |
| `kiosks` | id, name, location, api_key_hash, status, last_seen, created_at |
| `deposit_sessions` | id, token UNIQUE (SHA-256 hash), token_hash, kiosk_id, item_type, weight_g, amount_paise, status (`pending`,`claimed`,`expired`), claimed_by, image_sha256, predicted_label, confidence, idempotency_key, source, created_at, expires_at, claimed_at |
| `ledger` | id, user_id, deposit_session_id UNIQUE, amount_paise, created_at |
| `withdrawals` | id, user_id, amount_paise, destination, status (`pending`,`paid`,`cancelled`), idempotency_key, created_at, updated_at |
| `settings` | key, value, updated_at (stores the live tariff) |
| `admin_audit_log` | id, admin_id, action, target, details, created_at |

**Balance = SUM(ledger) − withdrawals with status `pending` or `paid`.** There is no mutable balance column.

### Environment Variables (`.env`)

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=replace-me-with-a-real-secret
SESSION_TTL_DAYS=7
DB_PATH=./database/ecorewind.db
PUBLIC_BASE_URL=http://localhost:3000
FRONTEND_ORIGIN=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

KIOSK_API_KEY=rvm-key-2024
ADMIN_PHONES=9811122233

TOKEN_TTL_MINUTES=5
MIN_WITHDRAWAL_PAISE=100

ML_URL=http://127.0.0.1:8100
ML_PORT=8100
ML_TIMEOUT_MS=15000
ML_THRESHOLD=0.75
ML_INTERNAL_KEY=            # optional; enables legacy Python wallet routes
```

Production guards: `JWT_SECRET` is required, and a kiosk key/hash must be configured. The demo kiosk key `rvm-key-2024` is rejected in production.

### Security

- **bcrypt** password hashing; hashes are never returned
- Kiosk authenticates with `x-api-key` (timing-safe plain key in dev, bcrypt hash in DB)
- Claim tokens are stored only as SHA-256 hashes; the conditional `UPDATE ... WHERE status='pending' AND datetime(expires_at) > datetime('now')` makes double-claim impossible even under concurrency
- Payouts are always recomputed server-side from the DB-backed tariff; the client never supplies the amount
- `Idempotency-Key` support for deposits and withdrawals
- **Helmet**, CORS allowlist, parameterised SQL only, JSON body limit
- Login/register rate-limited per IP; global API rate limit
- JWT in an httpOnly `session` cookie (7-day default), plus Bearer support
- Admin routes require an admin phone (`ADMIN_PHONES`); admin changes are written to `admin_audit_log`
- Python legacy wallet/admin routes are blocked unless `ML_INTERNAL_KEY` is set and matched
- ML failure rejects the item safely and never credits a wallet

### API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | Public | Register with name, phone, email, password |
| `POST /api/auth/login` | Public | Login with phone or email + password |
| `POST /api/auth/logout` | Public | Clears the session cookie |
| `POST /api/kiosk/deposit` | Kiosk key | Server-computed payout + single-use QR token |
| `GET /api/kiosk/deposit/:id` | Kiosk key | Deposit status + masked claimer |
| `GET /api/deposit/:id/status` | Public | Token-free status for the kiosk screen (random session id) |
| `POST /api/scan` | Optional | Server-side classification + tariff; credits authenticated users or returns a QR token |
| `POST /api/claim/:token` | User | Atomic single-use claim |
| `GET /api/me` | User | Profile, wallet, eco stats, recent transactions |
| `GET /api/me/transactions` | User | Paginated transaction history |
| `GET /api/users/:id/wallet` | Owner/admin | Wallet by internal id or phone |
| `GET /api/users/:id/transactions` | Owner/admin | Transactions by internal id or phone |
| `POST /api/users/:id/withdrawals` | Owner/admin | Create a withdrawal request |
| `GET /api/users/:id/withdrawals` | Owner/admin | List withdrawals |
| `GET /api/admin/stats` | Admin | Network totals |
| `GET /api/admin/users` | Admin | User list with balances |
| `GET /api/admin/machines` | Admin | Kiosk list and status |
| `GET /api/admin/transactions` | Admin | All ledger transactions |
| `GET /api/admin/audit` | Admin | Recent admin audit entries |
| `GET/PUT /api/admin/rates` | Admin | Read/update the live tariff |
| `GET /api/rates` | Public | Current tariff |
| `POST /api/admin/withdrawals/:id/complete` | Admin | Mark withdrawal paid |
| `POST /api/admin/withdrawals/:id/cancel` | Admin | Cancel and restore funds |
| `GET /api/qr?text=...` | Public | Server-rendered QR SVG |
| `GET /api/health` | Public | Server status |
| `POST /api/classify`, `GET /api/model-info`, `GET /api/sample` | Public | Read-only ML proxy |

**Tariff** is stored in `settings` and can be changed by an admin. Defaults:

| Item | Rate (paise/g) | Min Weight (g) |
|---|---|---|
| Plastic bottle | 2 | 100 |
| Aluminium can | 4 | 100 |
| Plastic bag | 1 | 20 |

Max weight is 500 g. Bonus: +10% when weight ≥ 400 g. All applied server-side.

---

## Local Development

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env` and set at least `JWT_SECRET` and `KIOSK_API_KEY`.

### 3. ML service (optional but needed for `/api/scan`)

`npm start` checks `ML_URL` and, if it is offline, spawns the Python service. It prefers `../ecorewind/ecorewind_ml/.venv/bin/python`, then `.venv/bin/python`, then `python3`.

If your TensorFlow install is in a virtualenv, start it explicitly:

```bash
../ecorewind/ecorewind_ml/.venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8100
```

The system Python may not have TensorFlow; the verified venv includes TensorFlow, FastAPI, Uvicorn, Pillow, and NumPy.

### 4. Start

```bash
npm start          # API + static sites + SPA on :3000 (and ML if needed)
npm run dev        # Vite dev server on :5173 with /api proxy to :3000
npm run seed       # seed demo users and kiosk
```

URLs:

- App: `http://localhost:3000/app`
- Kiosk: `http://localhost:3000/kiosk`
- SPA: `http://localhost:3000/`
- Vite dev: `http://localhost:5173`

Demo accounts (after `npm run seed`): `9876543210` / `password123` (user) and `9811122233` / `password123` (admin). Demo emails `user@ecorewind.com` and `admin@ecorewind.com` also map to those accounts.

### 5. Tests and build

```bash
npm test           # tariff unit tests + isolated API integration tests
npm run build      # tsc && vite build
```

The API tests use a temporary database and an in-process server; they never touch `database/ecorewind.db`.

### 6. Running on a phone (same Wi-Fi)

Set `PUBLIC_BASE_URL` and `FRONTEND_ORIGIN` to your laptop's LAN URL (e.g. `http://192.168.x.x:3000`), then open the kiosk URL from the phone. Webcam access requires localhost or HTTPS; a phone camera can scan the QR over plain HTTP.

---

## Deployment

Set these environment variables:

```env
NODE_ENV=production
PORT=10000
JWT_SECRET=<random>
KIOSK_API_KEY=<random>
ADMIN_PHONES=<your-admin-phone>
PUBLIC_BASE_URL=https://your-app.onrender.com
FRONTEND_ORIGIN=https://your-app.onrender.com
```

Build and start:

```bash
build:  npm run build
start:  npm start
```

### Persistent Disk

SQLite lives at `DB_PATH` (default `database/ecorewind.db`). Render/Railway free tiers use ephemeral disks, so attach a persistent volume or move to PostgreSQL for production. If the ML service runs separately, set `ML_URL` to its URL.

---

## Viva Examination

See `src/pages/VivaPage.tsx` for the architecture diagram and likely examiner questions. Key topics:

1. **Server-recomputed tariff** — client state is untrusted; the server classifies, checks weight, computes `round(weight × rate)` plus the bulk bonus, and writes the ledger atomically.
2. **Idempotency** — deposits and withdrawals accept `Idempotency-Key`; retries return the original result instead of double-charging.
3. **Non-recyclable handling** — dual verification: MobileNetV2 confidence ≥ 0.75 in an accepted class plus a strain-gauge density check; rejected items pay ₹0 and never reach the ledger.
4. **Integer paise** — no floating-point money; formatting happens only at presentation.
5. **Single-use QR tokens** — stored as SHA-256 hashes; expiry and claim are checked in one transaction.
6. **CSV formula-injection prevention** — exported cells are escaped and quoted.

---

## File Summary

```text
├── server/
│   ├── index.js               # App factory, routes, static serving, ML spawn
│   ├── db.js                  # SQLite schema, migrations, rates, audit
│   ├── config.js              # Env, production guards, DEFAULT_RATES
│   ├── wallet.js              # Ledger-derived wallet balance
│   ├── evaluate.js            # Pure tariff function
│   ├── ml.js                  # Python classifier proxy
│   ├── middleware/auth.js     # JWT, admin, kiosk, rate limiting
│   ├── routes/auth.js         # Register, login, logout
│   ├── routes/kiosk.js        # Kiosk deposit + status
│   ├── routes/scan.js         # Server-side scan → credit or QR token
│   ├── routes/claim.js        # Atomic single-use claim
│   ├── routes/me.js           # Profile, wallet, transactions
│   ├── routes/withdrawals.js  # Withdrawal lifecycle
│   ├── app.py                 # FastAPI inference-only service
│   ├── classifier.py          # Keras MobileNetV2 wrapper
│   └── models/                # .keras model, labels, report
├── public/
│   ├── kiosk/index.html       # RVM kiosk UI
│   └── app/                   # register, login, claim, dashboard
├── src/                       # React SPA (wallet, machine, admin, viva)
├── tests/
│   ├── tariff-tests.mjs       # Tariff unit tests
│   └── api-tests.mjs          # Isolated API integration tests
├── package.json
├── vite.config.ts
└── README.md
```

---

## End-to-End Acceptance Criteria

| Criterion | Description |
|---|---|
| Bottle 250 g at kiosk → ₹5.00 + QR | Scan, register/login on a second device, claim → ledger credits ₹5.00; kiosk shows "Credited"; dashboard shows ₹5.00 |
| Rock/trash shows blocked | No QR and no ledger credit |
| QR token cannot be claimed twice or after 5 min | Double-claim → 409 `already_claimed`; expired → 410 `expired` |
| Without registering/logging in, no credit possible | Claim requires auth; anonymous scans only issue a token |
| Changing weight after scan requires rescan | Tamper check forces reset |
| No money logic or balance lives in the browser | All balance computed from the SQL `ledger` table |
| ML outage is safe | Scan rejects with `decision: "rejected"` and never credits |
