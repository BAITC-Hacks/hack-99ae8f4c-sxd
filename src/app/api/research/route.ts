import { getFutureFactors } from '../../../lib/agents/future-research.ts';
import { validateOfficialSeed } from '../../../lib/outlook.ts';
import { apiError, readBody, RequestError } from '../../../lib/api.ts';
import type { SimulationResult } from '../../../lib/simulator.ts';
import { logStage, traceStage, withDeadline } from '../../../lib/integration.ts';

export const runtime = 'nodejs';
/** Accepts the completed official result; never runs or modifies the official simulator. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBody(request);
    const official = body.officialResult as SimulationResult;
    try { validateOfficialSeed(official); } catch { throw new RequestError('A valid completed officialResult is required.'); }
    const research = await traceStage('future_research', () => withDeadline(getFutureFactors(official), 70_000));
    if (research.mode === 'demo') logStage('future_research', 'fallback');
    return Response.json(research, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
