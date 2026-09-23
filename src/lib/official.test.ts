import assert from "node:assert/strict";
import { test } from "node:test";
import { OFFICIAL_DATASET, OfficialStrategyValidationError, runOfficialSimulation } from "./official.ts";
import { HORIZON_QUARTERS } from "./simulator.ts";
import type { Selection } from "./simulator.ts";
import type { ValidationErrorCode } from "./validator.ts";
import { DISTRICTS } from "../data/districts.ts";
import { MEASURES } from "../data/measures.ts";
import { INCOMPATIBILITIES, SYNERGIES } from "../data/interactions.ts";
import { INDICATOR_CODES, INDICATOR_WEIGHTS, STRATEGY_RULES } from "../data/rules.ts";

const reference: readonly Selection[] = Object.freeze([
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12" },
  { measureId: "M5", districtId: "saryarka" },
].map(selection => Object.freeze(selection)));

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test("official catalogue has five districts, ten indicators and fourteen unique measures", () => {
  assert.deepEqual(DISTRICTS.map(district => district.id), ["esil", "almaty", "saryarka", "baikonur", "nura"]);
  assert.deepEqual(DISTRICTS.map(district => district.populationShare), [0.27, 0.24, 0.20, 0.13, 0.16]);
  close(DISTRICTS.reduce((sum, district) => sum + district.populationShare, 0), 1);
  assert.deepEqual(INDICATOR_CODES, ["T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2"]);
  assert.deepEqual(INDICATOR_WEIGHTS, {
    T1: 0.10, T2: 0.10, E1: 0.09, E2: 0.11, S1: 0.11,
    S2: 0.11, B1: 0.09, B2: 0.09, C1: 0.10, C2: 0.10,
  });
  close(Object.values(INDICATOR_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
  assert.deepEqual(STRATEGY_RULES, {
    budget: 100, requiredMeasureCount: 5, maxSelectionsPerMeasure: 1, maxMeasuresPerCategory: 2,
  });
  assert.deepEqual(MEASURES.map(measure => measure.id), Array.from({ length: 14 }, (_, index) => `M${index + 1}`));
  assert.deepEqual(MEASURES.filter(measure => measure.scope === "city").map(measure => measure.id), ["M2", "M6", "M12", "M14"]);
  for (const district of DISTRICTS) {
    assert.deepEqual(Object.keys(district.initialIndicators).sort(), [...INDICATOR_CODES].sort());
    assert.ok(Object.values(district.initialIndicators).every(value => Number.isFinite(value) && value >= 0 && value <= 100));
  }
  for (const measure of MEASURES) {
    assert.ok(Number.isInteger(measure.cost) && measure.cost > 0);
    assert.ok(Number.isInteger(measure.lag) && measure.lag >= 1 && measure.lag <= 4);
    assert.equal(new Set(measure.effects.map(effect => effect.indicator)).size, measure.effects.length);
  }
  assert.deepEqual(INCOMPATIBILITIES.map(rule => [rule.measureIds, rule.scope]), [
    [["M1", "M3"], "anywhere"], [["M4", "M7"], "same-district"], [["M5", "M13"], "same-district"],
  ]);
  assert.deepEqual(SYNERGIES.map(rule => [rule.districtMeasureId, rule.cityMeasureId, rule.effects]), [
    ["M1", "M2", [{ indicator: "T1", delta: 2 }]],
    ["M10", "M12", [{ indicator: "B1", delta: 2 }]],
    ["M5", "M6", [{ indicator: "E2", delta: 2 }]],
  ]);
});

test("bundled official reference strategy: exact baseline and score, eight quarters, cost 95", () => {
  const result = runOfficialSimulation(reference);
  assert.equal(HORIZON_QUARTERS, 8);
  close(result.baselineScore, 52.55768);
  close(result.finalScore, 56.54307);
  close(result.scoreDelta, 3.98539);
  close(result.baseline.cityAverage, 56.8624);
  close(result.baseline.minimumDistrictScore, 49.18);
  close(result.final.cityAverage, 58.0776);
  close(result.final.minimumDistrictScore, 52.9625);
  const expectedDistricts = {
    esil: [62.99, 63.4275], almaty: [57.06, 57.4975], saryarka: [54.65, 56.3],
    baikonur: [56.63, 57.0675], nura: [49.18, 52.9625],
  };
  for (const [districtId, [before, after]] of Object.entries(expectedDistricts)) {
    close(result.districtScoresBefore[districtId], before);
    close(result.districtScoresAfter[districtId], after);
  }
  assert.equal(result.totalCost, 95);
  assert.equal(result.remainingBudget, 5);
  assert.equal(result.baseline.criticalCount, 2);
  assert.equal(result.final.criticalCount, 0);
  // Schools and clinics realize 5/8 of their full effect after implementation lag.
  assert.equal(result.indicatorsAfter.nura.S1, 48);
  assert.equal(result.indicatorsAfter.nura.S2, 43.75);
  assert.equal(result.indicatorsAfter.nura.B1, 67.5);
  assert.equal(result.indicatorsAfter.saryarka.E2, 48.75);
  // City-wide service improvement reaches each district exactly once.
  for (const district of OFFICIAL_DATASET.districts) {
    assert.equal(result.indicatorDeltas[district.id].C2, 4.375);
  }
  assert.deepEqual(result.activatedSynergies, [{
    measures: ["M10", "M12"], districtId: "nura", indicator: "B1", bonus: 2, appliedBonus: 2,
  }]);
  close(result.finalScore, 0.7 * result.final.cityAverage
    + 0.3 * result.final.minimumDistrictScore - result.final.criticalCount);
});

test("official entry point rejects every rule violation before simulation", () => {
  const cases: [readonly Selection[], ValidationErrorCode][] = [
    [reference.slice(1), "INVALID_SELECTION_COUNT"],
    [[...reference, { measureId: "M11", districtId: "esil" }], "INVALID_SELECTION_COUNT"],
    [[{ measureId: "M3", districtId: "nura" }, ...reference.slice(1)], "BUDGET_EXCEEDED"],
    [[{ measureId: "M8", districtId: "esil" }, ...reference.slice(1)], "DUPLICATE_MEASURE"],
    [[{ measureId: "M9", districtId: "esil" }, ...reference.slice(0, 4)], "CATEGORY_LIMIT_EXCEEDED"],
    [[{ measureId: "M7", districtId: "unknown" }, ...reference.slice(1)], "INVALID_DISTRICT"],
    [[{ measureId: "M7" }, ...reference.slice(1)], "MISSING_DISTRICT"],
    [[...reference.slice(0, 3), { measureId: "M12", districtId: "nura" }, reference[4]], "INVALID_TARGET"],
    [[{ measureId: "M99" }, ...reference.slice(1)], "UNKNOWN_MEASURE"],
    [[{ measureId: "M1", districtId: "nura" }, { measureId: "M3", districtId: "esil" },
      ...reference.slice(2)], "INCOMPATIBLE_MEASURES"],
    [[...reference.slice(0, 4), { measureId: "M4", districtId: "nura" }], "INCOMPATIBLE_MEASURES"],
  ];
  for (const [strategy, code] of cases) {
    assert.throws(() => runOfficialSimulation(strategy), (error: unknown) => {
      assert.ok(error instanceof OfficialStrategyValidationError);
      assert.equal(error.validation.valid, false);
      assert.ok(error.validation.errors.some(issue => issue.code === code), `Missing ${code}`);
      return true;
    });
  }
});

test("official results are deterministic, order-independent and cannot mutate the catalogue", () => {
  assert.ok(Object.isFrozen(OFFICIAL_DATASET));
  assert.ok(Object.isFrozen(OFFICIAL_DATASET.districts[0].indicators));
  assert.ok(Object.isFrozen(OFFICIAL_DATASET.measures[0].fullEffect));
  const before = structuredClone(OFFICIAL_DATASET);
  const result = runOfficialSimulation(reference);
  assert.deepEqual(result, runOfficialSimulation([...reference].reverse()));
  assert.deepEqual(result, runOfficialSimulation(reference));
  result.indicatorsAfter.nura = result.indicatorsAfter.esil;
  result.selectedMeasures[0] = { measureId: "changed" };
  assert.deepEqual(OFFICIAL_DATASET, before);
  assert.equal(runOfficialSimulation(reference).indicatorsAfter.nura.S1, 48);
});

test("official measure contributions account for lost synergies and negative trade-offs", () => {
  const result = runOfficialSimulation([
    { measureId: "M1", districtId: "nura" }, { measureId: "M2" },
    { measureId: "M11", districtId: "nura" }, { measureId: "M12" },
    { measureId: "M9", districtId: "nura" },
  ]);
  const crossing = result.contributions.find(item => item.selection.measureId === "M11")!;
  assert.equal(crossing.realizedEffects.nura.T1, -1.75);
  assert.equal(crossing.realizedEffects.nura.B2, 10.5);
  assert.equal(result.activatedSynergies[0].districtId, "nura");
  assert.equal(result.indicatorDeltas.nura.T1, 4.5 + 3 - 1.75 + 2);
  assert.equal(result.indicatorDeltas.esil.T1, 3);
  assert.equal(result.contributions.length, 5);
});
