import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST as strategyPost } from '../app/api/strategy/route.ts';
import { POST as simulatePost } from '../app/api/simulate/route.ts';
import { POST as analyzePost } from '../app/api/analyze/route.ts';
import { POST as outlookPost } from '../app/api/outlook/route.ts';
import { demoFutureResearchProvider } from './agents/future-research.ts';
import { generateLocalStrategy } from './agents/strategy.ts';
import { runOfficialSimulation } from './official.ts';
import { validateStrategy } from './validator.ts';
import type { AnalysisReport, OutlookResponse, StrategyResponse } from '../types/product.ts';
import type { FutureFactor } from '../types/outlook.ts';
import type { SimulationResult } from './simulator.ts';

process.env.FARSIGHT_AI_MODE = 'local';

function request(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('natural-language API request preserves social indicators and compares two validated official results', async () => {
  const response = await strategyPost(request({
    intent: 'Prioritize transport and city services while keeping social indicators stable.',
    compareWith: 'Green Growth',
  }));
  assert.equal(response.status, 200);
  const strategies = await response.json() as StrategyResponse;
  assert.ok(strategies.strategyB);
  const results: SimulationResult[] = [];
  for (const strategy of [strategies.strategyA, strategies.strategyB]) {
    const validation = validateStrategy(strategy.selectedMeasures);
    assert.equal(validation.valid, true);
    assert.equal(strategy.selectedMeasures.length, 5);
    assert.equal(strategy.totalBudget, validation.totalCost);
    assert.ok(strategy.name.trim() && strategy.description.trim());
    assert.equal(new Set(strategy.priorities.map(p => p.category)).size, 5);
    assert.ok(strategy.targetedDistricts.length > 0);
    const simulated = await simulatePost(request({ selectedMeasures: strategy.selectedMeasures }));
    assert.equal(simulated.status, 200);
    const { result } = await simulated.json() as { result: SimulationResult };
    assert.deepEqual(result, runOfficialSimulation(strategy.selectedMeasures));
    results.push(result);
  }
  for (const delta of Object.values(results[0].indicatorDeltas)) {
    assert.equal(delta.S1, 0);
    assert.equal(delta.S2, 0);
  }
  const explanation = await analyzePost(request({
    selectedMeasures: strategies.strategyA.selectedMeasures,
    comparisonMeasures: strategies.strategyB.selectedMeasures,
  }));
  assert.equal(explanation.status, 200);
  const { analysis } = await explanation.json() as { analysis: AnalysisReport };
  const comparison = analysis.sections.find(section => section.title === 'Official strategy comparison')!;
  assert.ok(comparison.body.includes(results[0].finalScore.toFixed(2)));
  assert.ok(comparison.body.includes(results[1].finalScore.toFixed(2)));
});

test('AI outage still permits valid generation, official simulation and calculated API explanation', async t => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.FARSIGHT_AI_MODE = 'auto';
  process.env.OPENAI_API_KEY = 'test-key-no-network';
  t.after(() => {
    process.env.FARSIGHT_AI_MODE = 'local';
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  const provider = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Injected AI outage'); });
  const generated = await strategyPost(request({ intent: 'Industrial-Mobility First' }));
  assert.equal(generated.status, 200);
  const { strategyA } = await generated.json() as StrategyResponse;
  assert.equal(strategyA.generation.mode, 'local');
  assert.match(strategyA.generation.note, /unavailable/i);
  assert.equal(validateStrategy(strategyA.selectedMeasures).valid, true);
  assert.equal(provider.mock.callCount(), 1);
  const simulated = await simulatePost(request({ selectedMeasures: strategyA.selectedMeasures }));
  assert.equal(simulated.status, 200);
  const { result } = await simulated.json() as { result: SimulationResult };
  assert.equal(provider.mock.callCount(), 1, 'official simulation must never invoke AI');
  const explained = await analyzePost(request({ selectedMeasures: strategyA.selectedMeasures }));
  assert.equal(explained.status, 200);
  const { analysis } = await explained.json() as { analysis: AnalysisReport };
  assert.ok(analysis.summary.includes(result.finalScore.toFixed(2)));
  assert.equal(provider.mock.callCount(), 2);
});

test('research outage is contained in the optional API and cannot alter or block official simulation', async t => {
  const strategy = generateLocalStrategy('Green Growth');
  const expected = runOfficialSimulation(strategy.selectedMeasures);
  const provider = t.mock.method(demoFutureResearchProvider, 'research', async (official: SimulationResult) => {
    assert.deepEqual(official, expected, 'research receives the computed two-year result');
    throw new Error('Injected future research outage');
  });
  const failed = await outlookPost(request({ selectedMeasures: strategy.selectedMeasures }));
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Unable to complete this operation. Please try again.' });
  assert.equal(provider.mock.callCount(), 1);
  const simulated = await simulatePost(request({ selectedMeasures: strategy.selectedMeasures }));
  assert.equal(simulated.status, 200);
  assert.deepEqual((await simulated.json() as { result: SimulationResult }).result, expected);
  assert.equal((await analyzePost(request({ selectedMeasures: strategy.selectedMeasures }))).status, 200);
  assert.equal(provider.mock.callCount(), 1, 'official simulation and explanation do not request research');
});

test('outlook comparison is symmetric and conflicts cannot silently choose one strategy assumption', async t => {
  const a = generateLocalStrategy('Industrial-Mobility First').selectedMeasures;
  const b = generateLocalStrategy('Green Growth').selectedMeasures;
  const forward = await outlookPost(request({ selectedMeasures: a, comparisonMeasures: b }));
  const reverse = await outlookPost(request({ selectedMeasures: b, comparisonMeasures: a }));
  assert.equal(forward.status, 200);
  assert.equal(reverse.status, 200);
  const first = await forward.json() as OutlookResponse;
  const second = await reverse.json() as OutlookResponse;
  assert.deepEqual(first.scenario, second.comparisonScenario);
  assert.deepEqual(first.comparisonScenario, second.scenario);
  assert.deepEqual(first.research, second.research);
  let calls = 0;
  t.mock.method(demoFutureResearchProvider, 'research', async (): Promise<FutureFactor[]> => [{
    id: 'conflicting-factor', name: 'Conflicting assumption', direction: 'negative',
    strength: ++calls === 1 ? 0.1 : 0.9, confidence: 0.2,
    startYear: 2030, endYear: 2050, affectedMetrics: ['T1'], rationale: 'Demo test only', sources: [],
  }]);
  assert.equal((await outlookPost(request({ selectedMeasures: a, comparisonMeasures: b }))).status, 500);
  assert.equal((await simulatePost(request({ selectedMeasures: a }))).status, 200);
});
