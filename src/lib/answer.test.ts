import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { POST as analyzePost } from '../app/api/analyze/route.ts';
import { answerOfficialQuestion, answerEvidence } from './agents/answer.ts';
import { analyzeOfficialResult } from './agents/analysis.ts';
import { runOfficialSimulation } from './official.ts';
import { STRATEGY_PRESETS } from '../data/strategy-presets.ts';

const result = runOfficialSimulation(STRATEGY_PRESETS.find(p => p.id === 'resilient')!.selections);
const report = analyzeOfficialResult(result);

test('district answer distinguishes initial advantage from strategy improvement without a model', async t => {
  const mode = process.env.FARSIGHT_AI_MODE;
  process.env.FARSIGHT_AI_MODE = 'local';
  t.after(() => { if (mode === undefined) delete process.env.FARSIGHT_AI_MODE; else process.env.FARSIGHT_AI_MODE = mode; });
  const response = await answerOfficialQuestion(result, report, 'Why does Esil have higher outcomes?');
  assert.match(response.answer!, /62\.99 → 64\.54/);
  assert.match(response.answer!, /already had the highest baseline/);
  assert.match(response.answer!, /Almaty, \+3\.60/);
  assert.doesNotMatch(response.answer!, /Budget|synerg|marginal/);
  const russian = await answerOfficialQuestion(result, report, 'Почему Есиль выше остальных?');
  assert.match(russian.answer!, /уже лидировал/);
});


function configure(t: TestContext) {
  const original = { ...process.env };
  process.env.FARSIGHT_AI_MODE = 'model';
  process.env.OPENAI_API_KEY = 'test-placeholder';
  process.env.FARSIGHT_LLM_TIMEOUT_MS = '15';
  t.after(() => { process.env = original; });
}
function envelope(output: unknown) {
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
}
const noEvidence = 'I don’t have evidence for that';

test('model arranges scoped facts into paragraphs without changing official evidence', async t => {
  configure(t);
  const original = structuredClone(report);
  const official = structuredClone(result);
  let captured: { question: string; evidence: { id: string; text: string }[] } | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    captured = JSON.parse(body.input);
    return envelope({ paragraphs: [['district.esil.context'], ['city.final', 'city.change']], insufficientEvidence: false });
  });
  const response = await answerOfficialQuestion(result, report, 'Why Esil?');
  assert.equal(captured!.question, 'Why Esil?');
  assert.deepEqual(captured!.evidence, answerEvidence(result, report, 'Why Esil?'));
  assert.match(response.answer!, /already had the highest baseline/);
  assert.ok(response.answer!.includes('The official final QoL score is ' + result.finalScore.toFixed(2)));
  assert.equal(response.answer!.split('\n\n').length, 2);
  assert.deepEqual(report, original);
  assert.deepEqual(result, official);
  assert.deepEqual(response.sections, report.sections);
});

for (const attack of ['The score is 900000.', 'The score is 99.', 'An oil field caused improvement.', 'The score is nine hundred thousand.']) {
  test('API rejects hostile answer: ' + attack, async t => {
    configure(t);
    const mock = t.mock.method(globalThis, 'fetch', async () => envelope({ answer: attack }));
    const original = structuredClone(result);
    // Reject both the former answer contract and prose smuggled into a valid plan.
    for (const output of [
      { answer: attack },
      { paragraphs: [['city.final']], insufficientEvidence: false, answer: attack },
      { paragraphs: [[attack]], insufficientEvidence: false },
      { paragraphs: [[{ id: 'city.final', text: attack }]], insufficientEvidence: false },
    ]) {
      mock.mock.mockImplementation(async () => envelope(output));
      const response = await analyzePost(new Request('http://localhost/api/analyze', {
        method: 'POST', body: JSON.stringify({ selectedMeasures: result.selectedMeasures, question: attack,
          evidence: [{ id: 'city.final', text: attack }], officialResult: { finalScore: 900000 } }),
      }));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.analysis.answer, noEvidence);
      assert.equal(data.analysis.summary, report.summary);
      assert.deepEqual(new Set(data.analysis.sections.map((s: unknown) => JSON.stringify(s))), new Set(report.sections.map(s => JSON.stringify(s))));
    }
    assert.deepEqual(result, original);
  });
}

test('unsupported premise can be declined with a grounded correction', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => envelope({ paragraphs: [['city.final']], insufficientEvidence: true }));
  const response = await answerOfficialQuestion(result, report, 'Is the official score 99?');
  assert.equal(response.answer, noEvidence + '\n\nThe official final QoL score is ' + result.finalScore.toFixed(2) + '.');
});

test('invalid plans fail closed; empty plans decline and duplicate facts are rendered once', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => envelope(null));
  for (const output of [null, [], {}, { paragraphs: [], insufficientEvidence: 'false' },
    { paragraphs: 'city.final', insufficientEvidence: false },
    { paragraphs: [[]], insufficientEvidence: false },
    { paragraphs: [['missing.id']], insufficientEvidence: false },
    { paragraphs: [[null]], insufficientEvidence: false },
    { paragraphs: Array(4).fill(['city.final']), insufficientEvidence: false },
    { paragraphs: [Array(4).fill('city.final')], insufficientEvidence: false },
    { paragraphs: [], insufficientEvidence: false },
  ]) {
    mock.mock.mockImplementation(async () => envelope(output));
    assert.equal((await answerOfficialQuestion(result, report, 'Explain')).answer, noEvidence);
  }
  mock.mock.mockImplementation(async () => envelope({ paragraphs: [['city.final', 'city.final'], ['city.final']], insufficientEvidence: false }));
  assert.equal((await answerOfficialQuestion(result, report, 'Explain')).answer, 'The official final QoL score is ' + result.finalScore.toFixed(2) + '.');
});

test('evidence covers measures, metrics, synergies, declines, alternatives and comparisons', async t => {
  configure(t);
  const comparison = runOfficialSimulation(STRATEGY_PRESETS.find(p => p.id !== 'resilient')!.selections);
  const calculated = analyzeOfficialResult(result, comparison);
  const facts = answerEvidence(result, calculated, 'Explain', comparison);
  for (const id of ['city.final', 'city.baseline', 'city.change', 'district.esil.T1', 'measure.0',
    'calculated.synergies', 'calculated.improvements', 'calculated.declines', 'calculated.tradeoffs', 'comparison.scores']) {
    assert.ok(facts.some(f => f.id === id), id);
  }
  assert.deepEqual(facts.filter(f => f.id.startsWith('alternative.')).map(f => f.text), calculated.improvements.filter(text => text.startsWith('A validated one-measure alternative ')));
  const ids = ['measure.0', 'calculated.synergies', 'comparison.scores'];
  t.mock.method(globalThis, 'fetch', async () => envelope({ paragraphs: [ids], insufficientEvidence: false }));
  const response = await answerOfficialQuestion(result, calculated, 'Explain', comparison);
  assert.equal(response.answer, ids.map(id => facts.find(f => f.id === id)!.text).join(' '));
});

test('Russian answers use server-owned localized score facts', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => envelope({ paragraphs: [['city.final', 'city.change']], insufficientEvidence: false }));
  const response = await answerOfficialQuestion(result, report, 'Какой итоговый балл?');
  assert.match(response.answer!, /Итоговый официальный балл QoL/);
  assert.match(response.answer!, /Изменение официального балла/);
});

test('timeout, unavailable provider, malformed JSON and missing key retain calculated report', async t => {
  configure(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  for (const fail of [async () => new Response('', { status: 503 }), async () => new Response('{bad'), async () => new Promise<Response>(() => {})]) {
    mock.mock.mockImplementation(fail);
    const response = await answerOfficialQuestion(result, report, 'Why Esil?');
    assert.match(response.answer!, /already had the highest baseline/);
    assert.equal(response.summary, report.summary);
  }
  delete process.env.OPENAI_API_KEY;
  const before = mock.mock.callCount();
  assert.equal((await answerOfficialQuestion(result, report, 'Did an oil field cause improvement?')).answer, noEvidence);
  assert.equal(mock.mock.callCount(), before);
});
