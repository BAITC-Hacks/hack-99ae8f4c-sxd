import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "../data/districts.ts";
import { MEASURES } from "../data/measures.ts";
import { INDICATOR_CODES } from "../data/rules.ts";
import { OFFICIAL_DATASET, OfficialStrategyValidationError, runOfficialSimulation } from "./official.ts";
import { simulateStrategy } from "./simulator.ts";
import type { Selection } from "./simulator.ts";

// Independently transcribed from the supplied district dataset PDF, pages 1–3.
const districtRows = [
  [45, 62, 68, 72, 48, 55, 78, 60, 75, 70],
  [40, 75, 50, 55, 60, 65, 62, 52, 50, 60],
  [50, 70, 42, 40, 62, 68, 58, 55, 45, 55],
  [52, 68, 55, 50, 58, 60, 52, 58, 55, 58],
  [55, 40, 45, 65, 38, 35, 55, 50, 60, 50],
];
const measureRows = [
  ["M1", "Transport", "district", 18, 2, { T1: 6, T2: 9 }],
  ["M2", "Transport", "city", 22, 2, { T1: 4, B2: 3 }],
  ["M3", "Transport", "district", 30, 4, { T1: 16, T2: 20, E2: 4 }],
  ["M4", "Ecology", "district", 15, 2, { E1: 12, E2: 3, B1: 2 }],
  ["M5", "Ecology", "district", 25, 3, { E2: 14, C1: 4 }],
  ["M6", "Ecology", "city", 20, 4, { E1: 5, E2: 3 }],
  ["M7", "Social", "district", 24, 3, { S1: 16 }],
  ["M8", "Social", "district", 20, 3, { S2: 14 }],
  ["M9", "Social", "district", 10, 1, { S1: 3, S2: 3, B1: 3 }],
  ["M10", "Safety", "district", 12, 1, { B1: 12, B2: 2 }],
  ["M11", "Safety", "district", 10, 1, { B2: 12, T1: -2 }],
  ["M12", "Services", "city", 14, 1, { C2: 5 }],
  ["M13", "Services", "district", 28, 4, { C1: 18, E2: 2 }],
  ["M14", "Services", "city", 16, 1, { C1: 5, C2: 2 }],
] as const;

test("all 50 initial cells and all 14 measure records match the supplied PDF", () => {
  assert.deepEqual(DISTRICTS.map(d => INDICATOR_CODES.map(k => d.initialIndicators[k])), districtRows);
  assert.deepEqual(MEASURES.map(m => [m.id, m.category, m.scope, m.cost, m.lag,
    Object.fromEntries(m.effects.map(e => [e.indicator, e.delta]))]), measureRows);
});

for (const [id, , scope, cost, lag, effects] of measureRows) {
  test(`${id}: official effects, lag, scope and one-time cost`, () => {
    // Isolate each measure in the shared two-year engine; official admission requires five.
    const result = simulateStrategy([{ measureId: id, ...(scope === "district" ? { districtId: "nura" } : {}) }], OFFICIAL_DATASET);
    for (const district of DISTRICTS) {
      for (const key of INDICATOR_CODES) {
        const effect = (effects as Partial<Record<typeof key, number>>)[key] ?? 0;
        const expected = scope === "city" || district.id === "nura" ? effect * (8 - lag) / 8 : 0;
        assert.equal(result.indicatorDeltas[district.id][key], expected);
      }
    }
    assert.equal(result.totalCost, cost);
    assert.equal(result.remainingBudget, 100 - cost);
    assert.deepEqual(result.activatedSynergies, []);
  });
}

for (const [first, second, key, expected, fillers] of [
  ["M1", "M2", "T1", 9.5, [{ measureId: "M9", districtId: "esil" }, { measureId: "M10", districtId: "esil" }, { measureId: "M14" }]],
  ["M10", "M12", "B1", 12.5, [{ measureId: "M9", districtId: "esil" }, { measureId: "M4", districtId: "esil" }, { measureId: "M14" }]],
  ["M5", "M6", "E2", 12.25, [{ measureId: "M9", districtId: "esil" }, { measureId: "M11", districtId: "esil" }, { measureId: "M14" }]],
] as const) {
  test(`${first}+${second}: fixed synergy at the official entry point`, () => {
    const result = runOfficialSimulation([{ measureId: first, districtId: "nura" }, { measureId: second }, ...fillers]);
    assert.equal(result.indicatorDeltas.nura[key], expected);
    assert.deepEqual(result.activatedSynergies, [{ measures: [first, second], districtId: "nura", indicator: key, bonus: 2, appliedBonus: 2 }]);
  });
}

for (const [first, second] of [["M1", "M3"], ["M4", "M7"], ["M5", "M13"]]) {
  test(`${first}+${second}: official rejection and district applicability`, () => {
    for (const target of ["nura", "esil"]) {
      const selections: Selection[] = [{ measureId: first, districtId: "nura" }, { measureId: second, districtId: target },
        { measureId: "M9", districtId: "nura" }, { measureId: "M10", districtId: "nura" }, { measureId: "M12" }];
      for (const input of [selections, [...selections].reverse()]) {
        if (first === "M1" || target === "nura") {
          assert.throws(() => runOfficialSimulation(input), (error: unknown) => {
            assert.ok(error instanceof OfficialStrategyValidationError);
            assert.deepEqual(error.validation.errors.map(e => e.code), ["INCOMPATIBLE_MEASURES"]);
            return true;
          });
        } else assert.equal(runOfficialSimulation(input).selectedMeasures.length, 5);
      }
    }
  });
}
