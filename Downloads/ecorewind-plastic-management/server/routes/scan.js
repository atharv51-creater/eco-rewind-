import crypto from 'crypto';
import { getDb, getRates } from '../db.js';
import { evaluate, ITEM_TYPES } from '../evaluate.js';
import { classifyFromRequest } from '../ml.js';
import { getWallet } from '../wallet.js';
import { sha256, sqliteNowPlusMinutes } from '../utils.js';
import { KIOSK_NAME, TOKEN_TTL_MINUTES, ML_THRESHOLD } from '../config.js';
import { resolveClaimUrl } from './kiosk.js';

const LABELS = {
  plastic_bottle: 'Plastic bottle',
  aluminium_can: 'Aluminium can',
  plastic_bag: 'Plastic bag',
  other_invalid: 'Invalid item',
};

function displayLabel(label) {
  return LABELS[label] || ITEM_TYPES[label]?.label || 'Invalid item';
}

function buildTransaction({ sessionId, decision, itemType, weightGrams, confidence, scores, reason, machineId, userId, validation, createdAt }) {
  return {
    id: String(sessionId),
    kind: 'deposit',
    status: decision,
    label: itemType,
    display_label: displayLabel(itemType),
    confidence,
    weight_grams: Math.round(weightGrams),
    rate_paise_per_gram: validation?.ratePaise || 0,
    payout_paise: validation?.paise || 0,
    bonus_paise: validation?.bonusPaise || 0,
    reason,
    machine_id: machineId,
    scores,
    user_id: userId || 'anonymous',
    created_at: createdAt || new Date().toISOString(),
  };
}

function buildResponse({
  req,
  sessionId,
  decision,
  itemType,
  weightGrams,
  confidence,
  scores,
  reason,
  machineId,
  userId,
  validation,
  walletUser,
  token,
  expiresAt,
  credited,
  duplicate,
  createdAt,
}) {
  const transaction = buildTransaction({
    sessionId,
    decision,
    itemType,
    weightGrams,
    confidence,
    scores,
    reason,
    machineId,
    userId: walletUser,
    validation,
    createdAt,
  });
  const wallet = getWallet(walletUser || 'anonymous');

  return {
    scan_id: String(sessionId),
    sessionId: String(sessionId),
    duplicate: Boolean(duplicate),
    decision,
    status: decision,
    reason,
    label: itemType,
    display_label: displayLabel(itemType),
    confidence,
    scores,
    transaction,
    wallet,
    model: '4-Class MobileNetV2',
    itemType,
    weightGrams: Math.round(weightGrams),
    amountPaise: validation?.paise || 0,
    basePaise: validation?.basePaise || 0,
    bonusPaise: validation?.bonusPaise || 0,
    ratePaisePerGram: validation?.ratePaise || 0,
    token: token || null,
    claimUrl: token ? resolveClaimUrl(req, token) : null,
    claimPath: token ? `/app/claim/${token}` : null,
    expiresAt: expiresAt || null,
    credited: Boolean(credited),
    userId: walletUser || null,
  };
}

function safeReject(reason, userId) {
  return buildResponse({
    sessionId: `scan-${Date.now().toString(36)}`,
    decision: 'rejected',
    itemType: 'other_invalid',
    weightGrams: 0,
    confidence: 0,
    scores: { aluminium_can: 0, other_invalid: 1, plastic_bag: 0, plastic_bottle: 0 },
    reason,
    machineId: KIOSK_NAME,
    userId,
    validation: null,
    walletUser: userId,
    credited: false,
    duplicate: false,
  });
}

function findByIdempotency(db, kioskId, key) {
  if (!key) return null;
  return db
    .prepare('SELECT * FROM deposit_sessions WHERE kiosk_id = ? AND idempotency_key = ?')
    .get(kioskId, key);
}

/**
 * Secure scan pipeline:
 *  1. The image is classified by the Python/Keras service (server-side).
 *  2. The Node backend recomputes the tariff and validates weight.
 *  3. Authenticated users are credited atomically; anonymous kiosk scans get a
 *     short-lived, single-use QR token. The client never supplies the payout.
 */
export async function handleScan(req, res) {
  const db = getDb();
  const rates = getRates();
  const idempotencyKey = req.get('Idempotency-Key') || null;

  let result;
  try {
    result = await classifyFromRequest(req);
  } catch (err) {
    console.warn('[scan] classifier unavailable:', err.message);
    return res.json(safeReject('AI service unavailable — item rejected. Please try again.', req.user?.userId));
  }

  const weightGrams = Number(result?.weight_grams);
  const itemType = result?.label || 'other_invalid';
  const confidence = Number(result?.confidence || 0);
  const machineId = result?.machine_id || KIOSK_NAME;
  const imageSha = result?.image_sha256 || null;
  const scores = result?.scores || {};
  const isAnonymousMode =
    req.body?.anonymous === 'true' ||
    req.body?.mode === 'qr' ||
    req.body?.user_id === 'anonymous' ||
    req.headers['x-kiosk-anonymous'] === 'true';
  const userId = isAnonymousMode ? null : (req.user?.userId || null);

  // Replay a previous result for the same physical scan attempt.
  const existing = findByIdempotency(db, machineId, idempotencyKey);
  if (existing) {
    // Never hand one user's session to a different authenticated user.
    if (userId && existing.claimed_by && existing.claimed_by !== userId) {
      return res.status(409).json({ error: 'idempotency_conflict' });
    }
    const validation = evaluate(existing.item_type, existing.weight_g, rates);
    let token = null;
    let expiresAt = existing.expires_at;
    if (existing.status === 'pending') {
      token = crypto.randomBytes(32).toString('hex');
      const tokenHash = sha256(token);
      expiresAt = sqliteNowPlusMinutes(TOKEN_TTL_MINUTES);
      db.prepare(
        'UPDATE deposit_sessions SET token = ?, token_hash = ?, expires_at = ? WHERE id = ?'
      ).run(tokenHash, tokenHash, expiresAt, existing.id);
    }
    return res.json(
      buildResponse({
        req,
        sessionId: existing.id,
        decision: validation.ok ? 'accepted' : 'rejected',
        itemType: existing.item_type,
        weightGrams: existing.weight_g,
        confidence: existing.confidence ?? 0,
        scores,
        reason: validation.ok ? `${displayLabel(existing.item_type)} accepted.` : validation.message,
        machineId,
        userId,
        validation,
        walletUser: userId || existing.claimed_by || 'anonymous',
        token,
        expiresAt,
        credited: existing.status === 'claimed',
        duplicate: true,
        createdAt: existing.created_at,
      })
    );
  }

  const modelAccepted =
    result?.decision === 'accepted' &&
    rates.accepted_classes.includes(itemType) &&
    confidence >= ML_THRESHOLD;

  const validation = modelAccepted ? evaluate(itemType, Math.round(weightGrams), rates) : null;
  const decision = validation?.ok ? 'accepted' : 'rejected';
  const reason = validation?.ok
    ? `${displayLabel(itemType)}, ${Math.round(weightGrams)} g accepted.`
    : validation?.message || result?.reason || 'Item rejected';

  if (decision === 'rejected') {
    return res.json(
      buildResponse({
        req,
        sessionId: `scan-${Date.now().toString(36)}`,
        decision,
        itemType,
        weightGrams: Number.isFinite(weightGrams) ? weightGrams : 0,
        confidence,
        scores,
        reason,
        machineId,
        userId,
        validation: null,
        walletUser: userId,
        credited: false,
        duplicate: false,
      })
    );
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const expiresAt = sqliteNowPlusMinutes(TOKEN_TTL_MINUTES);

  try {
    if (userId) {
      // Authenticated deposit: credit the user's canonical Node ledger atomically.
      const tokenHash = sha256(crypto.randomBytes(32).toString('hex'));
      const credit = db.transaction(() => {
        db.prepare(`
          INSERT INTO deposit_sessions
            (id, token, token_hash, kiosk_id, item_type, weight_g, amount_paise, status,
             claimed_by, created_at, expires_at, claimed_at, predicted_label, confidence,
             idempotency_key, source, image_sha256)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, datetime('now'), ?, ?, ?, 'ml_scan', ?)
        `).run(
          sessionId,
          tokenHash,
          tokenHash,
          machineId,
          itemType,
          Math.round(weightGrams),
          validation.paise,
          userId,
          createdAt,
          expiresAt,
          itemType,
          confidence,
          idempotencyKey,
          imageSha
        );
        db.prepare(
          'INSERT INTO ledger (user_id, deposit_session_id, amount_paise) VALUES (?, ?, ?)'
        ).run(userId, sessionId, validation.paise);
      });
      credit();

      return res.json(
        buildResponse({
          req,
          sessionId,
          decision,
          itemType,
          weightGrams,
          confidence,
          scores,
          reason,
          machineId,
          userId,
          validation,
          walletUser: userId,
          credited: true,
          duplicate: false,
          createdAt,
        })
      );
    }

    // Anonymous kiosk deposit: issue a short-lived, single-use QR token.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    db.prepare(`
      INSERT INTO deposit_sessions
        (id, token, token_hash, kiosk_id, item_type, weight_g, amount_paise, status,
         created_at, expires_at, predicted_label, confidence, idempotency_key, source, image_sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 'ml_scan', ?)
    `).run(
      sessionId,
      tokenHash,
      tokenHash,
      machineId,
      itemType,
      Math.round(weightGrams),
      validation.paise,
      createdAt,
      expiresAt,
      itemType,
      confidence,
      idempotencyKey,
      imageSha
    );

    return res.json(
      buildResponse({
        req,
        sessionId,
        decision,
        itemType,
        weightGrams,
        confidence,
        scores,
        reason,
        machineId,
        userId,
        validation,
        walletUser: 'anonymous',
        token,
        expiresAt,
        credited: false,
        duplicate: false,
        createdAt,
      })
    );
  } catch (err) {
    if (String(err?.code || '').includes('SQLITE_CONSTRAINT')) {
      const winner = findByIdempotency(db, machineId, idempotencyKey);
      if (winner) {
        return res.status(200).json(
          buildResponse({
            req,
            sessionId: winner.id,
            decision: 'accepted',
            itemType: winner.item_type,
            weightGrams: winner.weight_g,
            confidence: winner.confidence ?? confidence,
            scores,
            reason,
            machineId,
            userId,
            validation,
            walletUser: userId || winner.claimed_by || 'anonymous',
            credited: winner.status === 'claimed',
            duplicate: true,
            createdAt: winner.created_at,
          })
        );
      }
    }
    console.error('[scan] failed:', err.message);
    return res.status(500).json({ error: 'scan_failed' });
  }
}
