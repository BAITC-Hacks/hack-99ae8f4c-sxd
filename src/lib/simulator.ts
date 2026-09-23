import { INDICATORS, clampIndicator, compareIds, scoreCity } from "./scoring.ts";
import type { District, Indicator, Indicators, ScoreResult } from "./scoring.ts";
import { SYNERGIES } from "../data/interactions.ts";

export const HORIZON_QUARTERS = 8;

export interface Measure {
  readonly id: string;
  readonly scope: "district" | "city";
  readonly cost: number;
  readonly lag: number;
  readonly fullEffect: Readonly<Partial<Record<Indicator, number>>>;
}

export interface SimulationDataset {
  readonly districts: readonly District[];
  readonly measures: readonly Measure[];
  readonly budget: number;
}

/** Omit districtId for city-wide measures. */
export interface Selection {
  readonly measureId: string;
  readonly districtId?: string;
}

export interface ActivatedSynergy {
  measures: readonly [string, string];
  districtId: string;
  indicator: Indicator;
  bonus: number;
  appliedBonus: number;
}

export interface MeasureContribution {
  selection: Selection;
  cost: number;
  /** Before clamping and synergies, for each affected district. */
  realizedEffects: Record<string, Partial<Record<Indicator, number>>>;
  /** Final score minus score with this selection removed, including lost synergies.
   * These marginal contributions need not sum to the overall score delta.
   */
  marginalScoreContribution: number;
}

export interface SimulationResult {
  baselineScore: number;
  finalScore: number;
  scoreDelta: number;
  districtScoresBefore: Record<string, number>;
  districtScoresAfter: Record<string, number>;
  indicatorsBefore: Record<string, Indicators>;
  indicatorsAfter: Record<string, Indicators>;
  indicatorDeltas: Record<string, Indicators>;
  totalCost: number;
  remainingBudget: number;
  selectedMeasures: Selection[];
  activatedSynergies: ActivatedSynergy[];
  contributions: MeasureContribution[];
  baseline: ScoreResult;
  final: ScoreResult;
}

type MutableIndicators = Record<Indicator, number>;
type ResolvedSelection = { selection: Selection; measure: Measure; targets: readonly string[] };

function mapIndicators(fn: (key: Indicator) => number): MutableIndicators {
  return Object.fromEntries(INDICATORS.map(key => [key, fn(key)])) as MutableIndicators;
}

function validateDataset(dataset: SimulationDataset): void {
  scoreCity(dataset.districts);
  if (!Number.isFinite(dataset.budget) || dataset.budget < 0) throw new Error("Invalid budget");
  const ids = new Set<string>();
  for (const measure of dataset.measures) {
    if (!measure.id || ids.has(measure.id)) throw new Error("Measure IDs must be unique and nonempty");
    ids.add(measure.id);
    if (measure.scope !== "district" && measure.scope !== "city") throw new Error("Invalid measure scope");
    if (!Number.isFinite(measure.cost) || measure.cost < 0) throw new Error("Invalid measure cost");
    if (!Number.isInteger(measure.lag) || measure.lag < 0 || measure.lag > HORIZON_QUARTERS) {
      throw new Error("Measure lag must be an integer from 0 to 8 quarters");
    }
    for (const [key, value] of Object.entries(measure.fullEffect)) {
      if (!INDICATORS.includes(key as Indicator) || !Number.isFinite(value)) {
        throw new Error("Invalid measure effect");
      }
    }
  }
}

function applyStrategy(districts: readonly District[], selections: readonly ResolvedSelection[]) {
  const values = new Map(districts.map(district => [
    district.id, mapIndicators(key => clampIndicator(district.indicators[key])),
  ]));
  // Add effects together before clamping: selection order must not affect saturation.
  for (const { measure, targets } of selections) {
    for (const id of targets) {
      const indicators = values.get(id)!;
      for (const key of INDICATORS) {
        indicators[key] += (measure.fullEffect[key] ?? 0) * (HORIZON_QUARTERS - measure.lag) / HORIZON_QUARTERS;
      }
    }
  }
  const activatedSynergies: ActivatedSynergy[] = [];
  for (const { districtMeasureId: anchor, cityMeasureId: partner, effects } of SYNERGIES) {
    if (!selections.some(item => item.measure.id === partner)) continue;
    for (const item of selections.filter(item => item.measure.id === anchor)) {
      for (const districtId of item.targets) {
        const indicators = values.get(districtId)!;
        for (const { indicator, delta } of effects) {
          const before = indicators[indicator];
          indicators[indicator] = before + delta;
          activatedSynergies.push({
            measures: [anchor, partner], districtId, indicator, bonus: delta,
            appliedBonus: clampIndicator(indicators[indicator]) - clampIndicator(before),
          });
        }
      }
    }
  }
  // The official formula clips once, after summing all effects and fixed synergies.
  for (const indicators of values.values()) {
    for (const key of INDICATORS) indicators[key] = clampIndicator(indicators[key]);
  }
  const after = districts.map(district => ({ ...district, indicators: values.get(district.id)! }));
  return { after, activatedSynergies, score: scoreCity(after) };
}

/** Generic deterministic engine for explicit datasets and counterfactual analysis.
 * Product requests must use runOfficialSimulation, which validates official rules first.
 * No network, LLM, randomness, clock access, or mutation of input data is involved.
 */
export function simulateStrategy(
  selections: readonly Selection[], dataset: SimulationDataset,
): SimulationResult {
  validateDataset(dataset);
  const measures = new Map(dataset.measures.map(measure => [measure.id, measure]));
  const districts = [...dataset.districts].sort((a, b) => compareIds(a.id, b.id));
  const districtIds = districts.map(district => district.id);
  const seen = new Set<string>();
  const resolved: ResolvedSelection[] = selections.map(input => {
    const selection = { ...input };
    const measure = measures.get(selection.measureId);
    if (!measure) throw new Error(`Unknown measure: ${selection.measureId}`);
    if (measure.scope === "city" && selection.districtId !== undefined) {
      throw new Error("City-wide measures must not specify a district");
    }
    if (measure.scope === "district" && !districtIds.includes(selection.districtId ?? "")) {
      throw new Error("District measures require a known district");
    }
    const key = JSON.stringify([selection.measureId, selection.districtId]);
    if (seen.has(key)) throw new Error("Duplicate measure selection for the same target");
    seen.add(key);
    return { selection, measure, targets: measure.scope === "city" ? districtIds : [selection.districtId!] };
  }).sort((a, b) => compareIds(a.measure.id, b.measure.id)
    || compareIds(a.selection.districtId ?? "", b.selection.districtId ?? ""));
  const baseline = scoreCity(districts);
  const result = applyStrategy(districts, resolved);
  const totalCost = resolved.reduce((sum, item) => sum + item.measure.cost, 0);
  const contributions = resolved.map((item, index): MeasureContribution => ({
    selection: { ...item.selection }, cost: item.measure.cost,
    realizedEffects: Object.fromEntries(item.targets.map(id => [id, Object.fromEntries(
      INDICATORS.filter(key => item.measure.fullEffect[key] !== undefined).map(key => [
        key, item.measure.fullEffect[key]! * (HORIZON_QUARTERS - item.measure.lag) / HORIZON_QUARTERS,
      ]),
    )])),
    marginalScoreContribution: result.score.score
      - applyStrategy(districts, resolved.filter((_, other) => other !== index)).score.score,
  }));
  return {
    baselineScore: baseline.score, finalScore: result.score.score,
    scoreDelta: result.score.score - baseline.score,
    districtScoresBefore: { ...baseline.districtScores },
    districtScoresAfter: { ...result.score.districtScores },
    indicatorsBefore: Object.fromEntries(districts.map(d => [d.id, mapIndicators(key => clampIndicator(d.indicators[key]))])),
    indicatorsAfter: Object.fromEntries(result.after.map(d => [d.id, { ...d.indicators }])),
    indicatorDeltas: Object.fromEntries(result.after.map((d, index) => [d.id,
      mapIndicators(key => d.indicators[key] - clampIndicator(districts[index].indicators[key])),
    ])),
    totalCost, remainingBudget: dataset.budget - totalCost,
    selectedMeasures: resolved.map(item => ({ ...item.selection })),
    activatedSynergies: result.activatedSynergies, contributions, baseline, final: result.score,
  };
}
