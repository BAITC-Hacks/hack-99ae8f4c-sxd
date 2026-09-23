import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LONG_TERM_ASSUMPTIONS, LONG_TERM_SENSITIVITY, DEMO_FUTURE_FACTOR_CATALOG } from '../data/long-term-assumptions.ts';
import { generateLocalStrategy } from './agents/strategy.ts';
import { runOfficialSimulation } from './official.ts';
import { runLongTermScenario } from './outlook.ts';
import { INDICATORS } from './scoring.ts';
import { DISTRICTS } from '../data/districts.ts';
import type { FutureFactor, LongTermScenario } from '../types/outlook.ts';

const factors = () => structuredClone(DEMO_FUTURE_FACTOR_CATALOG.map(entry => entry.factor)) as FutureFactor[];
const seeds = LONG_TERM_SENSITIVITY.strategyNames.map(name => runOfficialSimulation(generateLocalStrategy(name).selectedMeasures));
function bounded(scenario: LongTermScenario) {
  for (const step of scenario.annualSteps) {
    const attributed = step.factorImpacts.reduce((sum, factor) => sum + factor.indexImpact, 0);
    const applied = DISTRICTS.reduce((sum, district) => sum + district.populationShare * INDICATORS.reduce(
      (total, metric) => total + scenario.assumptions.metricWeights[metric]
        * step.districtEffects[district.id][metric].externalFactorImpact, 0), 0);
    assert.ok(Math.abs(attributed - applied) < 1e-9);
  }
  for (const step of scenario.annualSteps) for (const district of Object.values(step.districtEffects)) {
    for (const trace of Object.values(district)) {
      assert.ok(Number.isFinite(trace.after) && trace.after >= 0 && trace.after <= 100);
      assert.ok(Math.abs(trace.after - trace.before) <= scenario.assumptions.maximumAnnualIndicatorChange + 1e-9);
      assert.ok(Math.abs(trace.externalFactorImpact) <= scenario.assumptions.maximumExternalImpactPerMetricPerYear + 1e-9);
      assert.ok(Math.abs(trace.after - trace.before - (trace.remainingMeasureEffect + trace.longTermMeasureEffect
        + trace.baselineTrendImpact + trace.externalFactorImpact - trace.decay + trace.clampAdjustment)) < 1e-9);
    }
  }
}

test('108 joint sensitivity cases: strength, population, water, maintenance and both strategies', () => {
  for (const seed of seeds) {
    const snapshot = structuredClone(seed);
    for (const strength of LONG_TERM_SENSITIVITY.strengths) {
      for (const population of Object.values(LONG_TERM_SENSITIVITY.pressureLevels)) {
        for (const water of Object.values(LONG_TERM_SENSITIVITY.pressureLevels)) {
          for (const coverage of Object.values(LONG_TERM_SENSITIVITY.maintenanceCoverage)) {
            const config = structuredClone(LONG_TERM_ASSUMPTIONS);
            config.baselineMaintenanceCoverage = coverage;
            const inputs = factors().map(factor => ({ ...factor, strength: factor.id === 'demo-population-demand'
              ? population : factor.id === 'demo-water-stress' ? water : factor.strength === 0 ? 0 : strength }));
            const scenario = runLongTermScenario(seed, inputs, config);
            bounded(scenario);
            assert.deepEqual(scenario, runLongTermScenario(seed, inputs, config));
            assert.deepEqual(scenario.checkpoints[1].districtIndicators, seed.indicatorsAfter);
          }
        }
      }
    }
    assert.deepEqual(seed, snapshot);
    assert.deepEqual(runOfficialSimulation(seed.selectedMeasures), snapshot);
  }
});

test('population and water pressure are monotone and change only mapped metrics', () => {
  for (const seed of seeds) for (const id of ['demo-population-demand', 'demo-water-stress']) {
    const trajectories = LONG_TERM_SENSITIVITY.strengths.map(strength => runLongTermScenario(seed,
      factors().map(factor => factor.id === id ? { ...factor, strength } : factor)));
    const affected = factors().find(factor => factor.id === id)!.affectedMetrics;
    for (let i = 1; i < trajectories.length; i++) for (let t = 0; t < trajectories[i].checkpoints.length; t++) {
      for (const district of Object.keys(seed.indicatorsAfter)) for (const metric of INDICATORS) {
        const low = trajectories[i - 1].checkpoints[t].districtIndicators[district][metric];
        const high = trajectories[i].checkpoints[t].districtIndicators[district][metric];
        if (affected.includes(metric)) assert.ok(high <= low + 1e-9);
        else assert.equal(high, low);
      }
    }
  }
});

test('maintenance improves exposed capacity; unmaintained capacity declines with isolated decay', () => {
  const config = structuredClone(LONG_TERM_ASSUMPTIONS);
  config.baselineMaintenanceCoverage = 0;
  config.maintenancePerPositiveEffectPoint = 0;
  for (const metric of INDICATORS) config.annualTrend[metric] = 0;
  for (const lifecycle of Object.values(config.lifecycleByCategory)) lifecycle.annualEffectFraction = 0;
  for (const seed of seeds) {
    const without = runLongTermScenario(seed, [], config);
    const withMaintenance = runLongTermScenario(seed, [], { ...config, baselineMaintenanceCoverage: 0.7 });
    for (const step of without.annualSteps.filter(step => step.year > 2031)) {
      for (const district of Object.values(step.districtEffects)) for (const metric of INDICATORS) {
        assert.ok(district[metric].after <= district[metric].before);
      }
    }
    for (const metric of INDICATORS) assert.ok(withMaintenance.checkpoints.at(-1)!.cityIndicators[metric]
      >= without.checkpoints.at(-1)!.cityIndicators[metric]);
    assert.ok(withMaintenance.checkpoints.at(-1)!.index > without.checkpoints.at(-1)!.index);
  }
});

test('stronger targeted initiative improves its metric from an identical official seed', () => {
  // Isolate continuation effects from the official score; replace bus lanes with LRT.
  const selections = [
    { measureId: 'M1', districtId: 'nura' }, { measureId: 'M4', districtId: 'nura' },
    { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' }, { measureId: 'M14' },
  ];
  const seed = runOfficialSimulation(selections);
  const stronger = { ...seed, selectedMeasures: selections.map(s => s.measureId === 'M1' ? { ...s, measureId: 'M3' } : s) };
  const low = runLongTermScenario(seed, factors());
  const high = runLongTermScenario(stronger, factors());
  for (let i = 1; i < low.checkpoints.length; i++) for (const metric of ['T1', 'T2'] as const) {
    assert.ok(high.checkpoints[i].districtIndicators.nura[metric] >= low.checkpoints[i].districtIndicators.nura[metric]);
  }
});

test('30 overlapping full-strength factors stay bounded and retain trace accounting', () => {
  for (const direction of ['positive', 'negative'] as const) {
    const inputs = Array.from({ length: 30 }, (_, index) => ({ ...factors()[0], id: `stress-${index}`,
      strength: 1, confidence: 1, direction, affectedMetrics: [...INDICATORS], startYear: 2029 }));
    const scenario = runLongTermScenario(seeds[0], inputs);
    bounded(scenario);
    assert.deepEqual(scenario, runLongTermScenario(seeds[0], [...inputs].reverse()));
  }
});

test('small strength perturbations produce small trajectory changes', () => {
  const low = runLongTermScenario(seeds[0], factors());
  const high = runLongTermScenario(seeds[0], factors().map(factor => ({ ...factor, strength: factor.strength + 0.000001 })));
  for (let i = 0; i < low.checkpoints.length; i++) for (const metric of INDICATORS) {
    assert.ok(Math.abs(high.checkpoints[i].cityIndicators[metric] - low.checkpoints[i].cityIndicators[metric]) < 0.001);
  }
});

test('invalid new guardrails fail closed', () => {
  for (const patch of [
    { maximumExternalImpactPerMetricPerYear: NaN },
    { maximumAnnualIndicatorChange: -1 },
    { decayExposureByMetric: { ...LONG_TERM_ASSUMPTIONS.decayExposureByMetric, E2: 2 } },
  ]) assert.throws(() => runLongTermScenario(seeds[0], factors(), { ...LONG_TERM_ASSUMPTIONS, ...patch }));
});
