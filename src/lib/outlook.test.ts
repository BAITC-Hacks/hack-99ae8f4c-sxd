import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LONG_TERM_ASSUMPTIONS } from '../data/long-term-assumptions.ts';
import { DISTRICTS } from '../data/districts.ts';
import { MEASURES } from '../data/measures.ts';
import { INDICATORS } from './scoring.ts';
import { runOfficialSimulation } from './official.ts';
import { runLongTermScenario, validateFutureFactors, validateLongTermAssumptions } from './outlook.ts';
import { getFutureFactors } from './agents/future-research.ts';
import type { FutureFactor, LongTermAssumptions } from '../types/outlook.ts';
import type { Selection } from './simulator.ts';

const mobility: readonly Selection[] = [
  { measureId: 'M1', districtId: 'nura' }, { measureId: 'M2' },
  { measureId: 'M4', districtId: 'nura' }, { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' },
];
const social: readonly Selection[] = [
  { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' }, { measureId: 'M12' }, { measureId: 'M5', districtId: 'saryarka' },
];

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

function noRecurringEffects(): LongTermAssumptions {
  const config = structuredClone(LONG_TERM_ASSUMPTIONS);
  config.annualDecayRate = 0;
  for (const metric of INDICATORS) config.annualTrend[metric] = 0;
  for (const lifecycle of Object.values(config.lifecycleByCategory)) lifecycle.annualEffectFraction = 0;
  return config;
}

function factor(overrides: Partial<FutureFactor> = {}): FutureFactor {
  return {
    id: 'test-risk', name: 'Synthetic risk', direction: 'negative', strength: 1, confidence: 0.4,
    startYear: 2032, endYear: 2034, affectedMetrics: ['T1'],
    rationale: 'Synthetic unit-test fixture, not a research claim.', sources: [], ...overrides,
  };
}

test('scenario preserves the exact official seed, separates its index, and leaves inputs untouched', async () => {
  const official = runOfficialSimulation(mobility);
  const research = await getFutureFactors(official);
  const before = structuredClone({ official, research, config: LONG_TERM_ASSUMPTIONS });
  const scenario = runLongTermScenario(official, research.factors);
  assert.equal(scenario.metricLabel, 'Scenario indicator index');
  assert.deepEqual(scenario.checkpoints.map(point => point.year), [2026, 2028, 2030, 2035, 2040, 2045, 2050]);
  assert.deepEqual(scenario.checkpoints[0].districtIndicators, official.indicatorsBefore);
  assert.deepEqual(scenario.checkpoints[1].districtIndicators, official.indicatorsAfter);
  assert.equal(scenario.checkpoints[1].phase, 'official-seed');
  const expectedIndex = DISTRICTS.reduce((sum, district) => sum + district.populationShare
    * INDICATORS.reduce((total, metric) => total + official.indicatorsAfter[district.id][metric] / 10, 0), 0);
  close(scenario.checkpoints[1].index, expectedIndex);
  assert.notEqual(scenario.checkpoints[1].index, official.finalScore);
  assert.equal(scenario.annualSteps.length, 22);
  assert.equal(scenario.annualSteps[0].year, 2029);
  assert.deepEqual({ official, research, config: LONG_TERM_ASSUMPTIONS }, before);
  assert.deepEqual(scenario, runLongTermScenario({ ...official, finalScore: -9999, baselineScore: -9999 }, research.factors));
  scenario.checkpoints[1].districtIndicators.nura.T1 = 0;
  scenario.factors[0].affectedMetrics.push('B1');
  scenario.assumptions.annualTrend.T1 = 99;
  assert.deepEqual({ official, research, config: LONG_TERM_ASSUMPTIONS }, before);
});

test('only the remaining catalog effect is completed, with no repeated synergy or full measure bonus', () => {
  const official = runOfficialSimulation(mobility);
  const scenario = runLongTermScenario(official, [], noRecurringEffects());
  const final = scenario.checkpoints.at(-1)!;
  for (const district of DISTRICTS) {
    for (const metric of INDICATORS) {
      const remaining = mobility.reduce((sum, selection) => {
        const measure = MEASURES.find(item => item.id === selection.measureId)!;
        if (measure.scope === 'district' && selection.districtId !== district.id) return sum;
        return sum + (measure.effects.find(effect => effect.indicator === metric)?.delta ?? 0) * measure.lag / 8;
      }, 0);
      close(final.districtIndicators[district.id][metric], official.indicatorsAfter[district.id][metric] + remaining);
    }
  }
  // Official Nura T1 = baseline 55 + M1 4.5 + M2 3 + synergy 2.
  close(final.districtIndicators.nura.T1, 55 + 6 + 4 + 2);
  assert.ok(scenario.annualSteps.filter(step => step.year >= 2032).every(step => step.indexBefore === step.indexAfter));
});

test('negative measure trade-offs also have a signed remaining effect', () => {
  const official = runOfficialSimulation([
    { measureId: 'M11', districtId: 'nura' }, { measureId: 'M4', districtId: 'nura' },
    { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' }, { measureId: 'M14' },
  ]);
  const scenario = runLongTermScenario(official, [], noRecurringEffects());
  close(scenario.checkpoints.at(-1)!.districtIndicators.nura.T1, 53);
  close(scenario.annualSteps[0].districtEffects.nura.T1.remainingMeasureEffect, -0.25 / 3);
});

test('future risk respects onset, ramp, expiry, and strategy-specific local mitigation', () => {
  const risk = factor();
  const scenario = runLongTermScenario(runOfficialSimulation(mobility), [risk], noRecurringEffects());
  for (const step of scenario.annualSteps) {
    if (step.year < 2032 || step.year > 2034) {
      assert.deepEqual(step.factorImpacts, []);
      assert.equal(step.districtEffects.nura.T1.externalFactorImpact, 0);
    } else {
      close(step.factorImpacts[0].rampFraction, (step.year - 2032 + 1) / 5);
      assert.ok(step.districtEffects.nura.T1.externalFactorImpact > step.districtEffects.esil.T1.externalFactorImpact,
        'Targeted bus-lane district should suffer less than a district with only the city measure');
      assert.ok(step.factorImpacts[0].indexImpact < 0);
    }
  }
  const differentConfidence = runLongTermScenario(runOfficialSimulation(mobility), [{ ...risk, confidence: 0.01 }], noRecurringEffects());
  assert.deepEqual(scenario.checkpoints, differentConfidence.checkpoints, 'confidence is not an impact multiplier');
});

test('positive and mixed directions use configured signs; updates and traces reconcile', async () => {
  const research = await getFutureFactors(runOfficialSimulation(mobility));
  const scenario = runLongTermScenario(runOfficialSimulation(mobility), [
    ...research.factors,
    factor({ id: 'positive-test', direction: 'positive', affectedMetrics: ['C2'] }),
  ]);
  for (const step of scenario.annualSteps) {
    for (const district of DISTRICTS) {
      for (const metric of INDICATORS) {
        const trace = step.districtEffects[district.id][metric];
        close(trace.after - trace.before, trace.remainingMeasureEffect + trace.longTermMeasureEffect
          + trace.baselineTrendImpact + trace.externalFactorImpact - trace.decay + trace.clampAdjustment);
        assert.ok(trace.after >= 0 && trace.after <= 100);
      }
    }
    const factorSum = step.factorImpacts.reduce((sum, item) => sum + item.indexImpact, 0);
    const traceSum = DISTRICTS.reduce((sum, district) => sum + district.populationShare * INDICATORS.reduce((inner, metric) =>
      inner + LONG_TERM_ASSUMPTIONS.metricWeights[metric] * step.districtEffects[district.id][metric].externalFactorImpact, 0), 0);
    close(factorSum, traceSum);
    if (step.year >= 2032 && step.year <= 2034) assert.ok(step.factorImpacts.find(item => item.factorId === 'positive-test')!.indexImpact > 0);
  }
});

test('trajectory is deterministic under selection and factor reordering and differs between strategies', async () => {
  const { factors } = await getFutureFactors(runOfficialSimulation(mobility));
  const first = runLongTermScenario(runOfficialSimulation(mobility), factors);
  const reordered = runLongTermScenario(runOfficialSimulation([...mobility].reverse()), [...factors].reverse());
  assert.deepEqual(first, reordered);
  const other = runLongTermScenario(runOfficialSimulation(social), factors);
  assert.notEqual(first.checkpoints.at(-1)!.index, other.checkpoints.at(-1)!.index);
  assert.notDeepEqual(first.annualSteps.at(-1)!.factorImpacts, other.annualSteps.at(-1)!.factorImpacts);
});

test('scenario rejects invalid factors and assumptions instead of propagating bad numbers', () => {
  for (const patch of [
    { strength: NaN }, { strength: -0.1 }, { strength: 1.1 }, { confidence: Infinity },
    { startYear: 2032.5 }, { startYear: 2040, endYear: 2030 }, { endYear: 2051 },
    { direction: 'unknown' }, { direction: ['negative'] }, { affectedMetrics: [] }, { affectedMetrics: ['bogus'] },
    { affectedMetrics: ['T1', 'T1'] }, { sources: [{ title: 'Invalid', url: 'javascript:alert(1)' }] },
  ]) assert.throws(() => validateFutureFactors([{ ...factor(), ...patch }]));
  assert.throws(() => validateFutureFactors([factor(), factor()]));
  assert.throws(() => validateFutureFactors(null));
  for (const patch of [
    { annualDecayRate: -1 }, { factorRampYears: 0 }, { remainingEffectYears: 0 },
    { checkpoints: [2026, 2028, 2040, 2030, 2050] }, { officialEndYear: 2030 },
    { metricWeights: { ...LONG_TERM_ASSUMPTIONS.metricWeights, T1: 0.2 } },
    { lifecycleByCategory: {} }, { annualTrend: { T1: NaN } },
    { maximumMaintenanceCoverage: 0.1 },
  ]) assert.throws(() => validateLongTermAssumptions({ ...LONG_TERM_ASSUMPTIONS, ...patch }));
  const official = runOfficialSimulation(mobility);
  assert.throws(() => runLongTermScenario({ ...official, selectedMeasures: [] }, []));
  assert.throws(() => runLongTermScenario({ ...official, indicatorsAfter: {} }, []));
});

test('saturation remains bounded and its clamp adjustment is visible in the trace', () => {
  const config = noRecurringEffects();
  config.factorPointsPerYearAtFullStrength = 10;
  config.maximumExternalImpactPerMetricPerYear = 10;
  config.maximumAnnualIndicatorChange = 100;
  config.factorRampYears = 1;
  const scenario = runLongTermScenario(runOfficialSimulation(mobility), [factor({
    direction: 'positive', startYear: 2029, endYear: 2050, affectedMetrics: ['T1', 'C2'],
  })], config);
  assert.equal(scenario.checkpoints.at(-1)!.cityIndicators.T1, 100);
  assert.ok(scenario.annualSteps.some(step => step.districtEffects.nura.T1.clampAdjustment < 0));
  const trace = scenario.annualSteps.at(-1)!.districtEffects.nura.T1;
  close(trace.after - trace.before, trace.remainingMeasureEffect + trace.longTermMeasureEffect
    + trace.baselineTrendImpact + trace.externalFactorImpact - trace.decay + trace.clampAdjustment);
});

test('demo research is explicit, relevant, immutable, and has no fabricated citations', async () => {
  const first = await getFutureFactors(runOfficialSimulation(mobility));
  const socialResearch = await getFutureFactors(runOfficialSimulation(social));
  assert.equal(first.mode, 'demo');
  assert.match(first.notice, /Live web research is not connected/);
  assert.ok(first.factors.every(item => item.sources.length === 0 && item.rationale.startsWith('Demo hypothesis:')));
  assert.ok(first.factors.some(item => item.id === 'demo-transport-demand'));
  assert.deepEqual([...first.factors].sort((a,b) => a.id.localeCompare(b.id)), [...socialResearch.factors].sort((a,b) => a.id.localeCompare(b.id))); 
  first.factors[0].strength = 0;
  assert.notEqual((await getFutureFactors(runOfficialSimulation(mobility))).factors[0].strength, 0);
  await assert.rejects(() => getFutureFactors({ ...runOfficialSimulation(mobility), selectedMeasures: [] }));
});

test('future research provider boundary validates output and requires evidence in live mode', async () => {
  assert.equal((await getFutureFactors(runOfficialSimulation(mobility), {
    id: 'bad-provider', mode: 'demo', async research() { return [factor({ strength: NaN })]; },
  })).status, 'fallback');
  assert.equal((await getFutureFactors(runOfficialSimulation(mobility), {
    id: 'uncited-live-provider', mode: 'live', async research() { return [factor()]; },
  })).status, 'fallback');
  // This is a provider-contract fixture. It is not shipped as a live research implementation.
  const custom = await getFutureFactors(runOfficialSimulation(mobility), {
    id: 'custom-demo-provider', mode: 'demo', async research() { return [factor({ id: 'custom-factor' })]; },
  });
  assert.equal(custom.provider, 'custom-demo-provider');
  assert.equal(custom.factors[0].id, 'custom-factor');
});

test('research receives the calculated two-year result and cannot mutate the official seed', async () => {
  const official = runOfficialSimulation(mobility);
  const before = structuredClone(official);
  const research = await getFutureFactors(official, {
    id: 'outcome-aware-test-provider', mode: 'demo',
    async research(result) {
      assert.deepEqual(result, before);
      assert.notStrictEqual(result, official);
      assert.equal(result.finalScore, before.finalScore);
      result.indicatorsAfter.nura = { ...result.indicatorsAfter.nura, T1: 0 };
      result.selectedMeasures.length = 0;
      return [factor()];
    },
  });
  assert.deepEqual(official, before);
  assert.deepEqual(runLongTermScenario(official, research.factors).checkpoints[1].districtIndicators,
    before.indicatorsAfter);
});

test('a failed future provider leaves the official result and subsequent official runs available', async () => {
  const official = runOfficialSimulation(mobility);
  const before = structuredClone(official);
  assert.equal((await getFutureFactors(official, {
    id: 'offline-provider', mode: 'live',
    async research(result) {
      result.indicatorsAfter.nura = { ...result.indicatorsAfter.nura, T1: 0 };
      throw new Error('Research unavailable');
    },
  })).status, 'fallback');
  assert.deepEqual(official, before);
  assert.deepEqual(runOfficialSimulation(mobility), before);
});
