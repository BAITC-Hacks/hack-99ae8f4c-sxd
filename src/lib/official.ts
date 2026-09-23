import { DISTRICTS } from "../data/districts.ts";
import { MEASURES } from "../data/measures.ts";
import { STRATEGY_RULES } from "../data/rules.ts";
import { deepFreeze } from "../data/immutable.ts";
import { simulateStrategy } from "./simulator.ts";
import type { Selection, SimulationDataset, SimulationResult } from "./simulator.ts";
import { validateStrategy } from "./validator.ts";
import type { ValidationResult } from "./validator.ts";

/** Adapt the shared catalogue once; all official calculations use this immutable dataset. */
export const OFFICIAL_DATASET: SimulationDataset = deepFreeze({
  budget: STRATEGY_RULES.budget,
  districts: DISTRICTS.map(district => ({
    id: district.id,
    populationShare: district.populationShare,
    indicators: district.initialIndicators,
  })),
  measures: MEASURES.map(measure => ({
    id: measure.id,
    scope: measure.scope,
    cost: measure.cost,
    lag: measure.lag,
    fullEffect: Object.fromEntries(measure.effects.map(effect => [effect.indicator, effect.delta])),
  })),
});

export class OfficialStrategyValidationError extends Error {
  readonly validation: ValidationResult;

  constructor(validation: ValidationResult) {
    super(validation.errors.map(error => error.message).join(" "));
    this.name = "OfficialStrategyValidationError";
    this.validation = validation;
  }
}

/** Official HackAlem entry point: admissible strategy, fixed budget 100, H = 8 quarters. */
export function runOfficialSimulation(selections: readonly Selection[]): SimulationResult {
  const validation = validateStrategy(selections);
  if (!validation.valid) throw new OfficialStrategyValidationError(validation);
  return simulateStrategy(selections, OFFICIAL_DATASET);
}
