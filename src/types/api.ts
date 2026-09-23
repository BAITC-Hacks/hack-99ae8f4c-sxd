import type { Selection, SimulationResult } from '../lib/simulator';
import type { ValidationResult } from '../lib/validator';
import type { AnalysisReport } from './product';

export interface AnalysisRequest extends SimulationRequest {
  readonly comparisonMeasures?: readonly Selection[];
  readonly question?: string;
}
export interface AnalysisResponse { readonly analysis: AnalysisReport }
export interface OutlookRequest extends SimulationRequest { readonly comparisonMeasures?: readonly Selection[] }
export interface StrategyRequest { readonly intent: string; readonly compareWith?: string }

/** Client input is still parsed and validated at the HTTP boundary. */
export interface SimulationRequest {
  readonly selectedMeasures: readonly Selection[];
}

/** Successful official eight-quarter simulation response. */
export interface SimulationResponse {
  readonly validation: ValidationResult;
  readonly result: SimulationResult;
}

/** Rule violations include validation; malformed requests only include an error. */
export interface SimulationErrorResponse {
  readonly error: string;
  readonly validation?: ValidationResult;
}
