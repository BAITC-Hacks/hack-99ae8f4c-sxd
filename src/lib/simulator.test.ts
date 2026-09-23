import { test } from "node:test";
import assert from "node:assert/strict";
import { INDICATORS, scoreCity, scoreDistrict } from "./scoring.ts";
import type { Indicator, Indicators } from "./scoring.ts";
import { simulateStrategy } from "./simulator.ts";
import type { Measure, SimulationDataset } from "./simulator.ts";

// Synthetic fixtures exercise the model rules; they are NOT hackathon data.
function indicators(value = 50, overrides: Partial<Indicators> = {}): Indicators {
  return { ...Object.fromEntries(INDICATORS.map(key => [key, value])), ...overrides } as Indicators;
}

function dataset(measures: Measure[] = []): SimulationDataset {
  return {
    budget: 100,
    districts: [
      { id: "Nura", populationShare: 0.25, indicators: indicators() },
      { id: "Saryarka", populationShare: 0.75, indicators: indicators(60) },
    ],
    measures,
  };
}

function measure(id: string, overrides: Partial<Measure> = {}): Measure {
  return { id, scope: "district", cost: 10, lag: 0, fullEffect: {}, ...overrides };
}

function close(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test("weights, population average, minimum, and strictly-below-40 penalties", () => {
  const city = scoreCity([
    { id: "A", populationShare: 0.25, indicators: indicators(40, { T1: 39 }) },
    { id: "B", populationShare: 0.75, indicators: indicators(60) },
  ]);
  close(city.districtScores.A, 39.9);
  close(city.districtScores.B, 60);
  close(city.cityAverage, 54.975);
  assert.equal(city.criticalCount, 1);
  close(city.score, 49.4525);
  for (const key of INDICATORS) {
    const expected: Record<Indicator, number> = {
      T1: 10, T2: 10, E1: 9, E2: 11, S1: 11, S2: 11, B1: 9, B2: 9, C1: 10, C2: 10,
    };
    close(scoreDistrict(indicators(0, { [key]: 100 })), expected[key]);
  }
});

test("empty strategy preserves baseline and budget", () => {
  const result = simulateStrategy([], dataset());
  close(result.baselineScore, 55.25);
  assert.equal(result.finalScore, result.baselineScore);
  assert.equal(result.scoreDelta, 0);
  assert.equal(result.totalCost, 0);
  assert.equal(result.remainingBudget, 100);
  assert.deepEqual(result.indicatorsBefore, result.indicatorsAfter);
  assert.deepEqual(result.activatedSynergies, []);
});

test("all lags 0..8 scale positive and negative local effects", () => {
  for (let lag = 0; lag <= 8; lag++) {
    const result = simulateStrategy([{ measureId: "X", districtId: "Nura" }], dataset([
      measure("X", { lag, fullEffect: { T1: 16, E2: -8 } }),
    ]));
    assert.equal(result.indicatorsAfter.Nura.T1, 50 + 2 * (8 - lag));
    assert.equal(result.indicatorsAfter.Nura.E2, 50 - (8 - lag));
    assert.deepEqual(result.indicatorsAfter.Saryarka, result.indicatorsBefore.Saryarka);
    assert.equal(result.indicatorDeltas.Nura.T1, 2 * (8 - lag));
    assert.equal(result.contributions[0].realizedEffects.Nura.E2, -(8 - lag));
  }
});

test("city-wide effects reach every district and cost is charged once", () => {
  const result = simulateStrategy([{ measureId: "M12" }], dataset([
    measure("M12", { scope: "city", lag: 2, cost: 25, fullEffect: { B1: 8 } }),
  ]));
  assert.equal(result.indicatorsAfter.Nura.B1, 56);
  assert.equal(result.indicatorsAfter.Saryarka.B1, 66);
  assert.equal(result.totalCost, 25);
  assert.equal(result.remainingBudget, 75);
});

test("each synergy applies a fixed +2 to the anchor district even at lag 8", () => {
  for (const [anchor, partner, key] of [
    ["M1", "M2", "T1"], ["M10", "M12", "B1"], ["M5", "M6", "E2"],
  ] as const) {
    const data = dataset([
      measure(anchor, { lag: 8, fullEffect: { [key]: 100 } }),
      measure(partner, { scope: "city", lag: 8, fullEffect: { [key]: 100 } }),
    ]);
    const result = simulateStrategy([
      { measureId: anchor, districtId: "Nura" }, { measureId: partner },
    ], data);
    assert.equal(result.indicatorsAfter.Nura[key], 52);
    assert.equal(result.indicatorsAfter.Saryarka[key], 60);
    assert.equal(result.activatedSynergies.length, 1);
    assert.equal(result.activatedSynergies[0].appliedBonus, 2);
    assert.deepEqual(simulateStrategy([{ measureId: anchor, districtId: "Nura" }], data).activatedSynergies, []);
    assert.deepEqual(simulateStrategy([{ measureId: partner }], data).activatedSynergies, []);
    close(result.contributions[0].marginalScoreContribution, result.scoreDelta);
    close(result.contributions[1].marginalScoreContribution, result.scoreDelta);
  }
});

test("simultaneous synergies stay attached to their own district measure", () => {
  const result = simulateStrategy([
    { measureId: "M1", districtId: "Nura" }, { measureId: "M2" },
    { measureId: "M10", districtId: "Saryarka" }, { measureId: "M12" },
    { measureId: "M5", districtId: "Nura" }, { measureId: "M6" },
  ], dataset([
    measure("M1"), measure("M2", { scope: "city" }),
    measure("M10"), measure("M12", { scope: "city" }),
    measure("M5"), measure("M6", { scope: "city" }),
  ]));
  assert.deepEqual(result.indicatorDeltas, {
    Nura: indicators(0, { T1: 2, E2: 2 }),
    Saryarka: indicators(0, { B1: 2 }),
  });
  assert.deepEqual(result.activatedSynergies, [
    { measures: ["M1", "M2"], districtId: "Nura", indicator: "T1", bonus: 2, appliedBonus: 2 },
    { measures: ["M10", "M12"], districtId: "Saryarka", indicator: "B1", bonus: 2, appliedBonus: 2 },
    { measures: ["M5", "M6"], districtId: "Nura", indicator: "E2", bonus: 2, appliedBonus: 2 },
  ]);
});

test("effects and synergies are summed before indicator clipping", () => {
  const data = dataset([
    measure("M1", { fullEffect: { T1: -200, T2: 200, S1: -200 } }),
    measure("M2", { scope: "city" }),
    measure("M10", { fullEffect: { B1: 49 } }),
    measure("M12", { scope: "city" }),
  ]);
  const result = simulateStrategy([
    { measureId: "M1", districtId: "Nura" }, { measureId: "M2" },
    { measureId: "M10", districtId: "Nura" }, { measureId: "M12" },
  ], data);
  assert.equal(result.indicatorsAfter.Nura.T1, 0);
  assert.equal(result.indicatorsAfter.Nura.T2, 100);
  assert.equal(result.indicatorsAfter.Nura.S1, 0);
  assert.equal(result.indicatorsAfter.Nura.B1, 100);
  assert.equal(result.activatedSynergies.find(item => item.indicator === "B1")!.appliedBonus, 1);
});

test("selection order does not affect saturation, results, or contributions", () => {
  const data = dataset([
    measure("X", { fullEffect: { T1: 100 } }),
    measure("Y", { fullEffect: { T1: -80 } }),
  ]);
  const selections = [
    { measureId: "X", districtId: "Nura" }, { measureId: "Y", districtId: "Nura" },
  ];
  const result = simulateStrategy(selections, data);
  assert.equal(result.indicatorsAfter.Nura.T1, 70);
  assert.deepEqual(result, simulateStrategy([...selections].reverse(), data));
  assert.deepEqual(result, simulateStrategy(selections, {
    ...data, districts: [...data.districts].reverse(), measures: [...data.measures].reverse(),
  }));
});

test("input data is untouched and returned snapshots do not alias input", () => {
  const data = dataset([measure("X", { fullEffect: { T1: 8 } })]);
  const selections = [{ measureId: "X", districtId: "Nura" }];
  const before = structuredClone({ data, selections });
  const result = simulateStrategy(selections, data);
  assert.deepEqual({ data, selections }, before);
  Object.assign(result.selectedMeasures[0], { measureId: "changed" });
  Object.assign(result.contributions[0].selection, { districtId: "changed" });
  Object.assign(result.indicatorsBefore.Nura, { T1: 0 });
  Object.assign(result.indicatorsAfter.Nura, { T1: 0 });
  result.contributions[0].realizedEffects.Nura.T1 = 100;
  assert.deepEqual({ data, selections }, before);
  close(simulateStrategy(selections, data).indicatorDeltas.Nura.T1, 8);
});

test("critical threshold crossing changes final score by the exact penalty", () => {
  const data: SimulationDataset = {
    budget: 100,
    districts: [{ id: "Nura", populationShare: 1, indicators: indicators(50, { T1: 39 }) }],
    measures: [measure("X", { fullEffect: { T1: 1 } })],
  };
  const result = simulateStrategy([{ measureId: "X", districtId: "Nura" }], data);
  assert.equal(result.baseline.criticalCount, 1);
  assert.equal(result.final.criticalCount, 0);
  close(result.scoreDelta, 1.1);
});

test("invalid selections and invalid datasets fail explicitly", () => {
  const data = dataset([measure("X"), measure("Y", { scope: "city" })]);
  for (const selections of [
    [{ measureId: "missing" }], [{ measureId: "X" }],
    [{ measureId: "X", districtId: "missing" }], [{ measureId: "Y", districtId: "Nura" }],
    [{ measureId: "Y" }, { measureId: "Y" }],
    [{ measureId: "X", districtId: "Nura" }, { measureId: "X", districtId: "Nura" }],
  ]) assert.throws(() => simulateStrategy(selections, data));
  for (const lag of [-1, 9, 1.5, NaN]) {
    assert.throws(() => simulateStrategy([], dataset([measure("X", { lag })])));
  }
  assert.throws(() => simulateStrategy([], dataset([measure("X", { cost: -1 })])));
  assert.throws(() => simulateStrategy([], dataset([measure("X", { fullEffect: { T1: NaN } })])));
  assert.throws(() => simulateStrategy([], dataset([measure("X"), measure("X")])));
  assert.throws(() => simulateStrategy([], { ...data, budget: Infinity }));
  assert.throws(() => scoreCity([]));
  assert.throws(() => scoreCity([{ ...data.districts[0], populationShare: 0.9 }]));
  assert.throws(() => scoreCity([{ ...data.districts[0], populationShare: NaN }]));
  assert.throws(() => scoreCity([data.districts[0], data.districts[0]]));
  assert.throws(() => scoreDistrict(indicators(50, { T1: NaN })));
});

test("same measure in different districts applies and charges for each selection", () => {
  const result = simulateStrategy([
    { measureId: "M1", districtId: "Nura" }, { measureId: "M1", districtId: "Saryarka" },
    { measureId: "M2" },
  ], dataset([measure("M1", { cost: 55 }), measure("M2", { scope: "city" })]));
  assert.equal(result.totalCost, 120);
  // Budget reporting is distinct from strategy admissibility; no unstated rejection rule.
  assert.equal(result.remainingBudget, -20);
  assert.equal(result.activatedSynergies.length, 2);
});
