import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { POST as strategyPost } from '../app/api/strategy/route.ts';
import { POST as analyzePost } from '../app/api/analyze/route.ts';
import { generateLocalStrategy, generateStrategy } from './agents/strategy.ts';
import { modelConfig, structuredModelOutput } from './agents/model.ts';
import { validateStrategy } from './validator.ts';
import { analyzeOfficialResult } from './agents/analysis.ts';
import { runOfficialSimulation } from './official.ts';
import type { GeneratedStrategy, StrategyResponse } from '../types/product.ts';

const prompts = [
  'Create an Industrial-Mobility First strategy.',
  'Prioritize transport and services while keeping social indicators stable.',
  'Create Green Growth and compare it with Industrial-Mobility.',
  'Improve safety and social services in Nura.',
  'Prioritize clean parks and water infrastructure in Saryarka.',
];
function configure(t: TestContext, key = 'integration-test-key', timeout = '18000') {
  const before = { ...process.env };
  process.env.OPENAI_API_KEY = key;
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
  process.env.FARSIGHT_AI_MODE = 'auto';
  process.env.FARSIGHT_LLM_TIMEOUT_MS = timeout;
  t.after(() => {
    for (const name of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'FARSIGHT_AI_MODE', 'FARSIGHT_LLM_TIMEOUT_MS']) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });
}
function request(body: unknown) {
  return new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) });
}
function response(value: unknown, raw = false) {
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [
    { type: 'output_text', text: raw ? value : JSON.stringify(value) },
  ] }] });
}
function valid(strategy: GeneratedStrategy) {
  const validation = validateStrategy(strategy.selectedMeasures);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(strategy.selectedMeasures.length, 5);
  assert.ok(validation.totalCost <= 100);
  assert.equal(strategy.totalBudget, validation.totalCost);
}
function draft(intent = 'Green Growth') {
  const local = generateLocalStrategy(intent);
  return { name: local.name, description: local.description, priorities: local.priorities,
    selectedMeasures: local.selectedMeasures.map(s => ({ ...s, districtId: s.districtId ?? null })) };
}

test('five natural-language API prompts return valid typed strategies with a model and without a key', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.match(body.instructions, /Never compute or mention a score/);
    return response(draft(JSON.parse(body.input).intent));
  });
  for (const mode of ['model', 'local']) {
    if (mode === 'local') delete process.env.OPENAI_API_KEY;
    const beforeCalls = mock.mock.callCount();
    for (const intent of prompts) {
      const result = await strategyPost(request({ intent }));
      assert.equal(result.status, 200);
      const strategies = await result.json() as StrategyResponse;
      if (intent.includes('compare')) assert.ok(strategies.strategyB);
      for (const strategy of [strategies.strategyA, strategies.strategyB].filter(s => !!s)) {
        valid(strategy);
        assert.equal(strategy.generation.mode, mode);
      }
    }
    assert.equal(mock.mock.callCount() - beforeCalls, mode === 'model' ? 6 : 0);
  }
});

test('invalid portfolio is repaired once with validator feedback and original intent', async t => {
  configure(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const input = JSON.parse(JSON.parse(init!.body as string).input);
    assert.equal(input.intent, prompts[0]);
    if (++calls === 1) return response({ selectedMeasures: [] });
    assert.match(input.repair.errors.join(' '), /exactly 5/);
    assert.deepEqual(input.repair.previous.selectedMeasures, []);
    return response(draft());
  });
  const result = await generateStrategy(prompts[0]);
  valid(result);
  assert.equal(result.generation.mode, 'model');
  assert.equal(result.generation.repaired, true);
  assert.equal(calls, 2);
});

test('malformed content is retried exactly once, then uses a validated local strategy', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => response('{bad json', true));
  for (const bad of ['{bad json', null, [], { selectedMeasures: [null] }, { selectedMeasures: [] }]) {
    mock.mock.mockImplementation(async () => response(bad, typeof bad === 'string'));
    const before = mock.mock.callCount();
    const result = await generateStrategy('Green Growth');
    valid(result);
    assert.equal(result.generation.mode, 'local');
    assert.equal(result.generation.repaired, true);
    assert.equal(mock.mock.callCount() - before, 2);
  }
  let calls = 0;
  mock.mock.mockImplementation(async () => ++calls === 1 ? response('{bad', true) : response(draft()));
  const repaired = await generateStrategy('Green Growth');
  assert.equal(repaired.generation.mode, 'model');
  assert.equal(repaired.generation.repaired, true);
  valid(repaired);
});

test('HTTP errors, network outages and refusal fall back without wasteful retries', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  for (const fail of [
    async () => new Response('', { status: 401 }),
    async () => new Response('', { status: 429 }),
    async () => new Response('', { status: 503 }),
    async () => { throw new Error('offline'); },
    async () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }),
  ]) {
    mock.mock.mockImplementation(fail);
    const before = mock.mock.callCount();
    const result = await generateStrategy('Green Growth');
    valid(result);
    assert.equal(result.generation.mode, 'local');
    assert.equal(mock.mock.callCount() - before, 1);
  }
});

test('deadline bounds stalled transport and body reads; strategy and analysis API fall back', async t => {
  configure(t, 'test-key', '15');
  let signal: AbortSignal;
  const mock = t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    signal = init!.signal!;
    return await new Promise<Response>(() => {});
  });
  const generated = await strategyPost(request({ intent: 'Green Growth' }));
  assert.equal(generated.status, 200);
  const { strategyA } = await generated.json() as StrategyResponse;
  valid(strategyA);
  assert.equal(strategyA.generation.mode, 'local');
  assert.equal(signal!.aborted, true);
  mock.mock.mockImplementation(async () => new Response(new ReadableStream({ start() {} })));
  const analyzed = await analyzePost(request({ selectedMeasures: strategyA.selectedMeasures }));
  assert.equal(analyzed.status, 200);
  assert.deepEqual((await analyzed.json()).analysis, analyzeOfficialResult(runOfficialSimulation(strategyA.selectedMeasures)));
});

test('shared client rejects malformed envelopes and invalid timeout configuration is bounded', async t => {
  configure(t);
  for (const value of ['NaN', '-1', '0', '60001', 'Infinity']) {
    process.env.FARSIGHT_LLM_TIMEOUT_MS = value;
    assert.equal(modelConfig().timeoutMs, 18000);
  }
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(null));
  for (const envelope of [null, {}, { status: 'incomplete' }, { status: 'completed', output: {} }, { status: 'completed', output: [null] }]) {
    mock.mock.mockImplementation(async () => Response.json(envelope));
    await assert.rejects(structuredModelOutput('test', {}, '', ''), /incomplete|malformed|no structured/);
  }
});

