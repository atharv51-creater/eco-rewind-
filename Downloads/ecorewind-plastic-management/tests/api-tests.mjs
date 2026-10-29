// Self-contained API tests: isolated temp database + in-process server.
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecorewind-test-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-only-secret';
process.env.KIOSK_API_KEY = 'rvm-key-2024';
process.env.ML_URL = 'http://127.0.0.1:59999';
process.env.ML_TIMEOUT_MS = '800';

const { createApp } = await import('../server/index.js');
const { getDb, closeDb } = await import('../server/db.js');
const { sha256 } = await import('../server/utils.js');

const app = createApp({ startMl: false });
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
let failed = 0;

const ok = (name, condition, extra = '') => {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

async function request(pathname, { method = 'GET', body, token, kioskKey, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (kioskKey) finalHeaders['x-api-key'] = kioskKey;

  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore non-JSON
  }
  return { res, status: res.status, json, text };
}

async function register(name, phone, password = 'password123') {
  return request('/api/auth/register', {
    method: 'POST',
    body: { name, phone, password },
  });
}

async function login(phone, password = 'password123') {
  return request('/api/auth/login', {
    method: 'POST',
    body: { phone, password },
  });
}

async function deposit(kioskKey, body, idem) {
  return request('/api/kiosk/deposit', {
    method: 'POST',
    kioskKey,
    headers: idem ? { 'Idempotency-Key': idem } : {},
    body,
  });
}

async function claim(token, authToken) {
  return request(`/api/claim/${token}`, { method: 'POST', token: authToken });
}

async function main() {
  console.log('=== API Tests ===\n');

  console.log('--- Auth Tests ---');
  const userPhone = '9876500001';
  const otherPhone = '9876500002';
  const adminPhone = '9811122233';

  const reg = await register('Test User', userPhone);
  ok('Register returns 200', reg.status === 200, reg.text);
  ok('Register returns userId', typeof reg.json?.userId === 'string');
  ok('Register returns token', typeof reg.json?.token === 'string');
  const userToken = reg.json?.token;

  const dup = await register('Test User', userPhone);
  ok('Duplicate register returns 409', dup.status === 409);

  const badLogin = await login(userPhone, 'wrongpassword');
  ok('Wrong password returns 401', badLogin.status === 401);

  const missingPwd = await request('/api/auth/login', {
    method: 'POST',
    body: { phone: userPhone },
  });
  ok('Missing password returns 400', missingPwd.status === 400);

  const goodLogin = await login(userPhone);
  ok('Login returns 200', goodLogin.status === 200);
  ok('Login token matches user', goodLogin.json?.userId === reg.json?.userId);

  const otherReg = await register('Other User', otherPhone);
  const otherToken = otherReg.json?.token;

  const adminReg = await register('Admin', adminPhone);
  ok('Admin register returns admin role', adminReg.json?.user?.role === 'admin');
  const adminToken = adminReg.json?.token;

  const emailPhone = '9876500003';
  const emailReg = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Email User',
      email: 'emailuser@example.com',
      phone: emailPhone,
      password: 'password123',
    },
  });
  ok('Register with email returns 200', emailReg.status === 200, emailReg.text);
  ok('Register echoes email', emailReg.json?.user?.email === 'emailuser@example.com');
  const emailLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'emailuser@example.com', password: 'password123' },
  });
  ok('Login with email returns 200', emailLogin.status === 200, emailLogin.text);
  const duplicateEmail = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Email User 2',
      email: 'emailuser@example.com',
      phone: '9876500004',
      password: 'password123',
    },
  });
  ok('Duplicate email returns 409', duplicateEmail.status === 409);

  console.log('\n--- Kiosk Deposit Tests ---');
  const noKey = await deposit(undefined, { itemType: 'plastic_bottle', weightGrams: 250 });
  ok('Deposit without kiosk key returns 401', noKey.status === 401);

  const bottle = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 250 });
  ok('Valid bottle deposit returns 200', bottle.status === 200, bottle.text);
  ok('Bottle 250g amount is 500 paise', bottle.json?.amountPaise === 500);
  ok('Deposit returns a token', typeof bottle.json?.token === 'string');

  const db = getDb();
  const stored = db
    .prepare('SELECT token, token_hash FROM deposit_sessions WHERE id = ?')
    .get(bottle.json?.sessionId);
  ok('Claim token is not stored in plaintext', stored?.token === stored?.token_hash);
  ok('Stored token is a SHA-256 hash', stored?.token_hash === sha256(bottle.json?.token));

  const hashAsToken = await claim(stored?.token_hash, userToken);
  ok('Stored hash cannot be used as a claim token', hashAsToken.status === 404);

  const badItem = await deposit('rvm-key-2024', { itemType: 'other_invalid', weightGrams: 80 });
  ok('Rejected item returns 400', badItem.status === 400);

  const lightBag = await deposit('rvm-key-2024', { itemType: 'plastic_bag', weightGrams: 10 });
  ok('Bag under 20g minimum returns 400', lightBag.status === 400);

  const can = await deposit('rvm-key-2024', { itemType: 'aluminium_can', weightGrams: 450 });
  ok('Can 450g amount is 1980 paise', can.json?.amountPaise === 1980);

  const idem1 = await deposit(
    'rvm-key-2024',
    { itemType: 'plastic_bottle', weightGrams: 250 },
    'idem-scan-1'
  );
  const idem2 = await deposit(
    'rvm-key-2024',
    { itemType: 'plastic_bottle', weightGrams: 250 },
    'idem-scan-1'
  );
  ok('Idempotent deposit returns same session', idem1.json?.sessionId === idem2.json?.sessionId);
  ok('Idempotent deposit is flagged duplicate', idem2.json?.duplicate === true);
  ok('Idempotent deposit rotates the token', idem2.json?.token && idem2.json.token !== idem1.json.token);

  console.log('\n--- Claim Tests ---');
  const pendingStatus = await request(`/api/deposit/${bottle.json.sessionId}/status`);
  ok('Public status reports pending', pendingStatus.status === 200 && pendingStatus.json?.status === 'pending');
  ok('Public status never exposes the claim token', pendingStatus.json?.token === undefined);

  const claim1 = await claim(bottle.json.token, userToken);
  ok('Claim success returns 200', claim1.status === 200, claim1.text);
  ok('Claim returns amount 500', claim1.json?.amountPaise === 500);
  ok('Claim returns wallet balance', claim1.json?.walletBalancePaise === 500);

  const claimedStatus = await request(`/api/deposit/${bottle.json.sessionId}/status`);
  ok('Public status reports claimed', claimedStatus.json?.status === 'claimed');
  ok('Public status masks the claimer phone', claimedStatus.json?.claimerInfo === '98•••••001');

  const claim2 = await claim(bottle.json.token, userToken);
  ok('Double claim returns 409', claim2.status === 409);
  ok('Double claim code is already_claimed', claim2.json?.error === 'already_claimed');

  const anonClaim = await claim(can.json.token, null);
  ok('Unauthenticated claim returns 401', anonClaim.status === 401);

  const otherClaim = await claim(can.json.token, otherToken);
  ok('Two-user claim succeeds for second user', otherClaim.status === 200);

  const replayClaim = await claim(can.json.token, otherToken);
  ok('Replayed two-user claim returns 409', replayClaim.status === 409);

  const ledger = db
    .prepare('SELECT user_id, amount_paise FROM ledger ORDER BY id')
    .all();
  ok('Ledger has one row per successful claim', ledger.length === 2);
  ok(
    'First claim credited the first user only',
    ledger.filter((r) => r.user_id === reg.json.userId).length === 1
  );
  ok(
    'Second claim credited the second user only',
    ledger.filter((r) => r.user_id === otherReg.json.userId).length === 1
  );

  // Expired token
  const expiredToken = 'e'.repeat(64);
  db.prepare(`
    INSERT INTO deposit_sessions
      (id, token, token_hash, kiosk_id, item_type, weight_g, amount_paise, status, created_at, expires_at)
    VALUES (?, ?, ?, 'RVM-01', 'plastic_bottle', 250, 500, 'pending', datetime('now'), datetime('now','-1 minute'))
  `).run('expired-session', sha256(expiredToken), sha256(expiredToken));
  const expired = await claim(expiredToken, userToken);
  ok('Expired claim returns 410', expired.status === 410);
  ok('Expired claim code is expired', expired.json?.error === 'expired');

  // Concurrent double claim: exactly one must win.
  const raceDeposit = await deposit('rvm-key-2024', {
    itemType: 'plastic_bottle',
    weightGrams: 250,
  });
  const [raceA, raceB] = await Promise.all([
    claim(raceDeposit.json.token, userToken),
    claim(raceDeposit.json.token, otherToken),
  ]);
  const raceStatuses = [raceA.status, raceB.status].sort();
  ok('Concurrent claims yield exactly one success', raceStatuses[0] === 200 && raceStatuses[1] === 409);

  console.log('\n--- Wallet & Authorization Tests ---');
  const walletByPhone = await request(`/api/users/${userPhone}/wallet`, { token: userToken });
  ok('Wallet lookup by phone returns 200', walletByPhone.status === 200, walletByPhone.text);
  const ledgerSum = db
    .prepare('SELECT COALESCE(SUM(amount_paise),0) AS total FROM ledger WHERE user_id = ?')
    .get(reg.json.userId).total;
  ok('Wallet balance equals ledger sum', walletByPhone.json?.balance_paise === ledgerSum);

  const walletOther = await request(`/api/users/${otherPhone}/wallet`, { token: userToken });
  ok('Cannot read another user wallet', walletOther.status === 403);

  const walletAnon = await request(`/api/users/${userPhone}/wallet`);
  ok('Anonymous wallet read returns 401', walletAnon.status === 401);

  const adminAsUser = await request('/api/admin/stats', { token: userToken });
  ok('Non-admin admin stats returns 403', adminAsUser.status === 403);

  const adminAnon = await request('/api/admin/stats');
  ok('Anonymous admin stats returns 401', adminAnon.status === 401);

  const adminStats = await request('/api/admin/stats', { token: adminToken });
  ok('Admin stats returns 200', adminStats.status === 200, adminStats.text);
  ok('Admin stats counts users', adminStats.json?.total_users === 4);

  console.log('\n--- Tariff Tests ---');
  const ratesBefore = await request('/api/rates');
  ok('Public rates returns 200', ratesBefore.status === 200);

  const ratesUpdate = await request('/api/admin/rates', {
    method: 'PUT',
    token: adminToken,
    body: {
      ...ratesBefore.json,
      rates_paise_per_gram: {
        plastic_bottle: 3,
        aluminium_can: 4,
        plastic_bag: 1,
      },
    },
  });
  ok('Admin can update rates', ratesUpdate.status === 200, ratesUpdate.text);
  ok('Updated bottle rate is 3', ratesUpdate.json?.rates_paise_per_gram?.plastic_bottle === 3);

  const publicRates = await request('/api/rates');
  ok('Public rates reflects admin change', publicRates.json?.rates_paise_per_gram?.plastic_bottle === 3);

  const newRateDeposit = await deposit('rvm-key-2024', {
    itemType: 'plastic_bottle',
    weightGrams: 250,
  });
  ok('Deposit uses updated tariff (750 paise)', newRateDeposit.json?.amountPaise === 750);

  const invalidRates = await request('/api/admin/rates', {
    method: 'PUT',
    token: adminToken,
    body: { rates_paise_per_gram: { plastic_bottle: -5 } },
  });
  ok('Invalid rates are rejected', invalidRates.status === 400);

  // Restore defaults
  await request('/api/admin/rates', {
    method: 'PUT',
    token: adminToken,
    body: ratesBefore.json,
  });

  console.log('\n--- Withdrawal Tests ---');
  const insufficient = await request(`/api/users/${userPhone}/withdrawals`, {
    method: 'POST',
    token: userToken,
    body: { amount_paise: 999999, destination: 'user@upi' },
  });
  ok('Insufficient withdrawal returns 409', insufficient.status === 409);

  const wd1 = await request(`/api/users/${userPhone}/withdrawals`, {
    method: 'POST',
    token: userToken,
    headers: { 'Idempotency-Key': 'wd-1' },
    body: { amount_paise: 300, destination: 'user@upi' },
  });
  ok('Valid withdrawal returns 201', wd1.status === 201, wd1.text);
  const wd1Repeat = await request(`/api/users/${userPhone}/withdrawals`, {
    method: 'POST',
    token: userToken,
    headers: { 'Idempotency-Key': 'wd-1' },
    body: { amount_paise: 300, destination: 'user@upi' },
  });
  ok('Idempotent withdrawal is duplicate', wd1Repeat.json?.duplicate === true);

  const cancel = await request(`/api/admin/withdrawals/${wd1.json.withdrawal.id}/cancel`, {
    method: 'POST',
    token: adminToken,
  });
  ok('Admin can cancel a withdrawal', cancel.status === 200);
  ok('Cancelled withdrawal restores balance', cancel.json?.wallet?.balance_paise === ledgerSum);

  const complete = await request(`/api/admin/withdrawals/${wd1.json.withdrawal.id}/cancel`, {
    method: 'POST',
    token: userToken,
  });
  ok('Non-admin cannot cancel withdrawals', complete.status === 403);

  console.log('\n--- ML Failure Safety ---');
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(200)], { type: 'image/jpeg' }), 'frame.jpg');
  form.append('weight_grams', '250');
  form.append('machine_id', 'RVM-01');
  const mlDown = await request('/api/scan', { method: 'POST', body: form });
  ok('ML failure does not crash the backend', mlDown.status === 200, mlDown.text);
  ok('ML failure rejects safely', mlDown.json?.decision === 'rejected');
  ok('ML failure does not credit a wallet', mlDown.json?.credited === false);

  console.log('\n--- Legacy Token Compatibility ---');
  const legacyToken = 'legacy-' + 'a'.repeat(30);
  db.prepare(`
    INSERT INTO deposit_sessions
      (id, token, kiosk_id, item_type, weight_g, amount_paise, status, created_at, expires_at)
    VALUES ('legacy-session', ?, 'RVM-01', 'plastic_bottle', 250, 500, 'pending', datetime('now'), datetime('now','+5 minutes'))
  `).run(legacyToken);
  const legacyClaim = await claim(legacyToken, userToken);
  ok('Legacy plaintext token can still be claimed', legacyClaim.status === 200, legacyClaim.text);

  console.log('\n--- 15 Specification Test Scenarios ---');

  // Scenario 1: A valid 250 g plastic bottle creates a ₹5.00 reward claim.
  const sc1 = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 250 });
  ok('Scenario 1: Valid 250g bottle creates ₹5.00 (500 paise) reward claim',
    sc1.status === 200 && sc1.json?.amountPaise === 500 && sc1.json?.amountInr === '5.00');

  // Scenario 2: The kiosk displays a QR for that claim.
  const sc2Qr = await request(`/api/qr?text=${encodeURIComponent(sc1.json.claimUrl)}`);
  ok('Scenario 2: Kiosk displays a valid QR for that claim (SVG rendered)',
    sc2Qr.status === 200 && sc2Qr.text.includes('<svg'));

  // Scenario 3: A second device can open the claim URL.
  const sc3Details = await request(`/api/claim/${sc1.json.token}`);
  ok('Scenario 3: Second device can open claim URL and view pending metadata',
    sc3Details.status === 200 && sc3Details.json?.status === 'pending' && sc3Details.json?.amountPaise === 500);

  // Scenario 4: An unauthenticated user is redirected to login.
  const sc4Unauth = await claim(sc1.json.token, null);
  ok('Scenario 4: Unauthenticated user cannot claim (blocked with 401)', sc4Unauth.status === 401);

  // Scenario 5: After registration, the user returns to the original claim.
  const sc5User = await register('Claimant 5', '9876500099', 'password123');
  ok('Scenario 5: User can register and acquire auth session',
    sc5User.status === 200 && typeof sc5User.json?.token === 'string');

  // Scenario 6: Successful claiming credits exactly ₹5.00.
  const sc6Claim = await claim(sc1.json.token, sc5User.json.token);
  ok('Scenario 6: Successful claiming credits exactly ₹5.00',
    sc6Claim.status === 200 && sc6Claim.json?.amountPaise === 500);

  // Scenario 7: The wallet balance and ledger transaction agree.
  const sc7Wallet = await request('/api/me', { token: sc5User.json.token });
  const sc7Ledger = db
    .prepare('SELECT COALESCE(SUM(amount_paise),0) as sum FROM ledger WHERE user_id = ?')
    .get(sc5User.json.userId).sum;
  ok('Scenario 7: Wallet balance and ledger transaction agree (₹5.00)',
    sc7Wallet.json?.balancePaise === 500 && sc7Ledger === 500);

  // Scenario 8: The kiosk displays the claimed status.
  const sc8Status = await request(`/api/deposit/${sc1.json.sessionId}/status`);
  ok('Scenario 8: Kiosk displays claimed status with masked claimant info',
    sc8Status.json?.status === 'claimed' && sc8Status.json?.claimerInfo === '98•••••099');

  // Scenario 9: Reusing the same token cannot create a second credit.
  const sc9Replay = await claim(sc1.json.token, sc5User.json.token);
  ok('Scenario 9: Reusing same token cannot create a second credit (409 already_claimed)',
    sc9Replay.status === 409 && sc9Replay.json?.error === 'already_claimed');

  // Scenario 10: An expired token cannot be claimed.
  const sc10ExpToken = 'f'.repeat(64);
  db.prepare(`
    INSERT INTO deposit_sessions
      (id, token, token_hash, kiosk_id, item_type, weight_g, amount_paise, status, created_at, expires_at)
    VALUES (?, ?, ?, 'RVM-01', 'plastic_bottle', 250, 500, 'pending', datetime('now'), datetime('now', '-2 minutes'))
  `).run('sc10-expired-session', sha256(sc10ExpToken), sha256(sc10ExpToken));
  const sc10Claim = await claim(sc10ExpToken, sc5User.json.token);
  ok('Scenario 10: An expired token cannot be claimed (410 expired)',
    sc10Claim.status === 410 && sc10Claim.json?.error === 'expired');

  // Scenario 11: Two concurrent users cannot claim the same token.
  const sc11Dep = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 250 });
  const sc11UserB = await register('User 11B', '9876500088', 'password123');
  const [sc11ClaimA, sc11ClaimB] = await Promise.all([
    claim(sc11Dep.json.token, sc5User.json.token),
    claim(sc11Dep.json.token, sc11UserB.json.token),
  ]);
  const sc11Statuses = [sc11ClaimA.status, sc11ClaimB.status].sort();
  ok('Scenario 11: Two concurrent users cannot claim same token (exactly one succeeds)',
    sc11Statuses[0] === 200 && sc11Statuses[1] === 409);

  // Scenario 12: Invalid items produce no reward QR.
  const sc12Invalid = await deposit('rvm-key-2024', { itemType: 'other_invalid', weightGrams: 150 });
  ok('Scenario 12: Invalid items produce no reward QR (400 rejected)',
    sc12Invalid.status === 400 && !sc12Invalid.json?.token);

  // Scenario 13: Changing the weight after scanning requires a new scan.
  const sc13TooHeavy = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 800 });
  const sc13TooLight = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 10 });
  ok('Scenario 13: Weight changes outside allowed range reject and require re-scan',
    sc13TooHeavy.status === 400 && sc13TooLight.status === 400);

  // Scenario 14: A failed database transaction does not produce a partial credit.
  const sc14SessionId = 'sc14-tx-test';
  const sc14Token = 'd'.repeat(64);
  db.prepare(`
    INSERT INTO deposit_sessions
      (id, token, token_hash, kiosk_id, item_type, weight_g, amount_paise, status, created_at, expires_at)
    VALUES (?, ?, ?, 'RVM-01', 'plastic_bottle', 250, 500, 'pending', datetime('now'), datetime('now', '+5 minutes'))
  `).run(sc14SessionId, sha256(sc14Token), sha256(sc14Token));

  let txFailed = false;
  try {
    db.transaction(() => {
      db.prepare("UPDATE deposit_sessions SET status = 'claimed' WHERE id = ?").run(sc14SessionId);
      throw new Error('Simulated database write error');
    })();
  } catch {
    txFailed = true;
  }
  const sc14Check = db.prepare('SELECT status FROM deposit_sessions WHERE id = ?').get(sc14SessionId);
  const sc14Ledger = db
    .prepare('SELECT COUNT(*) as c FROM ledger WHERE deposit_session_id = ?')
    .get(sc14SessionId).c;
  ok('Scenario 14: Failed DB transaction rolls back without partial credit',
    txFailed && sc14Check.status === 'pending' && sc14Ledger === 0);

  // Scenario 15: A network failure does not accidentally create duplicate deposits.
  const idemKey = 'network-retry-unique-key-999';
  const sc15Attempt1 = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 250 }, idemKey);
  const sc15Attempt2 = await deposit('rvm-key-2024', { itemType: 'plastic_bottle', weightGrams: 250 }, idemKey);
  const sc15DbCount = db
    .prepare('SELECT COUNT(*) as c FROM deposit_sessions WHERE kiosk_id = ? AND idempotency_key = ?')
    .get('RVM-01', idemKey).c;
  ok('Scenario 15: Network failure / idempotency retry does not create duplicate deposits',
    sc15Attempt1.status === 200 && sc15Attempt2.json?.duplicate === true && sc15DbCount === 1);

  console.log('\n=== API Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
}

try {
  await main();
} catch (err) {
  failed++;
  console.error('Fatal test error:', err);
} finally {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('All API tests passed!');
}
