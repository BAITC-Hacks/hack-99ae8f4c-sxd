import { DISTRICTS } from '../data/districts.ts';
import { MEASURES } from '../data/measures.ts';
import { LONG_TERM_ASSUMPTIONS } from '../data/long-term-assumptions.ts';
import { CATEGORIES } from '../data/rules.ts';
import { INDICATORS, clampIndicator, compareIds } from './scoring.ts';
import { HORIZON_QUARTERS } from './simulator.ts';
import { validateStrategy } from './validator.ts';
import type { Selection, SimulationResult } from './simulator.ts';
import type { IndicatorCode, Measure } from '../types/index.ts';
import type {
  FutureFactor, LongTermAssumptions, LongTermScenario, ScenarioAnnualStep,
  ScenarioCheckpoint, ScenarioIndicators, ScenarioIndicatorStep,
} from '../types/outlook.ts';

const catalog: ReadonlyMap<string, Measure> = new Map(MEASURES.map(measure => [measure.id, measure]));
const districts = [...DISTRICTS].sort((a, b) => compareIds(a.id, b.id));

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function requireNumber(value: unknown, min: number, max: number, label: string): asserts value is number {
  requireCondition(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    `${label} must be finite and between ${min} and ${max}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, label: string): asserts value is string {
  requireCondition(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text`);
}

function validateMetricRecord(value: unknown, min: number, max: number, label: string): void {
  requireCondition(record(value), `${label} must contain all ten indicators`);
  requireCondition(Object.keys(value).length === INDICATORS.length, `${label} must contain exactly ten indicators`);
  for (const key of INDICATORS) requireNumber(value[key], min, max, `${label}.${key}`);
}

/** Validates untrusted provider/API data before it affects a scenario. */
export function validateFutureFactors(value: unknown): asserts value is FutureFactor[] {
  requireCondition(Array.isArray(value) && value.length <= 30, 'Future factors must be an array of at most 30 factors');
  const seen = new Set<string>();
  for (const factor of value) {
    requireCondition(record(factor), 'Every future factor must be an object');
    requireText(factor.id, 'Factor id');
    requireCondition(!seen.has(factor.id), `Duplicate future factor: ${factor.id}`);
    seen.add(factor.id);
    requireText(factor.name, 'Factor name');
    requireText(factor.rationale, 'Factor rationale');
    requireCondition(typeof factor.direction === 'string'
      && ['positive', 'negative', 'mixed'].includes(factor.direction), 'Invalid factor direction');
    requireNumber(factor.strength, 0, 1, 'Factor strength');
    requireNumber(factor.confidence, 0, 1, 'Factor confidence');
    requireNumber(factor.startYear, 2026, 2050, 'Factor startYear');
    requireNumber(factor.endYear, 2026, 2050, 'Factor endYear');
    requireCondition(Number.isInteger(factor.startYear) && Number.isInteger(factor.endYear)
      && factor.startYear <= factor.endYear, 'Factor years must be ordered integers');
    requireCondition(Array.isArray(factor.affectedMetrics) && factor.affectedMetrics.length > 0,
      'Factor must affect at least one indicator');
    requireCondition(new Set(factor.affectedMetrics).size === factor.affectedMetrics.length
      && factor.affectedMetrics.every(metric => INDICATORS.includes(metric as IndicatorCode)),
    'Factor indicators must be known and unique');
    requireCondition(Array.isArray(factor.sources), 'Factor sources must be an array');
    for (const source of factor.sources) {
      requireCondition(record(source), 'Factor source must be an object');
      requireText(source.title, 'Source title');
      requireText(source.url, 'Source URL');
      let url: URL;
      try { url = new URL(source.url); } catch { throw new Error('Source URL must be an absolute HTTP(S) URL'); }
      requireCondition((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password,
        'Source URL must be HTTP(S) without embedded credentials');
    }
  }
}

export function validateLongTermAssumptions(value: unknown): asserts value is LongTermAssumptions {
  requireCondition(record(value), 'Scenario assumptions must be an object');
  requireText(value.version, 'Assumptions version');
  requireCondition(value.baselineYear === 2026 && value.officialEndYear === 2028 && value.endYear === 2050,
    'Scenario must preserve the 2026 baseline, 2028 official seed, and 2050 horizon');
  requireCondition(Array.isArray(value.checkpoints) && value.checkpoints.length >= 3
    && value.checkpoints[0] === 2026 && value.checkpoints[1] === 2028
    && value.checkpoints.at(-1) === 2050, 'Checkpoints must start 2026, 2028 and end 2050');
  requireCondition(value.checkpoints.every((year, index, years) => typeof year === 'number'
    && Number.isInteger(year) && year >= 2026 && year <= 2050 && (index === 0 || year > years[index - 1])),
  'Checkpoints must be unique increasing integer years');
  requireNumber(value.remainingEffectYears, 1, 22, 'remainingEffectYears');
  requireCondition(Number.isInteger(value.remainingEffectYears), 'remainingEffectYears must be an integer');
  requireCondition(record(value.lifecycleByCategory), 'Lifecycle assumptions must specify all categories');
  for (const category of CATEGORIES) {
    const lifecycle = value.lifecycleByCategory[category];
    requireCondition(record(lifecycle), `Missing lifecycle assumptions for ${category}`);
    requireNumber(lifecycle.annualEffectFraction, 0, 1, `${category}.annualEffectFraction`);
    requireNumber(lifecycle.halfLifeYears, 0.1, 100, `${category}.halfLifeYears`);
  }
  validateMetricRecord(value.decayExposureByMetric, 0, 1, 'decayExposureByMetric');
  requireNumber(value.maximumExternalImpactPerMetricPerYear, 0, 10, 'maximumExternalImpactPerMetricPerYear');
  requireNumber(value.maximumAnnualIndicatorChange, 0, 100, 'maximumAnnualIndicatorChange');
  validateMetricRecord(value.annualTrend, -10, 10, 'annualTrend');
  validateMetricRecord(value.mixedDirectionByMetric, -1, 1, 'mixedDirectionByMetric');
  validateMetricRecord(value.metricWeights, 0, 1, 'metricWeights');
  requireCondition(Math.abs(Object.values(value.metricWeights as ScenarioIndicators).reduce((a, b) => a + b, 0) - 1) < 1e-9,
    'Scenario metric weights must sum to one');
  for (const key of ['annualDecayRate', 'baselineMaintenanceCoverage', 'maintenancePerPositiveEffectPoint',
    'maximumMaintenanceCoverage', 'negativeFactorMitigationPerPositiveEffectPoint', 'maximumNegativeFactorMitigation'] as const) {
    requireNumber(value[key], 0, 1, key);
  }
  requireCondition((value.maximumMaintenanceCoverage as number) >= (value.baselineMaintenanceCoverage as number),
    'Maximum maintenance coverage cannot be below baseline coverage');
  requireNumber(value.factorPointsPerYearAtFullStrength, 0, 10, 'factorPointsPerYearAtFullStrength');
  requireNumber(value.factorRampYears, 1, 25, 'factorRampYears');
  requireCondition(Number.isInteger(value.factorRampYears), 'factorRampYears must be an integer');
  requireCondition(Array.isArray(value.description) && value.description.every(item => typeof item === 'string'),
    'Assumption descriptions must be an array of text');
}

/** Shared boundary for the optional research and scenario stages; never calculates official scores. */
export function validateOfficialSeed(result: SimulationResult): void {
  requireCondition(record(result), 'A 2-Year Official Simulation result is required');
  requireCondition(Array.isArray(result.selectedMeasures) && result.selectedMeasures.every(selection => record(selection)
    && typeof selection.measureId === 'string' && (selection.districtId === undefined || typeof selection.districtId === 'string')),
  'Official selected measures are malformed');
  const validation = validateStrategy(result.selectedMeasures);
  requireCondition(validation.valid, `Scenario requires a valid official strategy: ${validation.errors.map(error => error.message).join(' ')}`);
  for (const key of ['indicatorsBefore', 'indicatorsAfter'] as const) {
    requireCondition(record(result[key]) && Object.keys(result[key]).length === districts.length,
      'Scenario requires all five official districts');
    for (const district of districts) validateMetricRecord(result[key][district.id], 0, 100, `${key}.${district.id}`);
  }
}

function metrics(fn: (metric: IndicatorCode) => number): ScenarioIndicators {
  return Object.fromEntries(INDICATORS.map(metric => [metric, fn(metric)])) as ScenarioIndicators;
}

function checkpoint(year: number, values: Record<string, ScenarioIndicators>, config: LongTermAssumptions): ScenarioCheckpoint {
  const cityIndicators = metrics(metric => districts.reduce((total, district) => total + district.populationShare * values[district.id][metric], 0));
  const index = (indicators: ScenarioIndicators) => INDICATORS.reduce((sum, metric) => sum + config.metricWeights[metric] * indicators[metric], 0);
  return {
    year,
    phase: year === config.baselineYear ? 'baseline-reference' : year === config.officialEndYear ? 'official-seed' : 'scenario',
    index: index(cityIndicators), cityIndicators,
    districtIndices: Object.fromEntries(districts.map(district => [district.id, index(values[district.id])])),
    districtIndicators: structuredClone(values),
  };
}

/** Pure, deterministic exploratory model. Does not call scoreCity or calculate official QoL. */
export function runLongTermScenario(
  officialResult: SimulationResult,
  factors: readonly FutureFactor[],
  config: LongTermAssumptions = LONG_TERM_ASSUMPTIONS,
): LongTermScenario {
  validateOfficialSeed(officialResult);
  validateFutureFactors(factors);
  validateLongTermAssumptions(config);
  const orderedFactors = structuredClone([...factors]).sort((a, b) => compareIds(a.id, b.id));
  const selected = [...officialResult.selectedMeasures].sort((a, b) => compareIds(a.measureId, b.measureId));
  const resolved: { selection: Selection; measure: Measure }[] = selected.map(selection => ({ selection, measure: catalog.get(selection.measureId)! }));
  let current = structuredClone(officialResult.indicatorsAfter) as Record<string, ScenarioIndicators>;
  const checkpoints = [
    checkpoint(config.baselineYear, officialResult.indicatorsBefore as Record<string, ScenarioIndicators>, config),
    checkpoint(config.officialEndYear, current, config),
  ];
  const annualSteps: ScenarioAnnualStep[] = [];

  for (let year = config.officialEndYear + 1; year <= config.endYear; year++) {
    const age = year - config.officialEndYear;
    const before = checkpoint(year - 1, current, config);
    const next: Record<string, ScenarioIndicators> = {};
    const districtEffects: ScenarioAnnualStep['districtEffects'] = {};
    const factorImpacts = orderedFactors.filter(factor => year >= factor.startYear && year <= factor.endYear).map(factor => ({
      factorId: factor.id, indexImpact: 0,
      rampFraction: Math.min(1, (year - factor.startYear + 1) / config.factorRampYears),
    }));

    for (const district of districts) {
      const relevant = resolved.filter(({ selection, measure }) => measure.scope === 'city' || selection.districtId === district.id);
      const effects = {} as Record<IndicatorCode, ScenarioIndicatorStep>;
      next[district.id] = metrics(metric => {
        let remainingMeasureEffect = 0;
        let longTermMeasureEffect = 0;
        let positiveEffects = 0;
        for (const { measure } of relevant) {
          const delta = measure.effects.find(effect => effect.indicator === metric)?.delta ?? 0;
          const lifecycle = config.lifecycleByCategory[measure.category];
          if (age <= config.remainingEffectYears) {
            // Official simulation already applied delta * (8 - lag) / 8, including negative effects.
            remainingMeasureEffect += delta * measure.lag / HORIZON_QUARTERS / config.remainingEffectYears;
          }
          longTermMeasureEffect += delta * lifecycle.annualEffectFraction * 2 ** (-age / lifecycle.halfLifeYears);
          positiveEffects += Math.max(0, delta) * 2 ** (-age / lifecycle.halfLifeYears);
        }
        const maintenance = Math.min(config.maximumMaintenanceCoverage,
          config.baselineMaintenanceCoverage + positiveEffects * config.maintenancePerPositiveEffectPoint);
        const mitigation = Math.min(config.maximumNegativeFactorMitigation,
          positiveEffects * config.negativeFactorMitigationPerPositiveEffectPoint);
        const contributions: { factorImpact: typeof factorImpacts[number]; impact: number }[] = [];
        for (const factorImpact of factorImpacts) {
          const factor = orderedFactors.find(item => item.id === factorImpact.factorId)!;
          if (!factor.affectedMetrics.includes(metric)) continue;
          const direction = factor.direction === 'positive' ? 1 : factor.direction === 'negative' ? -1 : config.mixedDirectionByMetric[metric];
          const impact = direction * factor.strength * config.factorPointsPerYearAtFullStrength * factorImpact.rampFraction
            * (direction < 0 ? 1 - mitigation : 1);
          contributions.push({ factorImpact, impact });
        }
        const total = contributions.reduce((sum, item) => sum + item.impact, 0);
        const scale = Math.abs(total) > config.maximumExternalImpactPerMetricPerYear
          ? config.maximumExternalImpactPerMetricPerYear / Math.abs(total) : 1;
        const externalFactorImpact = total * scale;
        for (const { factorImpact, impact } of contributions) {
          factorImpact.indexImpact += impact * scale * district.populationShare * config.metricWeights[metric];
        }
        const value = current[district.id][metric];
        const decay = value * config.decayExposureByMetric[metric] * config.annualDecayRate * (1 - maintenance);
        const raw = value + remainingMeasureEffect + longTermMeasureEffect + config.annualTrend[metric] + externalFactorImpact - decay;
        const after = clampIndicator(value + Math.max(-config.maximumAnnualIndicatorChange,
          Math.min(config.maximumAnnualIndicatorChange, raw - value)));
        effects[metric] = {
          before: value, remainingMeasureEffect, longTermMeasureEffect,
          baselineTrendImpact: config.annualTrend[metric], externalFactorImpact,
          maintenanceCoverage: maintenance, negativeFactorMitigation: mitigation,
          decay, clampAdjustment: after - raw, after,
        };
        return after;
      });
      districtEffects[district.id] = effects;
    }
    current = next;
    const after = checkpoint(year, current, config);
    annualSteps.push({ year, indexBefore: before.index, indexAfter: after.index, districtEffects, factorImpacts });
    if (config.checkpoints.includes(year)) checkpoints.push(after);
  }
  return {
    kind: 'scenario', metricLabel: 'Scenario indicator index',
    notice: 'Exploratory 2050 scenario using illustrative assumptions; not the official hackathon score or a forecast. The 2028 indicator state is copied from the 2-Year Official Simulation.',
    checkpoints, annualSteps, factors: orderedFactors, assumptions: structuredClone(config),
  };
}
