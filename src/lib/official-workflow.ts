import type { AnalysisResponse, SimulationResponse } from '../types/api.ts';
import type { Selection, SimulationResult } from './simulator.ts';
import type { AnalysisReport } from '../types/product.ts';

/** Publish numbers first. Explanation failure must never discard a successful simulation. */
export async function simulateWithAnalysis(options: {
  post: <T>(path: string, body: unknown) => Promise<T>;
  selectedMeasures: readonly Selection[];
  comparisonMeasures?: readonly Selection[];
  isCurrent: () => boolean;
  onResult: (result: SimulationResult) => void;
  onAnalysis: (analysis: AnalysisReport) => void;
  onAnalysisError: () => void;
}) {
  const { post, selectedMeasures, comparisonMeasures, isCurrent } = options;
  const { result } = await post<SimulationResponse>('/api/simulate', { selectedMeasures });
  if (!isCurrent()) return;
  options.onResult(result);
  try {
    const { analysis } = await post<AnalysisResponse>('/api/analyze', {
      selectedMeasures, ...(comparisonMeasures ? { comparisonMeasures } : {}),
    });
    if (isCurrent()) options.onAnalysis(analysis);
  } catch {
    if (isCurrent()) options.onAnalysisError();
  }
}
