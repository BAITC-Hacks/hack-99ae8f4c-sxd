import type { Category, IndicatorCode } from './index.ts';
import type { SimulationResult } from '../lib/simulator.ts';

/** External hypotheses, never inputs to the official hackathon score. */
export interface FutureFactor {
  id: string;
  name: string;
  direction: 'positive' | 'negative' | 'mixed';
  /** Relative scenario intensity, in [0, 1]. */
  strength: number;
  /** Research confidence, in [0, 1]; does not scale the scenario impact. */
  confidence: number;
  startYear: number;
  endYear: number;
  affectedMetrics: IndicatorCode[];
  rationale: string;
  sources: { title: string; url: string; publisher?: string; publishedAt?: string }[];
}

export interface FutureResearchResult {
  sourceMode: 'demo' | 'live';
  status: 'success' | 'fallback';
  failure?: { code: 'not_configured' | 'research_failed'; message: string };
  mode: 'demo' | 'live';
  provider: string;
  notice: string;
  factors: FutureFactor[];
}

/** Future search runs after the official two-year result and returns evidence with provenance. */
export interface FutureResearchProvider {
  readonly id: string;
  readonly mode: 'demo' | 'live';
  research(officialResult: SimulationResult): Promise<readonly FutureFactor[]>;
}

export type ScenarioIndicators = Record<IndicatorCode, number>;

export interface LongTermAssumptions {
  version: string;
  baselineYear: 2026;
  officialEndYear: 2028;
  endYear: 2050;
  checkpoints: readonly number[];
  remainingEffectYears: number;
  lifecycleByCategory: Record<Category, {
    /** Additional yearly effect as a fraction of the catalog effect, tapering with age. */
    annualEffectFraction: number;
    halfLifeYears: number;
  }>;
  annualTrend: ScenarioIndicators;
  annualDecayRate: number;
  baselineMaintenanceCoverage: number;
  maintenancePerPositiveEffectPoint: number;
  maximumMaintenanceCoverage: number;
  negativeFactorMitigationPerPositiveEffectPoint: number;
  maximumNegativeFactorMitigation: number;
  factorPointsPerYearAtFullStrength: number;
  factorRampYears: number;
  maximumExternalImpactPerMetricPerYear: number;
  maximumAnnualIndicatorChange: number;
  decayExposureByMetric: ScenarioIndicators;
  mixedDirectionByMetric: ScenarioIndicators;
  metricWeights: ScenarioIndicators;
  description: readonly string[];
}

export interface ScenarioCheckpoint {
  year: number;
  phase: 'baseline-reference' | 'official-seed' | 'scenario';
  index: number;
  cityIndicators: ScenarioIndicators;
  districtIndices: Record<string, number>;
  districtIndicators: Record<string, ScenarioIndicators>;
}

/** Every term is in indicator points; the terms reconcile exactly to after - before. */
export interface ScenarioIndicatorStep {
  before: number;
  remainingMeasureEffect: number;
  longTermMeasureEffect: number;
  baselineTrendImpact: number;
  externalFactorImpact: number;
  maintenanceCoverage: number;
  negativeFactorMitigation: number;
  decay: number;
  clampAdjustment: number;
  after: number;
}

export interface ScenarioFactorImpact {
  factorId: string;
  /** Population- and metric-weighted index points in this year, before clamping. */
  indexImpact: number;
  rampFraction: number;
}

export interface ScenarioAnnualStep {
  year: number;
  indexBefore: number;
  indexAfter: number;
  districtEffects: Record<string, Record<IndicatorCode, ScenarioIndicatorStep>>;
  factorImpacts: ScenarioFactorImpact[];
}

export interface LongTermScenario {
  kind: 'scenario';
  metricLabel: 'Scenario indicator index';
  notice: string;
  checkpoints: ScenarioCheckpoint[];
  annualSteps: ScenarioAnnualStep[];
  factors: FutureFactor[];
  assumptions: LongTermAssumptions;
}
