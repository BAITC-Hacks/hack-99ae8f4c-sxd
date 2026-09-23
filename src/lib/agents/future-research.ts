import { createOpenAISearch } from './openai-search.ts';
import { MEASURES } from '../../data/measures.ts';
import { DISTRICTS } from '../../data/districts.ts';
import { DEMO_FUTURE_FACTOR_CATALOG } from '../../data/long-term-assumptions.ts';
import { validateFutureFactors, validateOfficialSeed } from '../outlook.ts';
import { cleanSources, createSearch, deadline } from './future-search.ts';
import type { SimulationResult } from '../simulator.ts';
import type { FutureFactor, FutureResearchProvider, FutureResearchResult } from '../../types/outlook.ts';

/** Context is derived from the official selection, so callers cannot supply contradictory scope. */
export function researchContext(official: SimulationResult) {
  const selected = MEASURES.filter(m => official.selectedMeasures.some(s => s.measureId === m.id));
  const citywide = selected.some(m => m.scope === 'city');
  return {
    selectedStrategy: structuredClone(official.selectedMeasures),
    affectedCategories: [...new Set(selected.map(m => m.category))].sort(),
    affectedDistricts: DISTRICTS.filter(d => citywide || official.selectedMeasures.some(s => s.districtId === d.id)).map(d => d.id).sort(),
    affectedMetrics: [...new Set(selected.flatMap(m => m.effects.map(e => e.indicator)))],
  };
}
function relevant(official: SimulationResult) {
  const context = researchContext(official);
  return DEMO_FUTURE_FACTOR_CATALOG.filter(e => e.factor.id !== 'demo-transport-demand' || context.affectedCategories.includes('Transport'))
    .map(entry => ({ entry, rank: entry.factor.affectedMetrics.filter(m => context.affectedMetrics.includes(m)).length + (entry.categories.length ? 3 : 0) }))
    .sort((a, b) => b.rank - a.rank || a.entry.factor.id.localeCompare(b.entry.factor.id)).slice(0, 6).map(e => e.entry);
}
export const demoFutureResearchProvider: FutureResearchProvider = {
  id: 'configured-demo-factors-v1', mode: 'demo',
  async research() {
    return DEMO_FUTURE_FACTOR_CATALOG.slice(0, 6).map(({ factor }) => ({ ...factor, affectedMetrics: [...factor.affectedMetrics], sources: [] }));
  },
};

const topics: Record<string, RegExp> = {
  'population-demand': /population|demograph/i,
  'climate-pressure': /climate|warming|temperature/i,
  'water-stress': /water|drought/i,
  'transport-demand': /transport|traffic|mobility|trips/i,
  'infrastructure-aging': /infrastructure|aging|ageing|assets/i,
  'energy-utilities': /energy|electricity|utilities|heating/i,
  'urban-expansion': /urban|expansion|sprawl/i,
};
const trend = /grow|increas|declin|ris[eki]|pressure|stress|demand|project|chang|aging|ageing|shortage|expand|warming/i;
const forbiddenPrediction = /(?:\b[TESBC][12]\b|QoL|quality.of.life.score|score).{0,60}(?:\d)|(?:ignore|override).{0,30}instructions/i;

/** Extractive research: retrieved evidence is data, never executable instructions or metric forecasts. */
export function createLiveResearchProvider(search: (query: string) => Promise<unknown>, providerId = 'tavily-trend-evidence-v1'): FutureResearchProvider {
  return {
    id: providerId, mode: 'live',
    async research(official) {
      const context = researchContext(official);
      const outcomes = context.affectedMetrics.filter(metric => context.affectedDistricts.some(id =>
        official.indicatorsAfter[id][metric] < official.indicatorsBefore[id][metric]));
      const candidates = relevant(official).sort((a, b) =>
        b.factor.affectedMetrics.filter(m => outcomes.includes(m)).length - a.factor.affectedMetrics.filter(m => outcomes.includes(m)).length);
      const results = await Promise.allSettled(candidates.map(async ({ factor }) => {
        const id = factor.id.replace('demo-', '');
        const response = await search(`Astana Kazakhstan ${factor.name} long term trends pressure growth research ${context.affectedCategories.join(' ')} districts ${context.affectedDistricts.join(' ')}`);
        if (!response || typeof response !== 'object' || !Array.isArray((response as { results?: unknown }).results)) return;
        const evidence: { source: FutureFactor['sources'][number]; excerpt: string }[] = [];
        for (const row of (response as { results: unknown[] }).results.slice(0, 20)) {
          if (!row || typeof row !== 'object') continue;
          const item = row as Record<string, unknown>;
          const source = cleanSources([{ ...item, publishedAt: item.published_date }])[0];
          if (!source || typeof item.content !== 'string' || item.content.length > 30_000) continue;
          const sentence = item.content.replace(/<[^>]*>/g, '').split(/(?<=[.!?])\s+|\n/).find(text =>
            text.length >= 60 && text.length <= 900 && /Astana|Kazakhstan|Nur.Sultan/i.test(text)
            && topics[id]?.test(text) && trend.test(text) && !forbiddenPrediction.test(text));
          if (sentence && !evidence.some(e => e.source.url === source.url)) evidence.push({ source, excerpt: sentence.trim() });
          if (evidence.length === 3) break;
        }
        if (!evidence.length) return;
        return {
          ...factor, id: `research-${id}`, affectedMetrics: [...factor.affectedMetrics],
          confidence: evidence.length > 1 ? 0.65 : 0.45,
          rationale: `Retrieved trend evidence (national findings may not describe individual Astana districts): ${evidence.map((e, i) => `[${i + 1}] ${e.excerpt}`).join(' ')} Direction, strength and years are illustrative scenario assumptions, not source estimates or QoL predictions.`,
          sources: evidence.map(e => e.source),
        } satisfies FutureFactor;
      }));
      return results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    },
  };
}
let configured: { key: string; provider: FutureResearchProvider } | undefined;
function defaultProvider(): FutureResearchProvider | undefined {
  const adapter = process.env.FARSIGHT_RESEARCH_PROVIDER?.trim() || 'auto';
  if (adapter === 'demo' || process.env.FARSIGHT_AI_MODE === 'local') return;
  const tavily = process.env.TAVILY_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.FARSIGHT_RESEARCH_MODEL?.trim() || 'gpt-4.1-mini';
  const useTavily = adapter === 'tavily' || (adapter === 'auto' && !!tavily);
  const credential = useTavily ? tavily : ['auto', 'openai'].includes(adapter) ? openai : undefined;
  if (!credential || credential === 'your_api_key_here') return;
  const key = `${adapter}:${credential}:${model}`;
  if (!configured || configured.key !== key) configured = { key, provider: useTavily
    ? createLiveResearchProvider(createSearch(credential))
    : createLiveResearchProvider(createOpenAISearch(credential, model), 'openai-web-search-v1') };
  return configured.provider;
}

/** Optional boundary: all provider/network failures become explicit demo fallbacks. */
export async function getFutureFactors(
  officialResult: SimulationResult,
  provider: FutureResearchProvider | undefined = defaultProvider(),
  timeoutMs = 65_000,
): Promise<FutureResearchResult> {
  validateOfficialSeed(officialResult);
  let failed = false;
  if (provider) {
    try {
      if (!provider.id?.trim() || !['demo', 'live'].includes(provider.mode) || typeof provider.research !== 'function') throw new Error('Invalid provider');
      const raw = await deadline(() => provider.research(structuredClone(officialResult)), timeoutMs);
      if (!Array.isArray(raw) || raw.length > 30) throw new Error('Malformed factors');
      const seen = new Set<string>();
      const factors: FutureFactor[] = [];
      for (const entry of raw) {
        try {
          const factor = { ...entry, sources: provider.mode === 'live' ? cleanSources(entry.sources) : entry.sources };
          validateFutureFactors([factor]);
          if (seen.has(factor.id) || factor.rationale.length > 4000 || factor.name.length > 200 || factor.id.length > 100
            || forbiddenPrediction.test(factor.rationale) || (provider.mode === 'live' && !factor.sources.length)) continue;
          seen.add(factor.id);
          factors.push(factor);
        } catch { /* Reject malformed factors independently. */ }
      }
      if (provider.mode === 'live' && factors.length < 3 || !factors.length) throw new Error('Insufficient evidence');
      console.info('[Future Research]', { provider: provider.id, sourceMode: provider.mode, factors: factors.length });
      return {
        mode: provider.mode, sourceMode: provider.mode, status: 'success', provider: provider.id,
        notice: provider.mode === 'live'
          ? 'Live search evidence about external trends. National evidence is not district-specific. Strengths, directions, confidence and timing are heuristic scenario assumptions, not QoL forecasts.'
          : 'Demo factors only. Live web research is not connected; timings, strengths, and confidence values are illustrative assumptions. No research citations are claimed.',
        factors: structuredClone(factors.slice(0, 6)),
      };
    } catch { failed = true; console.warn('[Future Research]', { provider: provider.id, sourceMode: 'demo', reason: 'failed_or_insufficient_evidence' }); }
  }
  if (!provider) console.info('[Future Research]', { sourceMode: 'demo', reason: 'not_configured_or_disabled' });
  return {
    mode: 'demo', sourceMode: 'demo', status: 'fallback', provider: demoFutureResearchProvider.id,
    failure: { code: failed ? 'research_failed' : 'not_configured', message: failed ? 'Live research failed, timed out, or returned insufficient usable evidence.' : 'Live research is disabled or its selected provider credential is missing (OPENAI_API_KEY or TAVILY_API_KEY).' },
    notice: 'Demo factors only. Live web research is not connected or usable; timings, strengths, and confidence values are illustrative assumptions. No research citations are claimed.',
    factors: [...await demoFutureResearchProvider.research(structuredClone(officialResult))],
  };
}

