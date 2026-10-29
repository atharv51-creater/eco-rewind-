import path from 'path';
import fs from 'fs';

const ENV_PATH = path.resolve(process.cwd(), '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const raw = fs.readFileSync(ENV_PATH, 'utf-8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function intEnv(name, fallback) {
  const parsed = parseInt(env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const NODE_ENV = env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_TEST = NODE_ENV === 'test';

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';
if (IS_PRODUCTION && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const PORT = intEnv('PORT', 3000);
export const JWT_SECRET = env.JWT_SECRET || DEV_JWT_SECRET;
export const SESSION_TTL_DAYS = intEnv('SESSION_TTL_DAYS', 7);
export const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
export const FRONTEND_ORIGIN = env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

export const CORS_ORIGINS = (env.CORS_ORIGINS || [
  FRONTEND_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Kiosk authentication. In production an explicit key must be configured.
export const KIOSK_NAME = env.KIOSK_NAME || 'RVM-01';
export const KIOSK_API_KEY = env.KIOSK_API_KEY ?? (IS_PRODUCTION ? '' : 'rvm-key-2024');
// bcrypt hash of "rvm-key-2024" (demo kiosk)
export const KIOSK_API_KEY_HASH =
  env.KIOSK_API_KEY_HASH ||
  '$2b$10$4Jg8PApNwJXk.Df0dAsjyOK82N9HbswFVaBPXZMr6qaxMNrSOJQwK';

if (IS_PRODUCTION && !KIOSK_API_KEY && !env.KIOSK_API_KEY_HASH) {
  throw new Error('KIOSK_API_KEY or KIOSK_API_KEY_HASH must be set in production');
}

// Admin accounts are identified by phone number (never by client input).
export const ADMIN_PHONES = (env.ADMIN_PHONES || '9811122233')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Reward lifecycle
export const TOKEN_TTL_MINUTES = intEnv('TOKEN_TTL_MINUTES', 5);
export const MIN_WITHDRAWAL_PAISE = intEnv('MIN_WITHDRAWAL_PAISE', 100);

// ML inference service (Python/Keras). Node never trusts its ledger.
export const ML_PORT = intEnv('ML_PORT', 8100);
export const ML_URL = env.ML_URL || `http://127.0.0.1:${ML_PORT}`;
export const ML_TIMEOUT_MS = intEnv('ML_TIMEOUT_MS', 15000);
export const ML_THRESHOLD = Number(env.ML_THRESHOLD ?? '0.75');

// Tariff config - the Node backend is the source of truth for payouts.
export const DEFAULT_RATES = {
  rates_paise_per_gram: { plastic_bottle: 2, aluminium_can: 4, plastic_bag: 1 },
  accepted_classes: ['aluminium_can', 'plastic_bag', 'plastic_bottle'],
  min_weight_g: 100,
  min_weight_by_item: { plastic_bottle: 100, aluminium_can: 100, plastic_bag: 20 },
  max_weight_g: 500,
  bonus_threshold_g: 400,
  bonus_pct: 10,
};

/** Validate an admin-supplied tariff payload before persisting it. */
export function validateRates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Rates payload must be an object');
  }
  const rates = input.rates_paise_per_gram;
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    throw new Error('rates_paise_per_gram must be an object');
  }

  const accepted = input.accepted_classes ?? Object.keys(rates);
  if (!Array.isArray(accepted) || accepted.length === 0) {
    throw new Error('accepted_classes must be a non-empty array');
  }

  const known = new Set(Object.keys(DEFAULT_RATES.rates_paise_per_gram));
  const cleanedRates = {};
  for (const [key, value] of Object.entries(rates)) {
    if (!known.has(key)) throw new Error(`Unknown item class: ${key}`);
    if (!Number.isInteger(value) || value <= 0 || value > 1000) {
      throw new Error(`Rate for ${key} must be an integer between 1 and 1000 paise`);
    }
    cleanedRates[key] = value;
  }
  for (const key of accepted) {
    if (!known.has(key)) throw new Error(`Unknown accepted class: ${key}`);
    if (!(key in cleanedRates)) throw new Error(`Missing rate for accepted class: ${key}`);
  }

  const minWeight = Number(input.min_weight_g ?? DEFAULT_RATES.min_weight_g);
  const maxWeight = Number(input.max_weight_g ?? DEFAULT_RATES.max_weight_g);
  const bonusThreshold = Number(input.bonus_threshold_g ?? DEFAULT_RATES.bonus_threshold_g);
  const bonusPct = Number(input.bonus_pct ?? DEFAULT_RATES.bonus_pct);
  if (![minWeight, maxWeight, bonusThreshold, bonusPct].every(isNum)) {
    throw new Error('Weight and bonus fields must be numbers');
  }
  if (minWeight <= 0 || maxWeight <= 0 || minWeight >= maxWeight) {
    throw new Error('min_weight_g must be positive and smaller than max_weight_g');
  }
  if (bonusThreshold < minWeight || bonusThreshold > maxWeight) {
    throw new Error('bonus_threshold_g must fall between min_weight_g and max_weight_g');
  }
  if (bonusPct < 0 || bonusPct > 100) {
    throw new Error('bonus_pct must be between 0 and 100');
  }

  const byItem = { ...DEFAULT_RATES.min_weight_by_item };
  if (input.min_weight_by_item != null) {
    if (typeof input.min_weight_by_item !== 'object' || Array.isArray(input.min_weight_by_item)) {
      throw new Error('min_weight_by_item must be an object');
    }
    for (const [key, value] of Object.entries(input.min_weight_by_item)) {
      if (!known.has(key)) throw new Error(`Unknown item class in min_weight_by_item: ${key}`);
      if (!Number.isFinite(value) || value < 0 || value > maxWeight) {
        throw new Error(`Invalid minimum weight for ${key}`);
      }
      byItem[key] = value;
    }
  }

  return {
    rates_paise_per_gram: cleanedRates,
    accepted_classes: accepted,
    min_weight_g: minWeight,
    min_weight_by_item: byItem,
    max_weight_g: maxWeight,
    bonus_threshold_g: bonusThreshold,
    bonus_pct: bonusPct,
  };
}
