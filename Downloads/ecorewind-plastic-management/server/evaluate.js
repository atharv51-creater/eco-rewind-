import { DEFAULT_RATES } from './config.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** Same shape as js/shared.js ITEM_TYPES */
export const ITEM_TYPES = {
  plastic_bottle: { label: 'Plastic bottle', ratePaise: 0 },
  aluminium_can: { label: 'Aluminium can', ratePaise: 0 },
  plastic_bag: { label: 'Plastic bag', ratePaise: 0 },
  other_invalid: { label: 'Invalid item', ratePaise: 0 },
};

/** Per-item minimum weights. Bags are lighter than bottles/cans. */
export const MIN_WEIGHTS = {
  plastic_bottle: 100,
  aluminium_can: 100,
  plastic_bag: 20,
};

/** Pure tariff preview. Order matches the spec: item class first, then weight sanity. */
export function evaluate(itemKey, grams, rates = null) {
  const item = ITEM_TYPES[itemKey];
  if (!item) {
    return {
      ok: false,
      code: 'INVALID_ITEM',
      title: 'Item not accepted',
      message: 'Unknown object is not paid by this machine.',
    };
  }

  const accepted = rates?.accepted_classes;
  const configuredRate = rates?.rates_paise_per_gram?.[itemKey];
  const rate = Number.isInteger(configuredRate) ? configuredRate : item.ratePaise;
  const isAccepted = Array.isArray(accepted) ? accepted.includes(itemKey) : rate > 0;

  if (!isAccepted || !(rate > 0)) {
    return {
      ok: false,
      code: 'INVALID_ITEM',
      title: 'Item not accepted',
      message: `${item.label} is not paid by this machine.`,
    };
  }
  if (!isNum(grams) || grams < 0) {
    return {
      ok: false,
      code: 'BAD_WEIGHT',
      title: 'Invalid weight reading',
      message: `The load cell must read a valid weight. Payout blocked.`,
    };
  }
  const minWeight =
    rates?.min_weight_by_item?.[itemKey] ?? rates?.min_weight_g ?? MIN_WEIGHTS[itemKey] ?? 100;
  const maxWeight = rates?.max_weight_g ?? 500;
  if (grams > maxWeight) {
    return {
      ok: false,
      code: 'BAD_WEIGHT',
      title: 'Invalid weight reading',
      message: `The load cell must read between 0 and ${maxWeight} g. Payout blocked.`,
    };
  }
  if (grams < minWeight) {
    return {
      ok: false,
      code: 'LOW_DENSITY',
      title: 'Low-density anomaly',
      message: `${grams} g is under the ${minWeight} g minimum. Payout blocked.`,
    };
  }
  const base = Math.round(grams * rate);
  const bonusThreshold = rates?.bonus_threshold_g ?? 400;
  const bonusPct = rates?.bonus_pct ?? 10;
  const bonusPaise = grams >= bonusThreshold ? Math.round((base * bonusPct) / 100) : 0;
  return {
    ok: true,
    code: 'OK',
    basePaise: base,
    bonusPaise,
    paise: base + bonusPaise,
    ratePaise: rate,
    title: 'Deposit accepted',
    message: `${item.label}, ${grams} g`,
  };
}

/** Apply server rates to the shared ITEM_TYPES table (used by the browser). */
export function applyRates(r) {
  const rates = r?.rates_paise_per_gram;
  if (
    !rates ||
    typeof rates !== 'object' ||
    !Array.isArray(r.accepted_classes) ||
    ![r.min_weight_g, r.max_weight_g, r.bonus_threshold_g, r.bonus_pct].every(isNum)
  ) {
    throw new Error('Malformed tariff from server');
  }
  for (const [key, item] of Object.entries(ITEM_TYPES)) {
    const rate = rates[key];
    item.ratePaise =
      r.accepted_classes.includes(key) && Number.isInteger(rate) && rate > 0 ? rate : 0;
  }
}

applyRates(DEFAULT_RATES);
