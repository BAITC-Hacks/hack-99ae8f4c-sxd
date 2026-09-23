import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFutureFactors, createLiveResearchProvider, researchContext } from './agents/future-research.ts';
import { cleanSources, createSearch, sourceURL } from './agents/future-search.ts';
import { runOfficialSimulation } from './official.ts';
import { POST } from '../app/api/research/route.ts';
import type { Selection } from './simulator.ts';
import type { FutureResearchProvider } from '../types/outlook.ts';

const strategies: Selection[][] = [
  [{ measureId: 'M1', districtId: 'nura' }, { measureId: 'M2' }, { measureId: 'M4', districtId: 'nura' }, { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' }],
  [{ measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' }, { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' }, { measureId: 'M5', districtId: 'saryarka' }],
  [{ measureId: 'M11', districtId: 'nura' }, { measureId: 'M4', districtId: 'nura' }, { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' }, { measureId: 'M14' }],
];
// Synthetic search fixtures exercise the contract; they are not shipped research citations.
function searchFixture() {
  const topics = ['population growth', 'climate warming', 'water stress', 'transport demand', 'infrastructure aging', 'energy demand', 'urban expansion'];
  return { results: topics.map((topic, i) => ({ title: `Synthetic ${topic} report`, url: `https://worldbank.org/research/fixture-${i}`,
    content: `Kazakhstan faces increasing ${topic} pressure over the coming decades, requiring additional planning and investment.`, published_date: '2024-01-01' })) };
}
for (const [i, strategy] of strategies.entries()) test(`live research strategy ${i + 1}: sourced, relevant, immutable`, async () => {
  const official = runOfficialSimulation(strategy), before = structuredClone(official);
  const queries: string[] = [];
  const research = await getFutureFactors(official, createLiveResearchProvider(async q => { queries.push(q); return searchFixture(); }));
  assert.equal(research.sourceMode, 'live');
  assert.equal(research.status, 'success');
  assert.ok(research.factors.length >= 3 && research.factors.length <= 6);
  assert.ok(research.factors.every(f => f.sources.length >= 1 && f.sources.length <= 3));
  assert.ok(queries.every(q => researchContext(official).affectedCategories.every(c => q.includes(c))));
  assert.deepEqual(official, before);
  if (i === 1) assert.ok(!research.factors.some(f => f.id === 'research-transport-demand'));
});
test('source validation rejects spoofed hosts and deduplicates normalized citations', () => {
  for (const url of ['javascript:alert(1)', 'https://worldbank.org.evil.test/report', 'https://localhost/report', 'https://user@worldbank.org/report', 'https://worldbank.org/', 'http://worldbank.org/report']) assert.equal(sourceURL(url), undefined);
  const sources = cleanSources([{ title: 'A', url: 'https://worldbank.org/report?utm_source=x#part' }, { title: 'B', url: 'https://worldbank.org/report' },
    ...Array.from({ length: 8 }, (_, i) => ({ title: 'C', url: `https://un.org/report/${i}` }))]);
  assert.equal(sources.length, 3);
  assert.equal(sources[0].url, 'https://worldbank.org/report');
});
test('timeouts, malformed factors, unsourced factors and failures return usable demo data', async () => {
  const official = runOfficialSimulation(strategies[0]);
  const before = structuredClone(official);
  for (const research of [async () => null, async () => [null, { strength: NaN }], async () => { throw new Error('secret'); }, () => new Promise(() => {})]) {
    const provider = { id: 'broken', mode: 'live', research } as FutureResearchProvider;
    const result = await getFutureFactors(official, provider, 20);
    assert.equal(result.sourceMode, 'demo');
    assert.equal(result.failure?.code, 'research_failed');
    assert.ok(result.factors.length >= 3);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
  for (const response of [null, { results: [null, 3, { url: 'https://evil.test/x', content: 'water stress' }] }, { results: [] }]) {
    assert.equal((await getFutureFactors(official, createLiveResearchProvider(async () => response))).sourceMode, 'demo');
  }
  assert.deepEqual(official, before);
  assert.deepEqual(runOfficialSimulation(strategies[0]), before);
});
test('search retries transient failures, coalesces calls, caches isolated copies', async () => {
  let calls = 0;
  const search = createSearch('fixture', (async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 503 }) : Response.json(searchFixture());
  }) as typeof fetch);
  const [a, b] = await Promise.all([search('query'), search('query')]);
  assert.equal(calls, 2);
  assert.deepEqual(a, b);
  (a as { results: unknown[] }).results.length = 0;
  assert.ok((await search('query') as { results: unknown[] }).results.length > 0);
  assert.equal(calls, 2);
});
test('search bounds hung requests and does not retry auth failures or malformed JSON', async () => {
  let calls = 0;
  const hung = createSearch('fixture', (() => { calls++; return new Promise(() => {}); }) as typeof fetch, 10);
  await assert.rejects(hung('query'), /timed out/);
  assert.equal(calls, 2);
  for (const response of [new Response('', { status: 401 }), new Response('{bad')]) {
    let count = 0;
    const search = createSearch('fixture', (async () => { count++; return response; }) as typeof fetch);
    await assert.rejects(search('query'));
    assert.equal(count, 1);
  }
});
test('research route rejects bad input and returns explicit fallback without configuration', async () => {
  const key = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    for (const body of ['{bad', '{}', '{"officialResult":null}']) {
      const result = await POST(new Request('http://localhost/api/research', { method: 'POST', body }));
      assert.equal(result.status, 400);
    }
    const result = await POST(new Request('http://localhost/api/research', { method: 'POST', body: JSON.stringify({ officialResult: runOfficialSimulation(strategies[0]) }) }));
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.sourceMode, 'demo');
    assert.equal(body.failure.code, 'not_configured');
  } finally { if (key !== undefined) process.env.TAVILY_API_KEY = key; }
});
