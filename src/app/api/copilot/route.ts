import { respondToCopilot } from '../../../lib/agents/copilot.ts';
import { apiError, readBody, readText, readSelections } from '../../../lib/api.ts';
import { logStage, traceStage } from '../../../lib/integration.ts';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBody(request);
    const message = readText(body.message, 'message')!;
    const selections = body.selectedMeasures === undefined ? undefined : readSelections(body.selectedMeasures);
    const comparison = body.comparisonMeasures === undefined ? undefined : readSelections(body.comparisonMeasures);
    const result = await traceStage('strategy_generation', () => respondToCopilot(message, selections, comparison));
    if (result.kind === 'strategy' && (result.strategyA.generation.mode === 'local' || result.strategyB?.generation.mode === 'local')) logStage('strategy_generation', 'fallback');
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
