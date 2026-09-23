import { INDICATOR_CODES, INDICATOR_WEIGHTS } from "../data/rules.ts";
import type { IndicatorCode, IndicatorValues } from "../types/index.ts";

export const INDICATORS = INDICATOR_CODES;
export type Indicator = IndicatorCode;
export type Indicators = IndicatorValues;

export const WEIGHTS = INDICATOR_WEIGHTS;

export interface District {
  readonly id: string;
  /** Fraction, not percentage; shares across the city must sum to one. */
  readonly populationShare: number;
  readonly indicators: Indicators;
}

export interface ScoreResult {
  districtScores: Record<string, number>;
  cityAverage: number;
  minimumDistrictScore: number;
  criticalCount: number;
  score: number;
}

export function clampIndicator(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Indicators must be finite numbers");
  return Math.max(0, Math.min(100, value));
}

export function scoreDistrict(indicators: Indicators): number {
  return INDICATORS.reduce(
    (sum, key) => sum + WEIGHTS[key] * clampIndicator(indicators[key]), 0,
  );
}

/** Pure scoring; no intermediate rounding. */
export function scoreCity(districts: readonly District[]): ScoreResult {
  if (districts.length === 0) throw new Error("At least one district is required");
  const ids = new Set<string>();
  let populationTotal = 0;
  let cityAverage = 0;
  let criticalCount = 0;
  let minimumDistrictScore = Infinity;
  const entries: [string, number][] = [];
  // Stable order also prevents caller ordering from changing floating point sums.
  for (const district of [...districts].sort((a, b) => compareIds(a.id, b.id))) {
    if (!district.id || ids.has(district.id)) throw new Error("District IDs must be unique and nonempty");
    ids.add(district.id);
    if (!Number.isFinite(district.populationShare) || district.populationShare < 0) {
      throw new Error("Population shares must be finite and nonnegative");
    }
    populationTotal += district.populationShare;
    const score = scoreDistrict(district.indicators);
    entries.push([district.id, score]);
    cityAverage += district.populationShare * score;
    minimumDistrictScore = Math.min(minimumDistrictScore, score);
    criticalCount += INDICATORS.filter(key => clampIndicator(district.indicators[key]) < 40).length;
  }
  if (Math.abs(populationTotal - 1) > 1e-9) throw new Error("Population shares must sum to one");
  return {
    districtScores: Object.fromEntries(entries), cityAverage, minimumDistrictScore,
    criticalCount, score: 0.7 * cityAverage + 0.3 * minimumDistrictScore - criticalCount,
  };
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
