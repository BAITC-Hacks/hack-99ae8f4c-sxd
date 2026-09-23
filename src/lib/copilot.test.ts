import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../app/api/copilot/route.ts';
import { validateStrategy } from './validator.ts';
import type { CopilotResponse } from '../types/product.ts';

process.env.FARSIGHT_AI_MODE = 'local';
function request(body: unknown) {
  return new Request('http://localhost/api/copilot', { method: 'POST', body: JSON.stringify(body) });
}

test('questions and greetings do not generate a portfolio, including the reported typo', async () => {
  for (const message of ['Can i desribe any strategy?', 'Can I describe any strategy', 'What is the budget?',
    'How does simulation work?', 'Могу я описать любую стратегию?', 'Какие есть ограничения?', 'Hello']) {
    const response = await POST(request({ message }));
    assert.equal(response.status, 200);
    const data = await response.json() as CopilotResponse;
    assert.equal(data.kind, 'answer', message);
    assert.equal('strategyA' in data, false);
    if (data.kind === 'answer') assert.ok(data.message.length > 0);
  }
  const data = await (await POST(request({ message: 'Can i desribe any strategy?' }))).json();
  assert.match(data.message, /Yes, you can/);
  assert.match(data.message, /catalog/);
  assert.match(data.message, /100/);
});

test('explicit requests and freeform priorities still generate validated strategies', async () => {
  for (const message of ['Create a Green Growth strategy.', 'Can you create a transport strategy?',
    'Prioritize transport while keeping social indicators stable.', 'Green Growth', 'Создай стратегию развития транспорта']) {
    const data = await (await POST(request({ message }))).json() as CopilotResponse;
    assert.equal(data.kind, 'strategy', message);
    if (data.kind === 'strategy') assert.equal(validateStrategy(data.strategyA.selectedMeasures).valid, true);
  }
});

test('comparison requests retain both portfolios', async () => {
  for (const message of ['Compare Green Growth with Industrial-Mobility.',
    'Create an Industrial-Mobility strategy and compare it with Green Growth.']) {
    const data = await (await POST(request({ message }))).json() as CopilotResponse;
    assert.equal(data.kind, 'strategy');
    if (data.kind === 'strategy') {
      assert.ok(data.strategyB);
      assert.equal(validateStrategy(data.strategyB.selectedMeasures).valid, true);
      assert.notEqual(data.strategyA.id, data.strategyB.id);
    }
  }
});

test('copilot rejects missing, invalid and oversized messages', async () => {
  for (const body of [{}, { message: '' }, { message: 123 }, { message: 'x'.repeat(2001) }, null]) {
    assert.equal((await POST(request(body))).status, 400);
  }
});

test('baseline questions explain the active portfolio instead of replacing it, including a typo', async () => {
  const selectedMeasures = [{ measureId: 'M2' }, { measureId: 'M6' },
    { measureId: 'M4', districtId: 'esil' }, { measureId: 'M10', districtId: 'almaty' },
    { measureId: 'M7', districtId: 'saryarka' }];
  for (const message of ['explain why baseline change is positive', 'explaim me why change from baseline is positive', 'почему изменение положительное']) {
    const response = await POST(request({ message, selectedMeasures }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.kind, 'answer');
    assert.equal('strategyA' in data, false);
    assert.match(data.message, /52\.56/);
    assert.match(data.message, /54\.01/);
    assert.match(data.message, /\+1\.46/);
    assert.match(data.message, /city average contributes/);
    assert.match(data.message, /not subtracted from QoL/);
  }
});

test('explanation without a portfolio does not create a new strategy', async () => {
  const data = await (await POST(request({ message: 'explaim me why change from baseline is positive' }))).json();
  assert.equal(data.kind, 'answer');
  assert.match(data.message, /Simulation/);
});

test('explanation context is validated by the official engine', async () => {
  const response = await POST(request({ message: 'Why is baseline change positive?', selectedMeasures: [{ measureId: 'invented' }] }));
  assert.equal(response.status, 422);
});

test('explanatory comparison questions answer about the active result', async () => {
  const selectedMeasures = [{ measureId: 'M2' }, { measureId: 'M6' },
    { measureId: 'M4', districtId: 'esil' }, { measureId: 'M10', districtId: 'almaty' },
    { measureId: 'M7', districtId: 'saryarka' }];
  for (const message of ['Why does my strategy compare better than baseline?', 'Explain the comparison with baseline',
    'How does my strategy compare to baseline?', 'Почему моя стратегия лучше в сравнении с базовой?']) {
    const response = await POST(request({ message, selectedMeasures }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.kind, 'answer');
    assert.equal('strategyA' in data, false);
    assert.match(data.message, /54\.01/);
  }
});
