import { OfficialStrategyValidationError, runOfficialSimulation } from '../../../lib/official.ts';
import { apiError, readBody, readSelections } from '../../../lib/api.ts';
import { validateStrategy } from '../../../lib/validator.ts';
import type { SimulationResponse } from '../../../types/api';
import { traceStage } from '../../../lib/integration.ts';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBody(request);
    const selections = readSelections(body.selectedMeasures);
    const validation = await traceStage('validation', () => {
      const checked = validateStrategy(selections);
      if (!checked.valid) throw new OfficialStrategyValidationError(checked);
      return checked;
    });
    const result = await traceStage('official_simulation', () => runOfficialSimulation(selections));
    const response: SimulationResponse = { validation, result };
    return Response.json(response);
  } catch (error) { return apiError(error); }
}
