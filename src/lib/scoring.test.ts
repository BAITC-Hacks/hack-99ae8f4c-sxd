import assert from "node:assert/strict";
import { test } from "node:test";
import { INDICATORS, scoreCity, scoreDistrict } from "./scoring.ts";
import type { Indicators } from "./scoring.ts";

function indicators(value: number): Indicators {
  return Object.fromEntries(INDICATORS.map(key => [key, value])) as Indicators;
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test("the city average uses population while the weakest district retains its 30 percent contribution", () => {
  const result = scoreCity([
    { id: "large", populationShare: 0.99, indicators: indicators(80) },
    { id: "small", populationShare: 0.01, indicators: indicators(40) },
  ]);
  close(result.cityAverage, 79.6);
  close(result.minimumDistrictScore, 40);
  assert.equal(result.criticalCount, 0);
  close(result.score, 67.72);
});

test("district inequality changes the score even with the same population-weighted city average", () => {
  const city = (first: number, second: number) => scoreCity([
    { id: "A", populationShare: 0.5, indicators: indicators(first) },
    { id: "B", populationShare: 0.5, indicators: indicators(second) },
  ]);
  close(city(40, 80).cityAverage, city(60, 60).cityAverage);
  close(city(40, 80).score, 54);
  close(city(60, 60).score, 60);
});

test("the critical penalty counts district-indicator cells strictly below 40 without rounding", () => {
  const result = scoreCity([
    { id: "A", populationShare: 0.25, indicators: { ...indicators(40), T1: 39.999999, S1: 39 } },
    { id: "B", populationShare: 0.75, indicators: { ...indicators(40), T1: 39.999999 } },
  ]);
  assert.equal(result.criticalCount, 3);
  close(result.score, 0.7 * result.cityAverage + 0.3 * result.minimumDistrictScore - 3);
});

test("only indicators are clipped: fifty critical cells can make the official score negative", () => {
  const result = scoreCity(Array.from({ length: 5 }, (_, index) => ({
    id: `district-${index}`, populationShare: 0.2, indicators: indicators(-10),
  })));
  close(scoreDistrict(indicators(-10)), 0);
  close(scoreDistrict(indicators(110)), 100);
  assert.equal(result.criticalCount, 50);
  assert.equal(result.cityAverage, 0);
  assert.equal(result.minimumDistrictScore, 0);
  assert.equal(result.score, -50);
});
