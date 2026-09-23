import { DISTRICTS } from "../data/districts.ts";
import { MEASURES } from "../data/measures.ts";
import { INCOMPATIBILITIES } from "../data/interactions.ts";
import { STRATEGY_RULES } from "../data/rules.ts";
import type { Category, Measure, ValidationError, ValidationResult } from "../types/index.ts";

export type { ValidationErrorCode, ValidationError, ValidationResult } from "../types/index.ts";

/** Draft inputs may use unknown IDs; official selections are stricter in types/index.ts. */
export interface StrategySelection {
  readonly measureId: string;
  readonly districtId?: string;
}

const measureCatalog: ReadonlyMap<string, Measure> = new Map(MEASURES.map(measure => [measure.id, measure]));
const districtIds: ReadonlySet<string> = new Set(DISTRICTS.map(district => district.id));
const BUDGET = STRATEGY_RULES.budget;

/**
 * Validate selections without mutating them or calling external services.
 * Every recognized measure counts toward cost and category limits, including duplicates
 * and measures with invalid targets. Malformed entries are reported without throwing.
 * Unknown IDs are rejected and contribute no cost. remainingBudget may be negative.
 * District measures require a catalogue district ID; city measures cannot target a district.
 */
export function validateStrategy(selections: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const byId = new Map<string, StrategySelection[]>();
  const byCategory = new Map<Category, string[]>();
  let totalCost = 0;

  if (!Array.isArray(selections)) {
    return {
      valid: false, totalCost, remainingBudget: BUDGET,
      errors: [{ code: "INVALID_SELECTION_INPUT", message: "Strategy must be an array of measure selections." }],
    };
  }

  if (selections.length !== STRATEGY_RULES.requiredMeasureCount) {
    errors.push({
      code: "INVALID_SELECTION_COUNT",
      message: `Select exactly ${STRATEGY_RULES.requiredMeasureCount} measures; received ${selections.length}.`,
    });
  }

  for (const [index, selection] of selections.entries()) {
    if (!selection || typeof selection !== "object" || Array.isArray(selection)
      || typeof selection.measureId !== "string") {
      errors.push({
        code: "INVALID_SELECTION_INPUT",
        message: `Selection ${index + 1} must be an object with a measureId string.`,
      });
      continue;
    }
    const { measureId, districtId } = selection;
    // Retain only string targets for conflict detection; malformed targets are rejected below.
    const entry: StrategySelection = { measureId,
      ...(typeof districtId === "string" ? { districtId } : {}),
    };
    const entries = byId.get(measureId) ?? [];
    entries.push(entry);
    byId.set(measureId, entries);

    const measure = measureCatalog.get(measureId);
    if (!measure) {
      errors.push({
        code: "UNKNOWN_MEASURE",
        message: `Measure ${measureId} is not in the official catalogue.`,
        measureIds: [measureId],
      });
      continue;
    }

    totalCost += measure.cost;
    const categoryIds = byCategory.get(measure.category) ?? [];
    categoryIds.push(measureId);
    byCategory.set(measure.category, categoryIds);

    if (districtId !== undefined && typeof districtId !== "string") {
      errors.push({
        code: "INVALID_SELECTION_INPUT",
        message: `District target for measure ${measureId} must be a string when provided.`,
        measureIds: [measureId],
      });
    } else if (measure.scope === "district" && !districtId?.trim()) {
      errors.push({
        code: "MISSING_DISTRICT",
        message: `Select a district for measure ${measureId}.`,
        measureIds: [measureId],
      });
    } else if (measure.scope === "district" && !districtIds.has(districtId!)) {
      errors.push({
        code: "INVALID_DISTRICT",
        message: `District ${districtId} is not in the official catalogue.`,
        measureIds: [measureId], districtId,
      });
    } else if (measure.scope === "city" && districtId !== undefined) {
      errors.push({
        code: "INVALID_TARGET",
        message: `City-wide measure ${measureId} cannot target a district.`,
        measureIds: [measureId], districtId,
      });
    }
  }

  if (totalCost > BUDGET) {
    errors.push({
      code: "BUDGET_EXCEEDED",
      message: `Strategy cost ${totalCost} exceeds the budget of ${BUDGET} by ${totalCost - BUDGET}.`,
    });
  }

  for (const [measureId, entries] of byId) {
    if (entries.length > STRATEGY_RULES.maxSelectionsPerMeasure) {
      errors.push({
        code: "DUPLICATE_MEASURE",
        message: `Measure ${measureId} was selected ${entries.length} times. Each measure can be selected only once.`,
        measureIds: [measureId],
      });
    }
  }

  for (const [category, measureIds] of byCategory) {
    if (measureIds.length > STRATEGY_RULES.maxMeasuresPerCategory) {
      errors.push({
        code: "CATEGORY_LIMIT_EXCEEDED",
        message: `${category} contains ${measureIds.length} selected measures; at most ${STRATEGY_RULES.maxMeasuresPerCategory} are allowed.`,
        measureIds: [...measureIds],
      });
    }
  }

  for (const { measureIds: [firstId, secondId], scope } of INCOMPATIBILITIES) {
    if (scope === "anywhere") {
      if (byId.has(firstId) && byId.has(secondId)) errors.push({
        code: "INCOMPATIBLE_MEASURES",
        message: `Measures ${firstId} and ${secondId} are incompatible across the city.`,
        measureIds: [firstId, secondId],
      });
      continue;
    }
    const secondDistricts = new Set((byId.get(secondId) ?? []).map(s => s.districtId));
    const reportedDistricts = new Set<string>();
    for (const { districtId } of byId.get(firstId) ?? []) {
      if (districtId?.trim() && secondDistricts.has(districtId) && !reportedDistricts.has(districtId)) {
        reportedDistricts.add(districtId);
        errors.push({
          code: "INCOMPATIBLE_MEASURES",
          message: `Measures ${firstId} and ${secondId} cannot both target ${districtId}.`,
          measureIds: [firstId, secondId],
          districtId,
        });
      }
    }
  }

  return { valid: errors.length === 0, totalCost, remainingBudget: BUDGET - totalCost, errors };
}
