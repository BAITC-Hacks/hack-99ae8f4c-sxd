import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGY_PRESETS } from '../data/strategy-presets.ts';
import { LONG_TERM_ASSUMPTIONS, DEMO_FUTURE_FACTOR_CATALOG } from '../data/long-term-assumptions.ts';
import { runOfficialSimulation } from './official.ts';
import { runLongTermScenario } from './outlook.ts';
import { INDICATORS } from './scoring.ts';

const years = [2028, 2030, 2035, 2040, 2045, 2050];
const presets = STRATEGY_PRESETS.filter(preset => ['green', 'mobility', 'balanced'].includes(preset.id));

for (const preset of presets) {
  test(`outlook audit: ${preset.name}, water/population/maintenance matrix`, () => {
    const official = runOfficialSimulation(preset.selections);
    const snapshot = structuredClone(official);
    for (const water of [0.3, 0.9]) for (const population of [0.3, 0.9]) for (const maintenance of [0, 0.7]) {
      const config = structuredClone(LONG_TERM_ASSUMPTIONS);
      config.baselineMaintenanceCoverage = maintenance;
      config.maintenancePerPositiveEffectPoint = 0;
      const factors = DEMO_FUTURE_FACTOR_CATALOG.map(({ factor }) => ({
        ...factor, affectedMetrics: [...factor.affectedMetrics], sources: [...factor.sources],
        strength: factor.id === 'demo-water-stress' ? water : factor.id === 'demo-population-demand' ? population : factor.strength,
      }));
      const scenario = runLongTermScenario(official, factors, config);
      assert.deepEqual(scenario, runLongTermScenario(official, factors, config));
      assert.deepEqual(scenario.checkpoints.filter(p => p.year !== 2026).map(p => p.year), years);
      assert.deepEqual(scenario.checkpoints[1].districtIndicators, official.indicatorsAfter);
      assert.deepEqual(official, snapshot);
      for (const step of scenario.annualSteps) for (const district of Object.values(step.districtEffects)) {
        for (const metric of INDICATORS) {
          const trace = district[metric];
          assert.ok(Number.isFinite(trace.after) && trace.after >= 0 && trace.after <= 100);
          assert.ok(Math.abs(trace.after - trace.before) <= config.maximumAnnualIndicatorChange + 1e-9);
          assert.ok(Math.abs(trace.externalFactorImpact) <= config.maximumExternalImpactPerMetricPerYear + 1e-9);
        }
      }
      for (const changed of factors) {
        const alternative = runLongTermScenario(official, factors.map(f => f.id === changed.id ? { ...f, strength: 0 } : f), config);
        for (let i = 0; i < scenario.checkpoints.length; i++) for (const district of Object.keys(official.indicatorsAfter)) {
          for (const metric of INDICATORS.filter(metric => !changed.affectedMetrics.includes(metric))) {
            assert.equal(scenario.checkpoints[i].districtIndicators[district][metric], alternative.checkpoints[i].districtIndicators[district][metric]);
          }
        }
      }
      const maintained = runLongTermScenario(official, factors, { ...config, baselineMaintenanceCoverage: 0.9 });
      for (let i = 0; i < scenario.checkpoints.length; i++) for (const metric of INDICATORS) {
        assert.ok(maintained.checkpoints[i].cityIndicators[metric] >= scenario.checkpoints[i].cityIndicators[metric] - 1e-9);
      }
    }
    assert.deepEqual(runOfficialSimulation(preset.selections), snapshot);
  });
}
