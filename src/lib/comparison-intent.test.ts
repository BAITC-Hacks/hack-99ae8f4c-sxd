import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonIntent } from './comparison-intent.ts';

test('comparison mentions and explanatory questions stay in chat', () => {
  for (const text of [
    'Why does my strategy compare better than baseline?',
    'How does Green Growth compare with Industrial-Mobility?',
    'Explain the comparison with baseline',
    'Can you explain why these strategies compare differently?',
    'Почему моя стратегия лучше в сравнении с базовой?',
    'Объясни сравнение стратегий',
    'I want to understand the comparison',
    'Do not compare strategies',
  ]) assert.equal(comparisonIntent(text), null, text);
});

test('explicit named comparison commands retain both names', () => {
  for (const text of [
    'Compare Green Growth with Industrial-Mobility',
    'Can you please compare Green Growth against Industrial-Mobility?',
    'Сравни Green Growth с Industrial-Mobility',
    'Create Green Growth and compare it with Industrial-Mobility.',
  ]) assert.deepEqual(comparisonIntent(text), { pair: ['Green Growth', 'Industrial-Mobility'] }, text);
  for (const text of ['Compare strategies', 'Open comparison', 'Show me a comparison', 'Сравните стратегии'])
    assert.deepEqual(comparisonIntent(text), {}, text);
});
