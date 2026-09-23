import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRATEGY_PRESETS } from '../data/strategy-presets.ts';
import { INDICATOR_CODES } from '../data/rules.ts';
import { validateStrategy } from './validator.ts';
import { createPresetStrategy, evaluatePresets, findMostDifferentPresets, indicatorDistance } from './strategy-presets.ts';

test('all twelve presets are unique valid editable portfolios', () => {
  assert.equal(STRATEGY_PRESETS.length, 12);
  const signatures = new Set<string>();
  for (const preset of STRATEGY_PRESETS) {
    assert.equal(validateStrategy(preset.selections).valid, true, preset.name);
    signatures.add(JSON.stringify([...preset.selections].sort((a, b) => a.measureId.localeCompare(b.measureId))));
    const strategy = createPresetStrategy(preset);
    assert.equal(strategy.name, preset.name);
    assert.deepEqual(strategy.selectedMeasures, preset.selections);
    assert.notEqual(strategy.selectedMeasures, preset.selections);
  }
  assert.equal(signatures.size, STRATEGY_PRESETS.length);
});

test('most different pair maximizes RMS city-indicator distance across all 66 pairs', () => {
  const evaluations = evaluatePresets();
  const best = findMostDifferentPresets(evaluations);
  let pairs = 0;
  for (let i = 0; i < evaluations.length; i++) for (let j = i + 1; j < evaluations.length; j++) {
    const independentlyCalculated = Math.sqrt(INDICATOR_CODES.map(code =>
      (evaluations[i].indicators[code] - evaluations[j].indicators[code]) ** 2,
    ).reduce((a, b) => a + b, 0) / 10);
    assert.ok(best.distance >= independentlyCalculated - 1e-12);
    pairs++;
  }
  assert.equal(pairs, 66);
  assert.equal(best.first.preset.id, 'mobility');
  assert.equal(best.second.preset.id, 'active');
  assert.ok(Math.abs(best.distance - 3.5345124310150653) < 1e-10);
  assert.equal(indicatorDistance(best.first.indicators, best.first.indicators), 0);
  assert.equal(indicatorDistance(best.first.indicators, best.second.indicators), indicatorDistance(best.second.indicators, best.first.indicators));
  assert.equal(findMostDifferentPresets([...evaluations].reverse()).distance, best.distance);
  assert.throws(() => findMostDifferentPresets([]), /At least two/);
});
