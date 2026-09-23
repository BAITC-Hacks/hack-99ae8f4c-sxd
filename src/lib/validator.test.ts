import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStrategy } from "./validator.ts";
import type { StrategySelection, ValidationErrorCode } from "./validator.ts";

const selection = (measureId: string, districtId?: string): StrategySelection =>
  districtId === undefined ? { measureId } : { measureId, districtId };

const validStrategy: readonly StrategySelection[] = [
  selection("M7", "nura"), selection("M8", "nura"), selection("M10", "nura"),
  selection("M12"), selection("M5", "saryarka"),
];

function expectError(selections: unknown, code: ValidationErrorCode) {
  const result = validateStrategy(selections);
  assert.equal(result.valid, false);
  const error = result.errors.find(error => error.code === code);
  assert.ok(error, `Expected ${code}, received ${JSON.stringify(result.errors)}`);
  assert.ok(error.message.trim().length > 0);
  return error;
}

test("accepts the 95-unit example in the dataset", () => {
  assert.deepEqual(validateStrategy(validStrategy), {
    valid: true, totalCost: 95, remainingBudget: 5, errors: [],
  });
});

test("rejects budget overflow and reports the full deficit", () => {
  const strategy = [selection("M3", "nura"), selection("M5", "saryarka"),
    selection("M7", "nura"), selection("M10", "nura"), selection("M12")];
  expectError(strategy, "BUDGET_EXCEEDED");
  assert.equal(validateStrategy(strategy).totalCost, 105);
  assert.equal(validateStrategy(strategy).remainingBudget, -5);
});

test("accepts exactly 100 units", () => {
  const strategy = [selection("M3", "nura"), selection("M7", "nura"),
    selection("M8", "nura"), selection("M10", "nura"), selection("M12")];
  assert.deepEqual(validateStrategy(strategy), {
    valid: true, totalCost: 100, remainingBudget: 0, errors: [],
  });
});

test("rejects duplicate IDs even across different districts and counts their cost", () => {
  const strategy = [selection("M10", "nura"), selection("M10", "esil"),
    selection("M9", "nura"), selection("M4", "esil"), selection("M12")];
  assert.deepEqual(expectError(strategy, "DUPLICATE_MEASURE").measureIds, ["M10"]);
  assert.equal(validateStrategy(strategy).totalCost, 63);
});

test("rejects fewer than five decisions", () => {
  expectError(validStrategy.slice(0, 4), "INVALID_SELECTION_COUNT");
});

test("rejects more than five decisions", () => {
  expectError([...validStrategy, selection("M11", "nura")], "INVALID_SELECTION_COUNT");
});

test("rejects an empty strategy with zero cost", () => {
  expectError([], "INVALID_SELECTION_COUNT");
  assert.equal(validateStrategy([]).totalCost, 0);
  assert.equal(validateStrategy([]).remainingBudget, 100);
});

test("rejects three measures from one category", () => {
  const strategy = [selection("M7", "nura"), selection("M8", "nura"),
    selection("M9", "esil"), selection("M10", "nura"), selection("M12")];
  assert.deepEqual(expectError(strategy, "CATEGORY_LIMIT_EXCEEDED").measureIds, ["M7", "M8", "M9"]);
});

test("rejects M1 + M3 globally, even in different districts", () => {
  const strategy = [selection("M1", "nura"), selection("M3", "esil"),
    selection("M9", "nura"), selection("M10", "nura"), selection("M12")];
  const error = expectError(strategy, "INCOMPATIBLE_MEASURES");
  assert.deepEqual(error.measureIds, ["M1", "M3"]);
  assert.equal(error.districtId, undefined);
});

for (const [first, second] of [["M4", "M7"], ["M5", "M13"]] as const) {
  test(`rejects ${first} + ${second} in the same district in either order`, () => {
    const strategy = [selection(first, "nura"), selection(second, "nura"),
      selection("M9", "nura"), selection("M10", "nura"), selection("M12")];
    for (const selections of [strategy, [...strategy].reverse()]) {
      const error = expectError(selections, "INCOMPATIBLE_MEASURES");
      assert.deepEqual(error.measureIds, [first, second]);
      assert.equal(error.districtId, "nura");
    }
  });

  test(`allows ${first} + ${second} in different districts`, () => {
    const strategy = [selection(first, "nura"), selection(second, "esil"),
      selection("M9", "nura"), selection("M10", "nura"), selection("M12")];
    assert.equal(validateStrategy(strategy).valid, true);
  });
}

for (const districtId of [undefined, "", "   "]) {
  test(`rejects a missing or blank district: ${JSON.stringify(districtId)}`, () => {
    const strategy = [selection("M7", districtId), ...validStrategy.slice(1)];
    assert.deepEqual(expectError(strategy, "MISSING_DISTRICT").measureIds, ["M7"]);
  });
}

test("city measures do not require a district and reject district targets", () => {
  const strategy = [selection("M2"), selection("M6"), selection("M12"),
    selection("M14"), selection("M10", "nura")];
  assert.equal(validateStrategy(strategy).valid, true);
  const targeted = validateStrategy(strategy.map(s => ({ ...s, districtId: "nura" })));
  assert.equal(targeted.valid, false);
  assert.equal(targeted.errors.length, 4);
  assert.ok(targeted.errors.every(error => error.code === "INVALID_TARGET"));
});

test("district targets must be stable IDs from the shared catalogue", () => {
  for (const districtId of ["unknown", "Nura", "nura ", "toString"]) {
    const strategy = [selection("M7", districtId), ...validStrategy.slice(1)];
    assert.equal(expectError(strategy, "INVALID_DISTRICT").districtId, districtId);
  }
});

test("missing districts do not create a false same-district conflict", () => {
  const result = validateStrategy([selection("M4"), selection("M7"),
    selection("M9", "nura"), selection("M10", "nura"), selection("M12")]);
  assert.deepEqual(result.errors.map(e => e.code), ["MISSING_DISTRICT", "MISSING_DISTRICT"]);
});

test("detects district conflicts even when an ID has been duplicated", () => {
  const strategy = [selection("M4", "esil"), selection("M4", "nura"),
    selection("M7", "nura"), selection("M10", "nura"), selection("M12")];
  expectError(strategy, "DUPLICATE_MEASURE");
  assert.equal(expectError(strategy, "INCOMPATIBLE_MEASURES").districtId, "nura");
});

test("rejects unknown IDs including inherited object property names", () => {
  for (const id of ["M99", "toString", "__proto__"]) {
    const strategy = [selection(id), ...validStrategy.slice(1)];
    assert.deepEqual(expectError(strategy, "UNKNOWN_MEASURE").measureIds, [id]);
    assert.equal(validateStrategy(strategy).totalCost, 71);
  }
});

test("reports all independent violations in one result", () => {
  const result = validateStrategy([selection("M1"), selection("M1", "nura"),
    selection("M3", "esil"), selection("M5", "nura"), selection("M13", "nura"),
    selection("M12")]);
  assert.deepEqual(new Set(result.errors.map(e => e.code)), new Set([
    "INVALID_SELECTION_COUNT", "MISSING_DISTRICT", "BUDGET_EXCEEDED",
    "DUPLICATE_MEASURE", "CATEGORY_LIMIT_EXCEEDED", "INCOMPATIBLE_MEASURES",
  ]));
  assert.equal(result.errors.filter(e => e.code === "INCOMPATIBLE_MEASURES").length, 2);
});

test("is deterministic and does not mutate readonly input or share mutable results", () => {
  const frozen = Object.freeze(validStrategy.map(s => Object.freeze({ ...s })));
  const first = validateStrategy(frozen);
  assert.deepEqual(validateStrategy(frozen), first);
  assert.deepEqual(validateStrategy([...frozen].reverse()), first);
  assert.deepEqual(frozen, validStrategy);
  first.errors.push({ code: "UNKNOWN_MEASURE", message: "test" });
  assert.deepEqual(validateStrategy(frozen).errors, []);
});

test("rejects malformed strategy containers with structured validation errors", () => {
  for (const input of [undefined, null, false, 5, "M7", {}, { length: 5 }]) {
    const result = validateStrategy(input);
    assert.equal(result.valid, false);
    assert.equal(result.totalCost, 0);
    assert.equal(result.remainingBudget, 100);
    assert.deepEqual(result.errors.map(error => error.code), ["INVALID_SELECTION_INPUT"]);
  }
});

test("reports malformed entries without losing the costs of recognized selections", () => {
  for (const input of [undefined, null, false, 5, "M7", [], {}, { measureId: 7 }]) {
    const strategy = [input, ...validStrategy.slice(1)];
    expectError(strategy, "INVALID_SELECTION_INPUT");
    const result = validateStrategy(strategy);
    assert.equal(result.totalCost, 71);
    assert.equal(result.remainingBudget, 29);
    assert.equal(result.errors.length, 1);
  }
  const sparse = Array.from(validStrategy);
  delete sparse[0];
  expectError(sparse, "INVALID_SELECTION_INPUT");
});

test("rejects non-string targets while counting known measures toward budget and duplicates", () => {
  for (const districtId of [null, false, 0, 42, [], {}]) {
    const strategy = [{ measureId: "M7", districtId }, ...validStrategy.slice(1)];
    assert.deepEqual(expectError(strategy, "INVALID_SELECTION_INPUT").measureIds, ["M7"]);
    assert.equal(validateStrategy(strategy).totalCost, 95);
    assert.equal(validateStrategy(strategy).remainingBudget, 5);
    const cityTarget = [...validStrategy.slice(0, 3), { measureId: "M12", districtId }, validStrategy[4]];
    assert.deepEqual(expectError(cityTarget, "INVALID_SELECTION_INPUT").measureIds, ["M12"]);
  }
  const duplicate = [{ measureId: "M7", districtId: 42 }, ...validStrategy.slice(0, 4)];
  expectError(duplicate, "DUPLICATE_MEASURE");
  expectError(duplicate, "CATEGORY_LIMIT_EXCEEDED");
  assert.equal(validateStrategy(duplicate).totalCost, 94);
});

