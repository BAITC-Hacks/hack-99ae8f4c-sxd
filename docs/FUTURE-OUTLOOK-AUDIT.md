# Future Outlook verification — 2026-09-23

Verdict: PASS for deterministic scenario calculations and automated API integration, with interpretation caveats below. This audit did not edit the official model or production application code. Added `src/lib/outlook-audit.test.ts` and checkpoint evidence in `docs/future-outlook-audit-results.json`.

## Checks

- Exact 2028 seed: PASS; district indicators equal the official two-year output.
- Official input immutability and separate 2050 index: PASS; scenario outputs are cloned and are not official QoL scores.
- Determinism: PASS for identical official state, factors, and assumptions, including reordered factors/selections.
- Bounds and stability: PASS; annual indicator and external-impact caps hold, including existing 30-factor stress tests. No positive percentage compounding occurs.
- Factor isolation: PASS; the added matrix changes each of the six demo factors separately and verifies all unmapped district indicators remain exactly unchanged.
- Comparison: PASS; API tests verify both strategies use shared factors and assumptions, with separate official seeds.
- Failure isolation: PASS; provider failure, malformed research, and deadline tests leave official simulation available. UI source stores outlook separately and catches its request failure without clearing official results.
- Scenario coverage: three current UI presets, each with low/high water (0.3/0.9), low/high population pressure (0.3/0.9), and maintenance coverage 0/0.7: 24 combinations. Existing sensitivity tests add 108 combinations using generated strategies.
- All requested checkpoints present: 2028, 2030, 2035, 2040, 2045, 2050.

## Default checkpoint indices

These are scenario indices, including the index computed from the official 2028 indicator state; they are not official QoL scores.

| Current UI preset | 2028 | 2030 | 2035 | 2040 | 2045 | 2050 |
|---|---:|---:|---:|---:|---:|---:|
| Green Growth | 58.549 | 58.427 | 56.420 | 53.613 | 50.789 | 47.958 |
| Industrial-Mobility | 59.036 | 58.966 | 56.995 | 54.181 | 51.339 | 48.485 |
| Balanced development | 58.384 | 58.247 | 56.203 | 53.359 | 50.500 | 47.638 |

The JSON evidence contains 18 runs: default, high water, low water, high population, no maintenance, and maintenance for each preset. Across those annual district traces, values range from 17.024 to 80.320; the largest annual absolute change is 2.537 points. No annual or indicator clipping occurred in these runs. Higher pressure worsens mapped metrics, and maintenance improves exposed metrics.

## Flags

1. **Arbitrary calibration:** the shipped assumptions explicitly say coefficients, dates, mappings and pressure levels are illustrative, not empirical estimates. All three default indices decline by roughly 10.5–10.7 points through 2050. This is a result of configured recurring pressures, not validated evidence that these strategies will fail. Ranking strategies by the small 2050 differences would overstate precision.
2. **Diminishing sensitivity from impact caps:** overlapping pressures approach the 0.8-point annual external-impact limit. High-water changes can therefore have less effect than equal-sized low-water changes. This is a deliberate numerical guardrail, not evidence of physical resilience.
3. **Live research reproducibility is conditional:** the calculation is deterministic for fixed factors. Repeating a live research request later can retrieve different evidence/factors; identical strategy selections alone do not guarantee an identical live outlook. Persist the complete factor and assumption snapshot when comparing runs.
4. **Maintenance wording:** comparison analysis says selected measures affect maintenance, but the default `maintenancePerPositiveEffectPoint` is zero. Default strategy differences in maintenance coverage are therefore zero. The with/without runs change coverage explicitly and make no claim about maintenance budget or cost.
5. **Validation scope:** automated integration invokes API handlers and injects provider failures; no interactive browser session or real live-provider call was tested. Sources attached to live factors do not empirically calibrate scenario coefficients.

## Execution notes

The initial full suite had 143 passes and one official-simulator clipping test failure. During the audit, another workspace actor changed `src/lib/simulator.ts`, its test, and added dataset tests. The subsequent full run passed all 168 tests. This audit did not make or revert those official-model changes. Results refer to the current shared workspace, not an immutable commit.

Typecheck passed after the added audit tests. Production build passed; logs are under `tmp/future-outlook-audit-*.log`.
