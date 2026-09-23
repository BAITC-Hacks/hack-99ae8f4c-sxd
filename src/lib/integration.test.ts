import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST as strategyPost } from '../app/api/strategy/route.ts';
import { POST as simulatePost } from '../app/api/simulate/route.ts';
import { POST as analyzePost } from '../app/api/analyze/route.ts';
import { POST as outlookPost } from '../app/api/outlook/route.ts';
import { generateLocalStrategy } from './agents/strategy.ts';
import { demoFutureResearchProvider, getFutureFactors } from './agents/future-research.ts';
import { runOfficialSimulation } from './official.ts';
import { validateStrategy } from './validator.ts';
import { logStage, traceStage, withDeadline, OperationTimeoutError } from './integration.ts';
import { RequestSession } from './request-session.ts';
import type { StrategyResponse, OutlookResponse } from '../types/product.ts';
import type { AnalysisResponse, SimulationResponse } from '../types/api.ts';

function request(body: unknown) { return new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) }); }
const local = generateLocalStrategy('Green Growth');

test('no API keys: complete official demo, comparison, explanation and optional outlook', async t => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  for (const key of Object.keys(process.env)) if (/API_KEY$|TOKEN$/.test(key)) delete process.env[key];
  process.env.FARSIGHT_AI_MODE = 'auto';
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network in offline demo'); });
  const generated = await strategyPost(request({ intent: 'Green Growth', compareWith: 'Industrial-Mobility' }));
  assert.equal(generated.status, 200);
  const strategies = await generated.json() as StrategyResponse;
  assert.ok(strategies.strategyB);
  for (const strategy of [strategies.strategyA, strategies.strategyB]) {
    assert.equal(strategy.generation.mode, 'local');
    const response = await simulatePost(request({ selectedMeasures: strategy.selectedMeasures }));
    assert.equal(response.status, 200);
    const payload = await response.json() as SimulationResponse;
    assert.equal(payload.validation.valid, true);
    assert.ok(Number.isFinite(payload.result.finalScore));
  }
  const body = { selectedMeasures: strategies.strategyA.selectedMeasures, comparisonMeasures: strategies.strategyB.selectedMeasures };
  assert.equal((await analyzePost(request(body))).status, 200);
  const outlook = await outlookPost(request(body));
  assert.equal(outlook.status, 200);
  assert.equal((await outlook.json() as OutlookResponse).research.mode, 'demo');
  assert.equal(network.mock.callCount(), 0);
});

test('live strategy HTTP contract accepts valid output and repairs invalid output before simulation', async t => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env.FARSIGHT_AI_MODE = 'auto';
  process.env.OPENAI_API_KEY = 'integration-test-not-a-secret';
  let invalid = false;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    const draft = { ...local, selectedMeasures: invalid ? [{ measureId: 'UNKNOWN' }] : local.selectedMeasures };
    invalid = false;
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] });
  });
  for (const needsRepair of [false, true]) {
    invalid = needsRepair;
    const response = await strategyPost(request({ intent: 'Green Growth' }));
    assert.equal(response.status, 200);
    const { strategyA } = await response.json() as StrategyResponse;
    assert.equal(strategyA.generation.mode, 'model');
    assert.equal(strategyA.generation.repaired, needsRepair);
    assert.equal(validateStrategy(strategyA.selectedMeasures).valid, true);
    assert.equal((await simulatePost(request({ selectedMeasures: strategyA.selectedMeasures }))).status, 200);
  }
  assert.equal(calls, 3);
});

test('analysis provider failure preserves calculated evidence and official numbers', async t => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env.FARSIGHT_AI_MODE = 'auto';
  process.env.OPENAI_API_KEY = 'integration-test-not-a-secret';
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Injected analysis failure'); });
  const body = { selectedMeasures: local.selectedMeasures };
  const official = await (await simulatePost(request(body))).json() as SimulationResponse;
  const response = await analyzePost(request(body));
  assert.equal(response.status, 200);
  const { analysis } = await response.json() as AnalysisResponse;
  assert.ok(analysis.summary.includes(official.result.finalScore.toFixed(2)));
  assert.deepEqual((await (await simulatePost(request(body))).json() as SimulationResponse).result, official.result);
});

test('live research provider contract succeeds with sourced factors', async () => {
  const official = runOfficialSimulation(local.selectedMeasures);
  const factors = await demoFutureResearchProvider.research(official);
  const research = await getFutureFactors(official, { id: 'integration-live-fixture', mode: 'live', async research() {
    return factors.map(factor => ({ ...factor, sources: [{ title: 'Synthetic fixture source', url: 'https://worldbank.org/research/integration-fixture' }] }));
  } });
  assert.equal(research.mode, 'live');
  assert.ok(research.factors.every(factor => factor.sources.length > 0));
});

test('research deadline returns human-readable 504 while official result remains available', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(demoFutureResearchProvider, 'research', async () => new Promise<never>(() => {}));
  const body = { selectedMeasures: local.selectedMeasures };
  const pending = outlookPost(request(body));
  // Let body parsing and provider invocation install the deadline before advancing time.
  await new Promise<void>(resolve => setImmediate(resolve));
  t.mock.timers.tick(70_001);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /official result is still available/i);
  assert.equal((await simulatePost(request(body))).status, 200);
});

test('malformed research is rejected by the optional endpoint without damaging official simulation', async t => {
  const factors = await demoFutureResearchProvider.research(runOfficialSimulation(local.selectedMeasures));
  t.mock.method(demoFutureResearchProvider, 'research', async () => [{ ...factors[0], strength: Number.NaN }]);
  const body = { selectedMeasures: local.selectedMeasures };
  assert.equal((await outlookPost(request(body))).status, 500);
  assert.equal((await simulatePost(request(body))).status, 200);
});

test('reset invalidates old completions and overlapping submissions cannot leak into a new session', () => {
  const session = new RequestSession();
  const old = session.begin()!;
  assert.equal(session.begin(), undefined);
  session.reset();
  const fresh = session.begin()!;
  assert.equal(session.isCurrent(old), false);
  assert.equal(session.finish(old), false);
  assert.equal(session.begin(), undefined, 'old completion must not unlock new request');
  assert.equal(session.isCurrent(fresh), true);
  assert.equal(session.finish(fresh), true);
  assert.notEqual(session.begin(), undefined);
});

test('development logs exclude payloads and raw provider errors; deadline clears on success', async t => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env = { ...process.env, NODE_ENV: 'development' };
  const logger = t.mock.method(console, 'info', () => {});
  await assert.rejects(traceStage('analysis', () => { throw new Error('SECRET_PROVIDER_PAYLOAD'); }));
  logStage('strategy_generation', 'fallback');
  assert.equal(JSON.stringify(logger.mock.calls).includes('SECRET_PROVIDER_PAYLOAD'), false);
  assert.equal(await withDeadline(Promise.resolve(42), 10), 42);
  await assert.rejects(withDeadline(new Promise(() => {}), 1), OperationTimeoutError);
});
