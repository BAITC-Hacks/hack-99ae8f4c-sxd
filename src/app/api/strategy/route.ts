import { generateStrategies } from '../../../lib/agents/strategy.ts';
import { apiError, readBody, readText } from '../../../lib/api.ts';
import { logStage, traceStage } from '../../../lib/integration.ts';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBody(request);
    const intent = readText(body.intent, 'intent')!;
    const comparison = readText(body.compareWith, 'compareWith', false);
    const result = await traceStage('strategy_generation', () => generateStrategies(intent, comparison));
    if (result.strategyA.generation.mode === 'local' || result.strategyB?.generation.mode === 'local') logStage('strategy_generation', 'fallback');
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
