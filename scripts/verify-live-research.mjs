import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { generateLocalStrategy } from '../src/lib/agents/strategy.ts';
const base = process.env.RESEARCH_TEST_URL || 'http://localhost:3001';
const results = [];
async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(85000) });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
for (const name of ['Green Growth', 'Industrial-Mobility', 'Social Infrastructure First']) {
  const selectedMeasures = generateLocalStrategy(name).selectedMeasures;
  const official = await post('/api/simulation', { selectedMeasures });
  console.log('official keys', Object.keys(official));
  const research = await post('/api/research', { officialResult: official.result ?? official });
  console.log(name, research.sourceMode, research.failure ?? '', research.factors?.length);
  results.push({name, selectedMeasures, research});
}
await writeFile('docs/live-research-results.json', JSON.stringify(results, null, 2));
for (const result of results) {
  assert.equal(result.research.sourceMode, 'live', result.name);
  assert.ok(result.research.factors.every(f => f.sources.length && f.sources.every(s => s.url.startsWith('https://'))));
}
const outlook = await post('/api/outlook', { selectedMeasures: results[0].selectedMeasures, comparisonMeasures: results[1].selectedMeasures });
assert.equal(outlook.research.sourceMode, 'live');
assert.deepEqual(outlook.scenario.factors, outlook.research.factors);
await writeFile('docs/live-outlook-result.json', JSON.stringify(outlook, null, 2));
console.log('Live factors passed into Scenario Engine; comparison succeeded.');

