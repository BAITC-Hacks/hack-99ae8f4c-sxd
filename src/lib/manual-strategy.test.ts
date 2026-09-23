import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManualStrategy } from './manual-strategy.ts';
import { runOfficialSimulation } from './official.ts';

const selections = [
  { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' },
  { measureId: 'M5', districtId: 'saryarka' },
];
test('manual decisions preserve exact measures and districts and reproduce the dataset example', () => {
  const strategy = createManualStrategy(selections);
  assert.deepEqual(strategy.selectedMeasures, selections);
  assert.equal(strategy.generation.mode, 'manual');
  assert.equal(strategy.totalBudget, 95);
  const result = runOfficialSimulation(strategy.selectedMeasures);
  assert.equal(result.remainingBudget, 5);
  assert.ok(Math.abs(result.finalScore - 56.5) < 0.1);
  selections[0].districtId = 'esil';
  assert.equal(strategy.selectedMeasures[0].districtId, 'nura');
  selections[0].districtId = 'nura';
});
test('manual decisions reject incomplete, over-budget and incompatible choices', () => {
  assert.throws(() => createManualStrategy(selections.slice(1)), /exactly 5/);
  assert.throws(() => createManualStrategy([{ measureId: 'M3', districtId: 'nura' }, ...selections.slice(1)]), /budget/);
  assert.throws(() => createManualStrategy([{ measureId: 'M7' }, ...selections.slice(1)]), /district/);
  assert.throws(() => createManualStrategy([...selections.slice(0, 4), { measureId: 'M4', districtId: 'nura' }]), /cannot both/);
});
test('changing a manually selected district changes the official outcome', () => {
  const a = runOfficialSimulation(createManualStrategy(selections).selectedMeasures);
  const b = runOfficialSimulation(createManualStrategy(selections.map((s, i) => i === 0 ? { ...s, districtId: 'esil' } : s)).selectedMeasures);
  assert.notEqual(a.finalScore, b.finalScore);
});
