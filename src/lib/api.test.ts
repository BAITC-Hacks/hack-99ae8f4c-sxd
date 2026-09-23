import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISTRICTS } from '../data/districts.ts';
import { INDICATOR_CODES } from '../data/rules.ts';
import { POST as strategyPost } from '../app/api/strategy/route.ts';
import { POST as simulatePost } from '../app/api/simulate/route.ts';
import { POST as analyzePost } from '../app/api/analyze/route.ts';
import { POST as outlookPost } from '../app/api/outlook/route.ts';
import { generateLocalStrategy } from './agents/strategy.ts';
import { runOfficialSimulation } from './official.ts';
import { validateStrategy } from './validator.ts';
import type { ValidationResult } from './validator.ts';
import type { AnalysisReport, OutlookResponse, StrategyResponse } from '../types/product.ts';
import type { SimulationErrorResponse, SimulationRequest, SimulationResponse } from '../types/api.ts';
import type { Selection } from './simulator.ts';

process.env.FARSIGHT_AI_MODE = 'local';

const selections: Selection[] = [
  { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' },
  { measureId: 'M5', districtId: 'saryarka' },
];
type Route = (request: Request) => Promise<Response>;
const routes: readonly Route[] = [strategyPost, simulatePost, analyzePost, outlookPost];

function request(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('all API routes reject invalid JSON, non-object bodies and oversized requests with 400', async () => {
  for (const route of routes) {
    for (const body of ['{broken', 'null', '[]', '"text"', JSON.stringify({ large: 'x'.repeat(16_001) })]) {
      const response = await route(new Request('http://localhost/api/test', { method: 'POST', body }));
      assert.equal(response.status, 400);
      const payload = await response.json() as { error: string };
      assert.ok(payload.error.length > 0);
    }
  }
});

test('strategy API validates intent input and produces a valid comparison contract', async () => {
  for (const body of [{}, { intent: '' }, { intent: 123 }, { intent: 'x'.repeat(2001) },
    { intent: 'Green Growth', compareWith: [] }]) {
    assert.equal((await strategyPost(request(body))).status, 400);
  }
  const response = await strategyPost(request({ intent: 'Green Growth and compare it with Industrial-Mobility' }));
  assert.equal(response.status, 200);
  const payload = await response.json() as StrategyResponse;
  assert.ok(payload.strategyB);
  for (const strategy of [payload.strategyA, payload.strategyB]) {
    assert.equal(validateStrategy(strategy.selectedMeasures).valid, true);
    assert.equal(strategy.selectedMeasures.length, 5);
    assert.equal(strategy.generation.mode, 'local');
    assert.equal(strategy.totalBudget, validateStrategy(strategy.selectedMeasures).totalCost);
  }
  assert.notEqual(payload.strategyA.id, payload.strategyB.id);
});

test('simulation, analysis and outlook routes reject malformed selections with 400', async () => {
  for (const route of [simulatePost, analyzePost, outlookPost]) {
    for (const selectedMeasures of [undefined, {}, null, ['M1'], [null], [{ measureId: 1 }],
      [{ measureId: 'M1', districtId: null }], Array.from({ length: 21 }, () => ({ measureId: 'M12' }))]) {
      assert.equal((await route(request({ selectedMeasures }))).status, 400);
    }
  }
});

test('every calculation route rejects inadmissible official portfolios with structured 422 errors', async () => {
  for (const route of [simulatePost, analyzePost, outlookPost]) {
    const invalid = [
      selections.slice(1),
      [{ measureId: 'M99' }, ...selections.slice(1)],
      [{ measureId: 'M7', districtId: 'unknown' }, ...selections.slice(1)],
      [...selections.slice(0, 3), { measureId: 'M12', districtId: 'nura' }, selections[4]],
    ];
    for (const selectedMeasures of invalid) {
      const response = await route(request({ selectedMeasures }));
      assert.equal(response.status, 422);
      const payload = await response.json() as { error: string; validation: ValidationResult };
      assert.equal(payload.validation.valid, false);
      assert.ok(payload.validation.errors.length > 0);
      assert.ok(payload.validation.errors.every(error => error.code && error.message));
      assert.equal(payload.validation.totalCost + payload.validation.remainingBudget, 100);
    }
  }
});

test('simulation API returns the deterministic official contract and ignores forged scores', async () => {
  const expected = runOfficialSimulation(selections);
  const response = await simulatePost(request({
    selectedMeasures: selections, finalScore: 999999, baselineScore: -999999,
    result: { finalScore: 999999, indicatorsAfter: {} }, horizon: 96, budget: 1_000_000,
    dataset: { budget: 1_000_000, districts: [], measures: [] },
    districts: [], measures: [], weights: {}, synergies: [], validation: { valid: true },
  }));
  assert.equal(response.status, 200);
  const payload = await response.json() as SimulationResponse;
  assert.deepEqual(payload.validation, { valid: true, totalCost: 95, remainingBudget: 5, errors: [] });
  assert.deepEqual(payload.result, expected);
  assert.equal(payload.result.totalCost, 95);
  assert.equal(payload.result.remainingBudget, 5);
  assert.ok(Math.abs(payload.result.baselineScore - 52.56) < 0.01);
  assert.ok(Math.abs(payload.result.finalScore - 56.5) < 0.1);
  assert.equal(payload.result.scoreDelta, payload.result.finalScore - payload.result.baselineScore);
  assert.equal(payload.result.selectedMeasures.length, 5);
  assert.equal(Object.keys(payload.result.indicatorsAfter).length, 5);
  assert.equal(payload.result.contributions.length, 5);
  for (const { id } of DISTRICTS) {
    assert.equal(typeof payload.result.districtScoresBefore[id], 'number');
    assert.equal(typeof payload.result.districtScoresAfter[id], 'number');
    for (const indicator of INDICATOR_CODES) {
      assert.equal(payload.result.indicatorDeltas[id][indicator],
        payload.result.indicatorsAfter[id][indicator] - payload.result.indicatorsBefore[id][indicator]);
    }
  }
  assert.deepEqual(payload.result.activatedSynergies, [{
    measures: ['M10', 'M12'], districtId: 'nura', indicator: 'B1', bonus: 2, appliedBonus: 2,
  }]);
});

test('simulation API returns every official rule failure before producing a result', async () => {
  const cases: [Selection[], string][] = [
    [selections.slice(1), 'INVALID_SELECTION_COUNT'],
    [[{ measureId: 'M3', districtId: 'nura' }, ...selections.slice(1)], 'BUDGET_EXCEEDED'],
    [[{ measureId: 'M8', districtId: 'esil' }, ...selections.slice(1)], 'DUPLICATE_MEASURE'],
    [[{ measureId: 'M9', districtId: 'esil' }, ...selections.slice(0, 4)], 'CATEGORY_LIMIT_EXCEEDED'],
    [[{ measureId: 'M7' }, ...selections.slice(1)], 'MISSING_DISTRICT'],
    [[{ measureId: 'M1', districtId: 'nura' }, { measureId: 'M3', districtId: 'esil' },
      ...selections.slice(2)], 'INCOMPATIBLE_MEASURES'],
    [[...selections.slice(0, 4), { measureId: 'M4', districtId: 'nura' }], 'INCOMPATIBLE_MEASURES'],
    [[{ measureId: 'M5', districtId: 'saryarka' }, { measureId: 'M13', districtId: 'saryarka' },
      ...selections.slice(0, 3)], 'INCOMPATIBLE_MEASURES'],
  ];
  for (const [selectedMeasures, code] of cases) {
    const response = await simulatePost(request({ selectedMeasures, budget: 1_000_000 }));
    assert.equal(response.status, 422);
    const payload = await response.json() as SimulationErrorResponse;
    assert.ok(payload.validation);
    assert.equal(payload.validation.valid, false);
    assert.ok(payload.validation.errors.some(error => error.code === code), `Missing ${code}`);
    assert.equal('result' in payload, false);
  }
});

test('official simulation API works with AI enabled or unavailable and never calls the network', async t => {
  const originalMode = process.env.FARSIGHT_AI_MODE;
  const originalKey = process.env.OPENAI_API_KEY;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Network and AI are unavailable.');
  });
  try {
    const body: SimulationRequest = { selectedMeasures: selections };
    const payloads: SimulationResponse[] = [];
    for (const mode of ['local', 'model']) {
      process.env.FARSIGHT_AI_MODE = mode;
      if (mode === 'local') delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = 'simulation-test-key';
      const response = await simulatePost(request(body));
      assert.equal(response.status, 200);
      payloads.push(await response.json() as SimulationResponse);
    }
    assert.deepEqual(payloads[0], payloads[1]);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    if (originalMode === undefined) delete process.env.FARSIGHT_AI_MODE;
    else process.env.FARSIGHT_AI_MODE = originalMode;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('analysis API recomputes both official scores from selections and cannot echo forged scores', async () => {
  const comparisonMeasures = generateLocalStrategy('Industrial-Mobility').selectedMeasures;
  const expected = runOfficialSimulation(selections);
  const other = runOfficialSimulation(comparisonMeasures);
  const response = await analyzePost(request({
    selectedMeasures: selections, comparisonMeasures, question: 'Explain activated synergies',
    finalScore: 999999, comparison: { finalScore: 999999 }, result: { finalScore: 999999 },
  }));
  assert.equal(response.status, 200);
  const payload = await response.json() as { analysis: AnalysisReport };
  assert.ok(payload.analysis.summary.includes(expected.finalScore.toFixed(2)));
  assert.equal(payload.analysis.sections[0].title, 'Activated synergies');
  const comparison = payload.analysis.sections.find(s => s.title === 'Official strategy comparison');
  assert.ok(comparison?.body.includes(other.finalScore.toFixed(2)));
  assert.ok(!JSON.stringify(payload).includes('999999'));
});

test('analysis and outlook independently validate comparison selections', async () => {
  for (const route of [analyzePost, outlookPost]) {
    assert.equal((await route(request({ selectedMeasures: selections, comparisonMeasures: [] }))).status, 422);
    assert.equal((await route(request({ selectedMeasures: selections, comparisonMeasures: ['M1'] }))).status, 400);
  }
});

test('outlook API seeds from the exact official state and keeps its index separate from official scoring', async () => {
  const comparisonMeasures = generateLocalStrategy('Green Growth').selectedMeasures;
  const official = runOfficialSimulation(selections);
  const comparisonOfficial = runOfficialSimulation(comparisonMeasures);
  const before = structuredClone(official);
  const input = { selectedMeasures: selections, comparisonMeasures, finalScore: 999999,
    official: { finalScore: 999999, indicatorsAfter: {} } };
  const response = await outlookPost(request(input));
  assert.equal(response.status, 200);
  const payload = await response.json() as OutlookResponse;
  assert.equal(payload.research.mode, 'demo');
  assert.match(payload.research.notice, /demo/i);
  assert.ok(payload.research.factors.length > 0);
  assert.equal(payload.scenario.kind, 'scenario');
  assert.equal(payload.scenario.metricLabel, 'Scenario indicator index');
  assert.deepEqual(payload.scenario.checkpoints.map(c => c.year), [2026, 2028, 2030, 2035, 2040, 2045, 2050]);
  const seed = payload.scenario.checkpoints.find(c => c.phase === 'official-seed');
  assert.ok(seed);
  assert.equal(seed.year, 2028);
  assert.deepEqual(seed.districtIndicators, official.indicatorsAfter);
  const expectedIndex = DISTRICTS.reduce((sum, district) => sum + district.populationShare *
    INDICATOR_CODES.reduce((metricSum, indicator) => metricSum + official.indicatorsAfter[district.id][indicator] *
      payload.scenario.assumptions.metricWeights[indicator], 0), 0);
  assert.ok(Math.abs(seed.index - expectedIndex) < 1e-10);
  assert.notEqual(seed.index, official.finalScore);
  assert.ok(payload.comparisonScenario);
  assert.deepEqual(payload.comparisonScenario.checkpoints.find(c => c.phase === 'official-seed')!.districtIndicators,
    comparisonOfficial.indicatorsAfter);
  assert.deepEqual(payload.scenario.factors, payload.comparisonScenario.factors);
  assert.deepEqual(payload.scenario.assumptions, payload.comparisonScenario.assumptions);
  assert.match(payload.analysis.summary, /separate from the official/i);
  assert.ok(payload.analysis.sections.some(section => section.title === 'Why trajectories diverge'));
  assert.equal('finalScore' in payload.scenario, false);
  assert.deepEqual(official, before);
  assert.deepEqual(runOfficialSimulation(selections), before);
  // A clean request must produce exactly the same outlook as the forged-score request.
  const repeated = await outlookPost(request({ selectedMeasures: selections, comparisonMeasures }));
  assert.deepEqual(await repeated.json(), payload);
});
