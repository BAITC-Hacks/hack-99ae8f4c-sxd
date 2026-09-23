import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISTRICTS } from '../data/districts.ts';
import { CATEGORIES } from '../data/rules.ts';
import { generateLocalStrategy, generateStrategy } from './agents/strategy.ts';
import type { StrategyDraft } from './agents/strategy.ts';
import { runOfficialSimulation } from './official.ts';
import { validateStrategy } from './validator.ts';
import type { ValidationErrorCode } from './validator.ts';

const naturalLanguageIntent = 'Prioritize transport and city services while keeping social indicators stable.';

test('natural-language intent emphasizes transport and services while official social indicators stay stable', async () => {
  const strategy = await generateStrategy(naturalLanguageIntent, null);
  const validation = validateStrategy(strategy.selectedMeasures);
  assert.equal(validation.valid, true);
  assert.equal(strategy.selectedMeasures.length, 5);
  assert.equal(strategy.totalBudget, validation.totalCost);
  assert.ok(strategy.name.trim());
  assert.ok(strategy.description.trim());
  assert.deepEqual(new Set(strategy.priorities.map(priority => priority.category)), new Set(CATEGORIES));
  const weights = Object.fromEntries(strategy.priorities.map(priority => [priority.category, priority.weight]));
  assert.ok(weights.Transport > weights.Social);
  assert.ok(weights.Services > weights.Social);
  assert.ok(strategy.targetedDistricts.length > 0);
  assert.ok(strategy.targetedDistricts.every(id => DISTRICTS.some(district => district.id === id)));
  const result = runOfficialSimulation(strategy.selectedMeasures);
  assert.ok(Number.isFinite(result.finalScore));
  for (const district of DISTRICTS) {
    assert.equal(result.indicatorDeltas[district.id].S1, 0);
    assert.equal(result.indicatorDeltas[district.id].S2, 0);
  }
});

test('model portfolios cannot bypass budget, category, district or incompatibility rules', async () => {
  const cases: { code: ValidationErrorCode; selectedMeasures: StrategyDraft['selectedMeasures'] }[] = [
    { code: 'BUDGET_EXCEEDED', selectedMeasures: [
      { measureId: 'M3', districtId: 'nura' }, { measureId: 'M5', districtId: 'saryarka' },
      { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' },
      { measureId: 'M13', districtId: 'baikonur' },
    ] },
    { code: 'CATEGORY_LIMIT_EXCEEDED', selectedMeasures: [
      { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' },
      { measureId: 'M9', districtId: 'nura' }, { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' },
    ] },
    { code: 'INCOMPATIBLE_MEASURES', selectedMeasures: [
      { measureId: 'M4', districtId: 'nura' }, { measureId: 'M7', districtId: 'nura' },
      { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' }, { measureId: 'M14' },
    ] },
    { code: 'INCOMPATIBLE_MEASURES', selectedMeasures: [
      { measureId: 'M1', districtId: 'nura' }, { measureId: 'M3', districtId: 'almaty' },
      { measureId: 'M9', districtId: 'nura' }, { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' },
    ] },
    ...(['MISSING_DISTRICT', 'INVALID_DISTRICT', 'INVALID_TARGET'] as const).map(code => ({
      code,
      selectedMeasures: [
        code === 'MISSING_DISTRICT' ? { measureId: 'M7' } :
          code === 'INVALID_DISTRICT' ? { measureId: 'M7', districtId: 'unknown' } :
            { measureId: 'M14', districtId: 'nura' },
        { measureId: 'M8', districtId: 'nura' }, { measureId: 'M9', districtId: 'nura' },
        { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' },
      ],
    })),
  ];
  for (const { code, selectedMeasures } of cases) {
    assert.ok(validateStrategy(selectedMeasures).errors.some(error => error.code === code));
    const generated = await generateStrategy(naturalLanguageIntent, {
      async generate() { return { selectedMeasures }; },
    });
    assert.equal(generated.generation.repaired, true, code);
    assert.equal(generated.generation.mode, 'local', code);
    assert.equal(validateStrategy(generated.selectedMeasures).valid, true, code);
    assert.equal(generated.totalBudget, validateStrategy(generated.selectedMeasures).totalCost, code);
  }
});

test('valid model selections retain provenance while malformed metadata is normalized safely', async () => {
  const local = generateLocalStrategy(naturalLanguageIntent);
  for (const priorities of [null, 'invalid', Array(5).fill(null),
    local.priorities.map(priority => ({ ...priority, weight: Number.NaN })),
    local.priorities.map(priority => ({ ...priority, rationale: '   ' })),
    local.priorities.map(priority => ({ ...priority, category: 'Transport' })),
  ]) {
    const strategy = await generateStrategy(naturalLanguageIntent, {
      async generate() {
        return {
          name: '   ', description: '   ', priorities,
          selectedMeasures: local.selectedMeasures.map(selection => ({ ...selection, inventedScore: 999999 })),
        } as unknown as StrategyDraft;
      },
    });
    assert.equal(strategy.generation.mode, 'model');
    assert.equal(strategy.generation.repaired, false);
    assert.ok(strategy.name.trim());
    assert.ok(strategy.description.trim());
    assert.deepEqual(strategy.priorities, local.priorities);
    assert.deepEqual(strategy.selectedMeasures, local.selectedMeasures);
    assert.equal('inventedScore' in strategy.selectedMeasures[0], false);
    assert.equal(strategy.totalBudget, local.totalBudget);
  }
});
