import { answerOfficialQuestion } from '../../../lib/agents/answer.ts';
import { runOfficialSimulation } from '../../../lib/official.ts';
import { analyzeOfficialResult, prioritizeAnalysis } from '../../../lib/agents/analysis.ts';
import { apiError, readBody, readSelections, readText } from '../../../lib/api.ts';
import { traceStage } from '../../../lib/integration.ts';
import type { AnalysisResponse } from '../../../types/api';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBody(request);
    // Recompute from validated selections. Never trust client-supplied scores.
    const result = runOfficialSimulation(readSelections(body.selectedMeasures));
    const other = body.comparisonMeasures === undefined ? undefined : runOfficialSimulation(readSelections(body.comparisonMeasures));
    const question = readText(body.question, 'question', false);
    const response: AnalysisResponse = { analysis: await traceStage('analysis', () => question ? answerOfficialQuestion(result, analyzeOfficialResult(result, other), question, other) : prioritizeAnalysis(analyzeOfficialResult(result, other))) };
    return Response.json(response);
  } catch (error) { return apiError(error); }
}
