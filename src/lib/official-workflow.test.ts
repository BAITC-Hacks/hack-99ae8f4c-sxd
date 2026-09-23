import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulateWithAnalysis } from './official-workflow.ts';
import { generateLocalStrategy } from './agents/strategy.ts';
import { runOfficialSimulation } from './official.ts';
import { analyzeOfficialResult } from './agents/analysis.ts';

const selectedMeasures = generateLocalStrategy('Green Growth').selectedMeasures;
const comparisonMeasures = generateLocalStrategy('Industrial-Mobility').selectedMeasures;
const result = runOfficialSimulation(selectedMeasures);
const analysis = analyzeOfficialResult(result);
type Options = Parameters<typeof simulateWithAnalysis>[0];

function fixture(post: Options['post']) {
  const events: string[] = [];
  const options: Options = {
    post, selectedMeasures, comparisonMeasures, isCurrent: () => true,
    onResult: value => { assert.deepEqual(value, result); events.push('result'); },
    onAnalysis: value => { assert.deepEqual(value, analysis); events.push('analysis'); },
    onAnalysisError: () => { events.push('analysis-error'); },
  };
  return { options, events };
}

test('official workflow publishes numbers before automatic analysis with matching selections', async () => {
  const { options, events } = fixture(async <T>(path: string, body: unknown) => {
    events.push(path);
    assert.deepEqual(body, path === '/api/simulate' ? { selectedMeasures } : { selectedMeasures, comparisonMeasures });
    return (path === '/api/simulate' ? { result } : { analysis }) as T;
  });
  await simulateWithAnalysis(options);
  assert.deepEqual(events, ['/api/simulate', 'result', '/api/analyze', 'analysis']);
});

test('failed explanation preserves numbers and lets Outlook continue', async () => {
  const { options, events } = fixture(async <T>(path: string) => {
    if (path === '/api/analyze') throw new Error('Analysis unavailable');
    return { result } as T;
  });
  await simulateWithAnalysis(options);
  events.push('outlook');
  assert.deepEqual(events, ['result', 'analysis-error', 'outlook']);
});

test('simulation failure does not request analysis or publish a result', async () => {
  const paths: string[] = [];
  const { options, events } = fixture(async (path: string) => { paths.push(path); throw new Error('Simulation failed'); });
  await assert.rejects(simulateWithAnalysis(options), /Simulation failed/);
  assert.deepEqual(paths, ['/api/simulate']);
  assert.deepEqual(events, []);
});

test('reset sessions suppress stale results and analysis', async () => {
  const { options, events } = fixture(async <T>() => ({ result }) as T);
  options.isCurrent = () => false;
  await simulateWithAnalysis(options);
  assert.deepEqual(events, []);
  let current = true;
  options.isCurrent = () => current;
  options.post = async <T>(path: string) => {
    if (path === '/api/analyze') current = false;
    return (path === '/api/simulate' ? { result } : { analysis }) as T;
  };
  await simulateWithAnalysis(options);
  assert.deepEqual(events, ['result']);
});

test('a failed comparison simulation cannot suppress the successful strategy explanation', async () => {
  const { options, events } = fixture(async <T>(path: string) => (path === '/api/simulate' ? { result } : { analysis }) as T);
  const completed = await Promise.allSettled([
    simulateWithAnalysis(options),
    simulateWithAnalysis({ ...options, post: async () => { throw new Error('Other simulation failed'); } }),
  ]);
  assert.deepEqual(completed.map(item => item.status), ['fulfilled', 'rejected']);
  assert.deepEqual(events, ['result', 'analysis']);
});
