import { runOfficialSimulation } from '../../../lib/official.ts';
import { getFutureFactors } from '../../../lib/agents/future-research.ts';
import { runLongTermScenario } from '../../../lib/outlook.ts';
import { analyzeOutlook } from '../../../lib/agents/analysis.ts';
import { apiError, readBody, readSelections } from '../../../lib/api.ts';
import type { OutlookResponse } from '../../../types/product';
import type { FutureFactor } from '../../../types/outlook';
import { logStage, traceStage, withDeadline } from '../../../lib/integration.ts';

function factorDefinition(factor: FutureFactor): string {
  return JSON.stringify([
    factor.name, factor.direction, factor.strength, factor.confidence,
    factor.startYear, factor.endYear, [...factor.affectedMetrics].sort(), factor.rationale,
    factor.sources.map(source => [source.title, source.url]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBody(request);
    const selections = readSelections(body.selectedMeasures);
    const official = runOfficialSimulation(selections);
    const comparison = body.comparisonMeasures === undefined ? undefined : runOfficialSimulation(readSelections(body.comparisonMeasures));
    // Both strategies face the same research factors and assumptions for a fair comparison.
    const [research, otherResearch] = await traceStage('future_research', () => withDeadline(Promise.all([
      getFutureFactors(official),
      comparison ? getFutureFactors(comparison) : undefined,
    ]), 70_000));
    if (research.mode === 'demo' || otherResearch?.mode === 'demo') logStage('future_research', 'fallback');
    if (otherResearch) {
      if (research.mode !== otherResearch.mode || research.provider !== otherResearch.provider) {
        throw new Error('Compared scenarios require the same research provenance.');
      }
      const factors = new Map(research.factors.map(factor => [factor.id, factor]));
      for (const factor of otherResearch.factors) {
        const existing = factors.get(factor.id);
        // Never let comparison order silently choose a different external assumption.
        if (existing && factorDefinition(existing) !== factorDefinition(factor)) {
          throw new Error(`Conflicting research definitions for factor ${factor.id}.`);
        }
        factors.set(factor.id, factor);
      }
      research.factors = [...factors.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
    const scenario = await traceStage('future_outlook', () => runLongTermScenario(official, research.factors));
    const comparisonScenario = comparison ? await traceStage('future_outlook', () => runLongTermScenario(comparison, research.factors)) : undefined;
    const response: OutlookResponse = { research, scenario, comparisonScenario, analysis: analyzeOutlook(scenario, comparisonScenario) };
    return Response.json(response);
  } catch (error) { return apiError(error); }
}
