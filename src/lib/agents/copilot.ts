import { STRATEGY_RULES } from '../../data/rules.ts';
import { generateStrategies } from './strategy.ts';
import type { CopilotResponse } from '../../types/product.ts';
import type { Selection } from '../simulator.ts';
import { runOfficialSimulation } from '../official.ts';
import { analyzeOfficialResult, prioritizeAnalysis } from './analysis.ts';

/** Questions must not replace the workspace portfolio or discard calculated results. */
export async function respondToCopilot(message: string, selections?: Selection[], comparison?: Selection[]): Promise<CopilotResponse> {
  const text = message.trim();
  const russian = /[а-яё]/i.test(text);
  const action = /^(?:(?:can|could|would)\s+you\s+|please\s+)?(?:create|generate|build|design|compare|prioriti[sz]e|focus)\b/i.test(text) ||
    /^(?:(?:можешь|можете)\s+)?(?:создай|создайте|составь|составьте|сравни|сравните|разработай)(?:\s|$)/i.test(text);
  const question = /\?|\b(?:why|explain|explaim|baseline)\b|почему|объясн/i.test(text) || /^(?:can|could|may|should|would|what|why|how|which|when|where|is|are|do|does|tell\s+me|explain|help)\b/i.test(text) ||
    /^(?:можно|могу|можешь|можете|как|что|почему|какие|какую|зачем|объясни|расскажи|помоги)(?:\s|$)/i.test(text);
  const greeting = /^(?:hi|hello|hey|thanks|thank you|привет|здравствуйте|спасибо)[!.\s]*$/i.test(text);
  if (!action && (question || greeting)) {
    if (question && selections) {
      const report = await prioritizeAnalysis(analyzeOfficialResult(runOfficialSimulation(selections), comparison ? runOfficialSimulation(comparison) : undefined), text);
      return { kind: 'answer', message: report.answer || [report.summary, ...report.sections.slice(0, 3).map(section => `${section.title}: ${section.body}`)].join('\n\n') };
    }
    const rules = russian
      ? `Стратегия включает ${STRATEGY_RULES.requiredMeasureCount} мер из доступного каталога, бюджет — не более ${STRATEGY_RULES.budget}, максимум ${STRATEGY_RULES.maxMeasuresPerCategory} меры на категорию. Произвольные меры вне каталога пока не поддерживаются.`
      : `Each strategy uses ${STRATEGY_RULES.requiredMeasureCount} measures from the available catalog, with a budget of at most ${STRATEGY_RULES.budget} and at most ${STRATEGY_RULES.maxMeasuresPerCategory} measures per category. Custom measures outside the catalog are not supported yet.`;
    const capability = /\b(?:can|could|may)\s+i\b|могу\s+я|можно\s+(?:ли\s+)?(?:мне|описать)/i.test(text);
    const simulation = /simulat|score|result|baseline|симуляц|результат|балл/i.test(text);
    const introduction = simulation
      ? russian
        ? 'После проверки мер запустите Official 2-Year Simulation. Она рассчитывает результат за два года; затем можно выбрать Ask about result и задать вопрос о нём.'
        : 'Review the selected measures, then run the Official 2-Year Simulation to calculate the two-year result. Afterward, choose Ask about result to ask about the calculated outcome.'
      : russian
        ? `${capability ? 'Да, вы можете описать своими словами приоритеты развития Астаны.' : 'Я помогу составить или сравнить стратегии развития Астаны.'} Укажите важные направления и районы, например: «Создай стратегию улучшения транспорта в Нуре».`
        : `${capability ? 'Yes, you can describe your own priorities for Astana in your own words.' : 'I can help create or compare urban development strategies for Astana.'} Describe your priorities and districts, for example: “Create a strategy focused on transport in Nura.”`;
    return { kind: 'answer', message: `${introduction} ${rules}` };
  }
  const comparisonRequest = text.match(/^compare\s+(.+?)\s+(?:with|against|to)\s+(.+?)\s*$/i);
  const strategies = await generateStrategies(comparisonRequest ? comparisonRequest[1] : text, comparisonRequest?.[2]);
  return { kind: 'strategy', ...strategies };
}
