import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISTRICTS } from '../data/districts.ts';
import { MEASURES } from '../data/measures.ts';
import { generateLocalStrategy, generateStrategies, generateStrategy } from './agents/strategy.ts';
import type { StrategyDraft, StrategyProvider } from './agents/strategy.ts';
import { analyzeOfficialResult, prioritizeAnalysis } from './agents/analysis.ts';
import { runOfficialSimulation } from './official.ts';
import { validateStrategy } from './validator.ts';
import type { Selection } from './simulator.ts';
import type { GeneratedStrategy } from '../types/product.ts';

process.env.FARSIGHT_AI_MODE = 'local';

function assertValid(strategy: GeneratedStrategy) {
  const validation = validateStrategy(strategy.selectedMeasures);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(strategy.selectedMeasures.length, 5);
  assert.equal(strategy.totalBudget, validation.totalCost);
  assert.ok(strategy.totalBudget <= 100);
  assert.equal(new Set(strategy.selectedMeasures.map(s => s.measureId)).size, 5);
  assert.ok(Math.abs(strategy.priorities.reduce((sum, p) => sum + p.weight, 0) - 1) < 1e-10);
  assert.ok(strategy.name.trim());
  assert.ok(strategy.description.trim());
  assert.ok(strategy.targetedDistricts.every(id => DISTRICTS.some(d => d.id === id)));
}

test('local strategy variants are valid, deterministic and reflect different priorities', () => {
  for (const intent of ['Green Growth', 'Industrial-Mobility First', 'Social health and schools',
    'Safety First', 'Utilities infrastructure', 'Balanced development', 'Зелёное развитие Нура']) {
    const strategy = generateLocalStrategy(intent);
    assertValid(strategy);
    assert.equal(strategy.generation.mode, 'local');
    assert.deepEqual(strategy, generateLocalStrategy(intent));
  }
  const green = generateLocalStrategy('Green Growth');
  const industry = generateLocalStrategy('Industrial-Mobility First');
  assert.notDeepEqual(green.selectedMeasures, industry.selectedMeasures);
  assert.equal(green.name, 'Green Growth');
  assert.equal(industry.name, 'Industrial-Mobility First');
  assert.ok(green.priorities.find(p => p.category === 'Ecology')!.weight >
    green.priorities.find(p => p.category === 'Transport')!.weight);
  assert.ok(industry.priorities.find(p => p.category === 'Transport')!.weight >
    industry.priorities.find(p => p.category === 'Ecology')!.weight);
});

test('explicit district requests restrict local measure targets while city measures retain city scope', () => {
  for (const district of DISTRICTS) {
    const strategy = generateLocalStrategy(`Create green transport strategy in ${district.name}`);
    assertValid(strategy);
    for (const selection of strategy.selectedMeasures) {
      const measure = MEASURES.find(m => m.id === selection.measureId)!;
      assert.equal(selection.districtId, measure.scope === 'city' ? undefined : district.id);
    }
  }
});

test('invalid provider proposals are repaired through the validator', async () => {
  const invalidDrafts: StrategyDraft[] = [
    { selectedMeasures: [] },
    { selectedMeasures: Array.from({ length: 5 }, () => ({ measureId: 'M7', districtId: 'nura' })) },
    { selectedMeasures: [{ measureId: 'M99' }, ...generateLocalStrategy('Green Growth').selectedMeasures.slice(1)] },
  ];
  for (const draft of invalidDrafts) {
    let calls = 0;
    const provider: StrategyProvider = { async generate() { calls++; return draft; } };
    const strategy = await generateStrategy('Green Growth in Nura', provider);
    assert.equal(calls, 2);
    assertValid(strategy);
    assert.equal(strategy.generation.mode, 'local');
    assert.equal(strategy.generation.repaired, true);
    assert.match(strategy.generation.note, /one repair attempt/i);
  }
});

test('unavailable provider falls back locally and a valid provider response retains validated selections', async () => {
  const fallback = await generateStrategy('Industrial-Mobility First', {
    async generate() { throw new Error('Provider unavailable'); },
  });
  assertValid(fallback);
  assert.equal(fallback.generation.mode, 'local');
  assert.match(fallback.generation.note, /unavailable/i);

  const local = generateLocalStrategy('Green Growth');
  const selected = await generateStrategy('Green Growth', {
    async generate() { return { name: 'Provider draft', selectedMeasures: local.selectedMeasures }; },
  });
  assertValid(selected);
  assert.equal(selected.generation.mode, 'model');
  assert.equal(selected.generation.repaired, false);
  assert.equal(selected.name, 'Provider draft');
  assert.deepEqual(selected.selectedMeasures, local.selectedMeasures);
  assert.deepEqual(await generateStrategy('Green Growth', null), local);
});

test('comparison intent and explicit compareWith produce two independently valid strategies', async () => {
  const parsed = await generateStrategies('Create a Green Growth strategy and compare it with Industrial-Mobility.', undefined, null);
  assertValid(parsed.strategyA);
  assert.ok(parsed.strategyB);
  assertValid(parsed.strategyB);
  assert.equal(parsed.strategyA.name, 'Green Growth');
  assert.equal(parsed.strategyB.name, 'Industrial-Mobility First');
  assert.notEqual(parsed.strategyA.id, parsed.strategyB.id);
  const explicit = await generateStrategies('Green Growth', 'Industrial-Mobility', null);
  assert.deepEqual(explicit.strategyA.selectedMeasures, parsed.strategyA.selectedMeasures);
  assert.deepEqual(explicit.strategyB?.selectedMeasures, parsed.strategyB.selectedMeasures);
  assert.equal((await generateStrategies('Green Growth', undefined, null)).strategyB, undefined);
});

const explainableSelections: Selection[] = [
  { measureId: 'M11', districtId: 'nura' },
  { measureId: 'M10', districtId: 'baikonur' },
  { measureId: 'M12' },
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M5', districtId: 'saryarka' },
];

test('official analysis quotes calculated scores, negative effects, synergies and marginal contributions', () => {
  const result = runOfficialSimulation(explainableSelections);
  const before = structuredClone(result);
  const comparison = runOfficialSimulation(generateLocalStrategy('Green Growth').selectedMeasures);
  const report = analyzeOfficialResult(result, comparison);
  assert.equal(report.mode, 'calculated');
  assert.ok(report.summary.includes(result.baselineScore.toFixed(2)));
  assert.ok(report.summary.includes(result.finalScore.toFixed(2)));
  assert.ok(report.summary.includes(result.scoreDelta.toFixed(2)));
  const sections = new Map(report.sections.map(s => [s.title, s.body]));
  assert.match(sections.get('What worsened')!, /Nura T1 -1\.75/);
  assert.match(sections.get('Activated synergies')!, /M10 \+ M12 in Baikonur: B1 \+2\.00/);
  const highest = [...result.contributions].sort((a, b) => b.marginalScoreContribution - a.marginalScoreContribution)[0];
  assert.ok(sections.get('Strongest measure contributions')!.includes(highest.selection.measureId));
  assert.ok(sections.get('Strongest measure contributions')!.includes(highest.marginalScoreContribution.toFixed(2)));
  assert.ok(sections.get('Official strategy comparison')!.includes(comparison.finalScore.toFixed(2)));
  assert.deepEqual(result, before);
});

test('analysis improvement recommendation is an admissible substitution with its exact reported engine score', () => {
  const result = runOfficialSimulation(explainableSelections);
  const report = analyzeOfficialResult(result);
  const recommendation = report.improvements.find(text => text.startsWith('A validated one-measure alternative'));
  assert.ok(recommendation, 'Fixture should admit a better one-measure portfolio');
  const match = recommendation.match(/replaces (M\d+) with (M\d+)/);
  assert.ok(match);
  const [, removed, added] = match;
  const target = DISTRICTS.find(d => recommendation.includes(` in ${d.name}.`));
  const candidate: Selection[] = result.selectedMeasures.map(s => s.measureId === removed ?
    { measureId: added, ...(target ? { districtId: target.id } : {}) } : s);
  assert.equal(validateStrategy(candidate).valid, true);
  const recalculated = runOfficialSimulation(candidate);
  assert.ok(recalculated.finalScore > result.finalScore);
  assert.ok(recommendation.includes(`engine calculates ${recalculated.finalScore.toFixed(2)} QoL`));
  assert.ok(recommendation.includes(`at ${recalculated.totalCost}/100 budget`));
});

test('analysis question prioritization preserves all verified statements and score prose', async () => {
  const report = analyzeOfficialResult(runOfficialSimulation(explainableSelections));
  const prioritized = await prioritizeAnalysis(report, 'Explain activated synergies');
  assert.equal(prioritized.summary, report.summary);
  assert.equal(prioritized.sections[0].title, 'Activated synergies');
  assert.deepEqual(new Map(prioritized.sections.map(s => [s.title, s.body])),
    new Map(report.sections.map(s => [s.title, s.body])));
});
