/** Stable identifiers shared by the catalogue, validator, and simulator. */
export type DistrictId = 'esil' | 'almaty' | 'saryarka' | 'baikonur' | 'nura';

export type IndicatorCode =
  | 'T1' | 'T2' | 'E1' | 'E2' | 'S1' | 'S2'
  | 'B1' | 'B2' | 'C1' | 'C2';

export type Category = 'Transport' | 'Ecology' | 'Social' | 'Safety' | 'Services';
export type IndicatorValues = Readonly<Record<IndicatorCode, number>>;

export interface District {
  readonly id: DistrictId;
  readonly name: string;
  /** Fraction of the city population; all five shares sum to one. */
  readonly populationShare: number;
  readonly initialIndicators: IndicatorValues;
}

export type DistrictMeasureId =
  | 'M1' | 'M3' | 'M4' | 'M5' | 'M7' | 'M8' | 'M9' | 'M10' | 'M11' | 'M13';
export type CityMeasureId = 'M2' | 'M6' | 'M12' | 'M14';
export type MeasureId = DistrictMeasureId | CityMeasureId;

export interface MeasureEffect {
  readonly indicator: IndicatorCode;
  /** Signed change in indicator points, including negative tradeoffs. */
  readonly delta: number;
}

interface MeasureBase {
  readonly name: string;
  readonly category: Category;
  readonly cost: number;
  readonly lag: 1 | 2 | 3 | 4;
  readonly effects: readonly MeasureEffect[];
}

export type Measure = MeasureBase & (
  | { readonly id: DistrictMeasureId; readonly scope: 'district' }
  | { readonly id: CityMeasureId; readonly scope: 'city' }
);

/** One chosen measure. City-wide measures cannot have a district target. */
export type StrategySelection =
  | { readonly measureId: DistrictMeasureId; readonly districtId: DistrictId }
  | { readonly measureId: CityMeasureId; readonly districtId?: never };

/** Drafts can have any length; selection-count and budget rules need validation. */
export type Strategy = readonly StrategySelection[];

/** Bonus applies to the district targeted by districtMeasureId. */
export interface Synergy {
  readonly id: string;
  readonly districtMeasureId: DistrictMeasureId;
  readonly cityMeasureId: CityMeasureId;
  readonly effects: readonly MeasureEffect[];
}

export type Incompatibility =
  | { readonly id: string; readonly scope: 'anywhere'; readonly measureIds: readonly [MeasureId, MeasureId] }
  | { readonly id: string; readonly scope: 'same-district'; readonly measureIds: readonly [DistrictMeasureId, DistrictMeasureId] };

export interface DistrictSimulationResult {
  readonly districtId: DistrictId;
  readonly indicators: IndicatorValues;
  readonly weightedScore: number;
}

/** The shared result contract is the deterministic simulator's actual output. */
export type { SimulationResult } from '../lib/simulator.ts';

export type ValidationErrorCode =
  | 'INVALID_SELECTION_INPUT' | 'BUDGET_EXCEEDED' | 'INVALID_SELECTION_COUNT' | 'DUPLICATE_MEASURE'
  | 'CATEGORY_LIMIT_EXCEEDED' | 'INCOMPATIBLE_MEASURES'
  | 'UNKNOWN_MEASURE' | 'MISSING_DISTRICT' | 'INVALID_DISTRICT' | 'INVALID_TARGET';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  /** Diagnostics can contain submitted IDs that are not in the catalogue. */
  measureIds?: string[];
  districtId?: string;
  category?: Category;
}

export interface ValidationResult {
  valid: boolean;
  totalCost: number;
  remainingBudget: number;
  errors: ValidationError[];
}
