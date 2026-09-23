import type { FutureFactor, LongTermAssumptions } from '../types/outlook.ts';
import type { Category } from '../types/index.ts';
import { deepFreeze } from './immutable.ts';
import type { DeepReadonly } from './immutable.ts';

/** Sensitivity inputs are hypotheses, not probabilities or demographic projections. */
export const LONG_TERM_SENSITIVITY = deepFreeze({
  strengths: [0.3, 0.6, 0.9],
  pressureLevels: { low: 0.3, medium: 0.6, high: 0.9 },
  maintenanceCoverage: { without: 0, with: 0.7 },
  strategyNames: ['Industrial-Mobility First', 'Green Growth'],
});

/** Illustrative scenario assumptions, not calibrated forecasts or official scoring rules. */
export const LONG_TERM_ASSUMPTIONS: LongTermAssumptions = deepFreeze({
  version: 'demo-scenario-v2',
  baselineYear: 2026,
  officialEndYear: 2028,
  endYear: 2050,
  checkpoints: [2026, 2028, 2030, 2035, 2040, 2045, 2050],
  remainingEffectYears: 3,
  lifecycleByCategory: {
    Transport: { annualEffectFraction: 0.025, halfLifeYears: 15 },
    Ecology: { annualEffectFraction: 0.035, halfLifeYears: 22 },
    Social: { annualEffectFraction: 0.020, halfLifeYears: 18 },
    Safety: { annualEffectFraction: 0.015, halfLifeYears: 10 },
    Services: { annualEffectFraction: 0.025, halfLifeYears: 16 },
  },
  annualTrend: {
    T1: -0.12, T2: -0.10, E1: -0.06, E2: -0.04, S1: -0.10,
    S2: -0.08, B1: -0.04, B2: -0.06, C1: -0.12, C2: 0.04,
  },
  annualDecayRate: 0.003,
  baselineMaintenanceCoverage: 0.35,
  maintenancePerPositiveEffectPoint: 0,
  maximumMaintenanceCoverage: 0.9,
  negativeFactorMitigationPerPositiveEffectPoint: 0.018,
  maximumNegativeFactorMitigation: 0.45,
  factorPointsPerYearAtFullStrength: 0.55,
  factorRampYears: 5,
  maximumExternalImpactPerMetricPerYear: 0.8,
  maximumAnnualIndicatorChange: 4,
  decayExposureByMetric: {
    T1: 1, T2: 1, E1: 1, E2: 0, S1: 1,
    S2: 1, B1: 1, B2: 1, C1: 1, C2: 1,
  },
  mixedDirectionByMetric: {
    T1: -0.4, T2: -0.3, E1: -0.4, E2: -0.3, S1: -0.4,
    S2: -0.3, B1: -0.2, B2: -0.2, C1: -0.4, C2: 0.3,
  },
  // Deliberately different from official weights and the official city score formula.
  metricWeights: {
    T1: 0.1, T2: 0.1, E1: 0.1, E2: 0.1, S1: 0.1,
    S2: 0.1, B1: 0.1, B2: 0.1, C1: 0.1, C2: 0.1,
  },
  description: [
    '2026 is a baseline reference. 2028 copies official final indicators exactly; annual scenario updates start in 2029.',
    'Scenario indicator index is a population-weighted average on a 0–100 scale, using the configured indicator weights (equal by default). It is not the official Astana QoL Score.',
    'The unimplemented fraction of each signed catalog effect (lag / 8) is spread equally over the configured completion period after 2028; already realized effects and synergies are not applied again.',
    'Additional annual lifecycle effects equal the catalog effect times its category annual fraction times 2^(-years since 2028 / category half-life). Negative trade-offs retain their sign.',
    'Annual decay equals current indicator times metric decay exposure times decay rate times (1 - maintenance coverage). This is a capacity proxy, not an asset inventory. E2 has zero exposure; others have unit exposure. Investment-linked maintenance defaults to zero: investment is not maintenance funding.',
    'Annual baseline trends represent illustrative recurring demand pressure. Factors add point impacts only during their inclusive start/end years and ramp to full strength over the configured ramp period.',
    'Negative factor impacts are reduced on targeted metrics by half-life-tapered positive effects of selected measures, within a configured cap. Mixed factors use explicit per-metric direction coefficients.',
    'Factor confidence is an evidence-quality label, not a probability or an impact multiplier. All demo factors are illustrative and have no research citations.',
    'All strategies receive the same demo pressures. A separate infrastructure-aging factor is omitted to avoid double-counting routine decay.',
    'Summed external impacts are capped per metric at 0.8 points/year; contributions on that metric scale equally. There is no cross-metric scaling.',
    'Net annual changes are capped at 4 points before the 0–100 clamp. clampAdjustment records both limits; factor impacts are before these final limits.',
    'Lifecycle effects and resilience taper from 2028. No positive percentage growth or reinvestment compounds indicator gains.',
    'All scenario coefficients, dates, mappings and pressure levels are arbitrary illustrative assumptions, not empirical estimates.',
    'District population shares remain fixed. Updates are simultaneous, indicators are clamped to 0–100 once per year, and no new measures or budget are assumed after 2028.',
  ],
});

/** No item below is research evidence; an empty category filter means city-wide relevance. */
export const DEMO_FUTURE_FACTOR_CATALOG: DeepReadonly<{
  categories: Category[];
  factor: FutureFactor;
}[]> = deepFreeze([
  {
    categories: [],
    factor: {
      id: 'demo-population-demand', name: 'Population and service demand', direction: 'negative', strength: 0.65,
      confidence: 0.35, startYear: 2029, endYear: 2050, affectedMetrics: ['S1', 'S2', 'C1'],
      rationale: 'Demo hypothesis: growth puts increasing pressure on schools, clinics, and utility capacity. Selected investments soften pressure only on their affected metrics and districts.',
      sources: [],
    },
  },
  {
    categories: [],
    factor: {
      id: 'demo-climate-pressure', name: 'Climate pressure', direction: 'negative', strength: 0.55,
      confidence: 0.3, startYear: 2032, endYear: 2050, affectedMetrics: ['E1', 'E2', 'S2'],
      rationale: 'Demo hypothesis: warming and weather stress gradually weigh on green space, environmental conditions, and health after 2032. This timing is illustrative, not a climate projection.',
      sources: [],
    },
  },
  {
    categories: [],
    factor: {
      id: 'demo-water-stress', name: 'Water stress', direction: 'negative', strength: 0.6,
      confidence: 0.3, startYear: 2030, endYear: 2050, affectedMetrics: ['C1', 'E1'],
      rationale: 'Demo hypothesis: water pressure increases from 2030, challenging utilities and green space. Infrastructure and ecological choices create different levels of resilience.',
      sources: [],
    },
  },
  {
    categories: [],
    factor: {
      id: 'demo-transport-demand', name: 'Transport demand', direction: 'negative', strength: 0.7,
      confidence: 0.4, startYear: 2029, endYear: 2050, affectedMetrics: ['T1', 'T2', 'B2'],
      rationale: 'Demo hypothesis: additional trips put pressure on mobility and road safety. Transport investment reduces modeled exposure where it improves the corresponding indicator.',
      sources: [],
    },
  },
  {
    categories: [],
    factor: {
      id: 'demo-energy-utilities', name: 'Energy and utility pressure', direction: 'negative', strength: 0.5,
      confidence: 0.3, startYear: 2033, endYear: 2050, affectedMetrics: ['C1', 'E2'],
      rationale: 'Demo hypothesis: higher energy and utility demand stresses networks and environmental indicators from 2033. Utility modernization changes local exposure.',
      sources: [],
    },
  },
  {
    categories: [],
    factor: {
      id: 'demo-urban-expansion', name: 'Urban expansion and digital access', direction: 'mixed', strength: 0.5,
      confidence: 0.3, startYear: 2030, endYear: 2050, affectedMetrics: ['T1', 'E1', 'S1', 'C2'],
      rationale: 'Demo hypothesis: expansion increases mobility, green-space, and school pressure while creating opportunities for digital service access. Per-metric signs are explicit in scenario configuration.',
      sources: [],
    },
  },
]);
