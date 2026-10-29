// Tariff unit tests - testing the server-side evaluate function
import { evaluate } from '../server/evaluate.js';
import { DEFAULT_RATES } from '../server/config.js';

const test = (name, fn) => {
  try {
    fn();
    console.log(`  PASS: ${name}`);
  } catch (e) {
    console.log(`  FAIL: ${name} - ${e.message}`);
  }
};

console.log('=== Tariff Unit Tests ===\n');

// Test 1: Bottle 250g @ 2p/g -> 500 paise (₹5.00)
test('Bottle 250g @ 2p/g -> 500 paise', () => {
  const result = evaluate('plastic_bottle', 250, DEFAULT_RATES);
  if (!result.ok) throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  if (result.paise !== 500) throw new Error(`Expected 500 paise, got ${result.paise}`);
  if (result.bonusPaise !== 0) throw new Error(`Expected 0 bonus, got ${result.bonusPaise}`);
});

// Test 2: Bottle 400g @ 2p/g -> 800 + 80 = 880 paise (₹8.80)
test('Bottle 400g @ 2p/g (+10% bulk) -> 880 paise', () => {
  const result = evaluate('plastic_bottle', 400, DEFAULT_RATES);
  if (!result.ok) throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  if (result.paise !== 880) throw new Error(`Expected 880 paise, got ${result.paise}`);
  if (result.bonusPaise !== 80) throw new Error(`Expected 80 bonus, got ${result.bonusPaise}`);
});

// Test 3: Can 450g @ 4p/g -> 1800 + 180 = 1980 paise (₹19.80)
test('Can 450g @ 4p/g (+10% bulk) -> 1980 paise', () => {
  const result = evaluate('aluminium_can', 450, DEFAULT_RATES);
  if (!result.ok) throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  if (result.paise !== 1980) throw new Error(`Expected 1980 paise, got ${result.paise}`);
  if (result.bonusPaise !== 180) throw new Error(`Expected 180 bonus, got ${result.bonusPaise}`);
});

// Test 4: Bag 140g @ 1p/g -> accepted (above 20g minimum)
// NOTE: evaluate uses rates.min_weight_g; DEFAULT_RATES has 100, so pass custom rates
test('Bag 140g @ 1p/g -> accepted (above 20g minimum)', () => {
  const customRates = { ...DEFAULT_RATES, min_weight_g: 20 };
  const result = evaluate('plastic_bag', 140, customRates);
  if (result.ok) return; // expected - 140g > 20g minimum
  throw new Error(`Expected ok for 140g bag above 20g minimum, got ${result.code}: ${result.message}`);
});

// Test 5: Bag 10g @ 1p/g -> rejected (below 20g minimum)
test('Bag 10g @ 1p/g -> rejected (below 20g minimum)', () => {
  const customRates = { ...DEFAULT_RATES, min_weight_g: 20 };
  const result = evaluate('plastic_bag', 10, customRates);
  if (!result.ok) {
    if (result.code !== 'LOW_DENSITY') throw new Error(`Expected LOW_DENSITY code, got ${result.code}`);
    return; // expected - rejected for under minimum
  }
  throw new Error('Expected rejected for under minimum weight');
});

// Test 5b: Bag at minimum weight 20g -> accepted
test('Bag at 20g minimum weight -> accepted', () => {
  const customRates = { ...DEFAULT_RATES, min_weight_g: 20 };
  const result = evaluate('plastic_bag', 20, customRates);
  if (!result.ok) throw new Error('Expected 20g bag at minimum to be accepted');
});

// Test 6: Invalid item
test('Invalid item rejected', () => {
  const result = evaluate('other_invalid', 250, DEFAULT_RATES);
  if (!result.ok) {
    // Expected - item not accepted
    return;
  }
  throw new Error('Expected invalid item to be rejected, but got ok');
});

// Test 7: Negative weight
test('Negative weight rejected', () => {
  const result = evaluate('plastic_bottle', -10, DEFAULT_RATES);
  if (!result.ok) {
    // Expected
    return;
  }
  throw new Error('Expected negative weight to be rejected');
});

// Test 8: Weight above max (500g)
test('Weight above max rejected (550g > 500g)', () => {
  const result = evaluate('plastic_bottle', 550, DEFAULT_RATES);
  if (!result.ok) {
    // Expected - over max weight
    return;
  }
  throw new Error('Expected weight > 500g to be rejected, but got ok');
});

// Test 9: Minimum weight for bottle (100g)
test('Bottle at minimum weight 100g accepted', () => {
  const result = evaluate('plastic_bottle', 100, DEFAULT_RATES);
  if (!result.ok) throw new Error('Expected 100g bottle to be accepted');
  if (result.paise !== 200) throw new Error(`Expected 200 paise for 100g bottle, got ${result.paise}`);
});

// Test 10: Aluminium can minimum
test('Can at minimum weight 100g accepted', () => {
  const result = evaluate('aluminium_can', 100, DEFAULT_RATES);
  if (!result.ok) throw new Error('Expected 100g can to be accepted');
  if (result.paise !== 400) throw new Error(`Expected 400 paise for 100g can, got ${result.paise}`);
});

console.log('\n=== Tariff Unit Tests Complete ===');