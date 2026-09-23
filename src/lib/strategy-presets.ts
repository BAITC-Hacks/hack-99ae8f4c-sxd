import { STRATEGY_PRESETS } from '../data/strategy-presets.ts';
import type { StrategyPreset } from '../data/strategy-presets.ts';
import { DISTRICTS } from '../data/districts.ts';
import { INDICATOR_CODES } from '../data/rules.ts';
import type { IndicatorCode } from '../types/index.ts';
import { runOfficialSimulation } from './official.ts';
import { createManualStrategy } from './manual-strategy.ts';

export function createPresetStrategy(preset: StrategyPreset) {
  return { ...createManualStrategy(preset.selections, preset.name), description: preset.description };
}

export function evaluatePresets(presets: readonly StrategyPreset[] = STRATEGY_PRESETS) {
  return presets.map(preset => {
    const result = runOfficialSimulation(preset.selections);
    const indicators = Object.fromEntries(INDICATOR_CODES.map(code => [code,
      DISTRICTS.reduce((sum, district) => sum + district.populationShare * result.indicatorsAfter[district.id][code], 0),
    ])) as Record<IndicatorCode, number>;
    return { preset, result, indicators };
  });
}

/** Equal indicator weights: all ten indicators share the 0–100 scale. */
export function indicatorDistance(a: Record<IndicatorCode, number>, b: Record<IndicatorCode, number>) {
  return Math.sqrt(INDICATOR_CODES.reduce((sum, code) => sum + (a[code] - b[code]) ** 2, 0) / INDICATOR_CODES.length);
}

export function findMostDifferentPresets(evaluations = evaluatePresets()) {
  if (evaluations.length < 2) throw new Error('At least two scenarios are required.');
  let best = { first: evaluations[0], second: evaluations[1], distance: -1 };
  for (let i = 0; i < evaluations.length; i++) {
    for (let j = i + 1; j < evaluations.length; j++) {
      const distance = indicatorDistance(evaluations[i].indicators, evaluations[j].indicators);
      if (distance > best.distance) best = { first: evaluations[i], second: evaluations[j], distance };
    }
  }
  return best;
}
