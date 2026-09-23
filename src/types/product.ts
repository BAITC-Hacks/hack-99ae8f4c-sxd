import type { Category, DistrictId, IndicatorCode, Strategy } from './index';
import type { SimulationResult } from '../lib/simulator';
import type { LongTermScenario, FutureResearchResult } from './outlook';

export interface StrategyPriority { category: Category; weight: number; rationale: string }
export interface GeneratedStrategy {
  id: string;
  name: string;
  description: string;
  priorities: StrategyPriority[];
  selectedMeasures: Strategy;
  targetedDistricts: DistrictId[];
  totalBudget: number;
  generation: { mode: 'model' | 'local' | 'manual'; repaired: boolean; note: string };
}
export interface StrategyResponse { strategyA: GeneratedStrategy; strategyB?: GeneratedStrategy }
export type CopilotResponse = { kind: 'answer'; message: string } | ({ kind: 'strategy' } & StrategyResponse);
export interface StrategyComparison {
  strategyA: GeneratedStrategy;
  strategyB: GeneratedStrategy;
  officialResultsA: SimulationResult;
  officialResultsB: SimulationResult;
  longTermScenarioA?: LongTermScenario;
  longTermScenarioB?: LongTermScenario;
}
export interface AnalysisSection { title: string; body: string }
export interface AnalysisReport {
  mode: 'calculated';
  title: string;
  summary: string;
  answer?: string;
  sections: AnalysisSection[];
  improvements: string[];
}
export interface OutlookResponse {
  research: FutureResearchResult;
  scenario: LongTermScenario;
  analysis: AnalysisReport;
  comparisonScenario?: LongTermScenario;
}
export interface MetricChange { districtId: DistrictId; indicator: IndicatorCode; delta: number }
