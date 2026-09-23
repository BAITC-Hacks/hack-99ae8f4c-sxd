# Conditional long-term scenarios

This layer asks: **If these assumptions and external trends hold, how might this strategy evolve?** It does not predict Astana in 2050. The official eight-quarter simulator and scoring formula remain separate from this scenario layer.

The 2028 district indicators are copied exactly from the official result. The 2026 point is only a reference. Annual updates begin in 2029; checkpoints are 2028, 2030, 2035, 2040, 2045 and 2050.

## Formula

```
next = current
     + remaining signed initiative effect
     + tapering additional initiative effect
     + baseline pressure + mapped external pressure
     - capacity decay
```

Limit the combined annual change, then clamp the resulting indicator to 0–100. Every term and the adjustment from both limits appears in the annual trace. Updates are simultaneous. Positive gains never multiply the current indicator. Only decay is proportional to current capacity, so its absolute loss shrinks as capacity falls.

Remaining effects total `catalog effect × lag / 8`, spread over three years. Already realized effects and official synergies are not added again. Additional yearly effects are `catalog effect × category annual fraction × 2^(-age / half-life)`; negative trade-offs retain their signs. Resilience uses the same taper on positive effects. This is an illustrative continuation rule, not an engineering asset model.

External impacts use declared affected metrics, direction, strength, a five-year ramp and local resilience. Confidence remains a label; it does not multiply magnitude. Sum impacts separately for each metric; if its total exceeds the external cap, scale its contributions equally. Changing one metric's pressure cannot rescale another metric. Final clipping is attributed to the limit adjustment, not to individual factors.

## Assumption inventory

All executable assumptions live in `src/data/long-term-assumptions.ts`, including sensitivity settings and factor mappings. None are in prompts. **Every numeric long-term coefficient, mapping and timing below is arbitrary and uncalibrated.** Official catalog effects, lags, district indicators and population shares are inherited inputs, not new empirical evidence for long-term behavior.

| Assumption | Final configuration / interpretation |
|---|---|
| Time and completion | Official seed 2028; end 2050; remaining effect spread over 3 years |
| Transport lifecycle | Annual fraction 0.025; half-life 15 years |
| Ecology lifecycle | Annual fraction 0.035; half-life 22 years |
| Social lifecycle | Annual fraction 0.020; half-life 18 years |
| Safety lifecycle | Annual fraction 0.015; half-life 10 years |
| Services lifecycle | Annual fraction 0.025; half-life 16 years |
| Baseline trends, points/year | T1 −0.12, T2 −0.10, E1 −0.06, E2 −0.04, S1 −0.10, S2 −0.08, B1 −0.04, B2 −0.06, C1 −0.12, C2 +0.04 |
| Capacity decay | Current indicator × 0.003 × metric exposure × (1 − maintenance) |
| **New decay exposure** | E2 0; all others 1. Ambient environmental quality is not directly depreciated as infrastructure. Other indicators are capacity proxies, not measured assets |
| Maintenance | Baseline 0.35; maximum 0.9; **investment-linked increment changed from 0.02 to 0**, so investment no longer implies maintenance funding |
| Resilience | Positive catalog effect × 0.018, capped at 0.45; **now tapers with category half-life**, instead of remaining permanent |
| External scale and ramp | 0.55 points/year at strength 1; ramp over 5 active years; start/end inclusive |
| **New combined external cap** | Absolute summed impact ≤0.8 points per metric/year; proportional attribution on that metric only |
| **New annual movement cap** | Absolute net change ≤4 points/year; then 0–100 clamp |
| Mixed direction coefficients | T1 −0.4, T2 −0.3, E1 −0.4, E2 −0.3, S1 −0.4, S2 −0.3, B1 −0.2, B2 −0.2, C1 −0.4, C2 +0.3; applied only to declared metrics |
| Confidence | Evidence label only, independent of numerical trajectory |
| **Common demo exposure** | All six demo factors apply regardless of selected strategy categories; local selected effects determine resilience |
| **Aging overlap removed** | Separate infrastructure-aging demo factor omitted; routine capacity decay already represents aging |
| Index | Equal 0.1 metric weights, fixed official district population shares; not official QoL scoring |
| Future investment | No new initiatives, endogenous population movement, reinvestment, budget or extra synergies after the seed |
| **Sensitivity settings** | Strength 0.3/0.6/0.9; population and water low/medium/high = 0.3/0.6/0.9; maintenance without/with = 0/0.7 |

Factor assumptions (all end in 2050; no research citations are claimed):

| Factor | Starts | Strength | Confidence | Mapping |
|---|---:|---:|---:|---|
| Population/service demand | 2029 | 0.65 | 0.35 | −S1, −S2, −C1 |
| Climate | 2032 | 0.55 | 0.30 | −E1, −E2, −S2 |
| Water stress | 2030 | 0.60 | 0.30 | −C1, −E1 |
| Transport demand | 2029 | 0.70 | 0.40 | −T1, −T2, −B2 |
| Energy/utilities | 2033 | 0.50 | 0.30 | −C1, −E2 |
| Expansion/digital access | 2030 | 0.50 | 0.30 | Mixed: T1, E1, S1 negative; C2 positive |

Population pressure is an intensity setting, not a population projection. Water pressure is not a hydrological forecast. Baseline trends and external pressures can still overlap conceptually; the cap limits their numerical consequences but does not validate their causal independence. Maintenance is assumed coverage, with no maintenance cost model. Completion continues independently of maintenance; maintenance slows subsequent capacity loss.

## Example trajectories and sensitivity

Default assumptions and identical external factors; values below are the scenario indicator index:

| Year | Industrial-Mobility First | Green Growth |
|---|---:|---:|
| 2028 | 58.29 | 57.97 |
| 2030 | 58.36 | 58.01 |
| 2035 | 56.44 | 56.05 |
| 2040 | 53.64 | 53.24 |
| 2045 | 50.81 | 50.41 |
| 2050 | 47.97 | 47.58 |

Industrial-Mobility selections: M10/Baikonur, M2/city, M3/Nura, M4/Saryarka, M8/Nura. Green Growth: M11/Nura, M3/Nura, M4/Saryarka, M5/Saryarka, M8/Nura. These are the existing Strategy Agent's generated selections at the time of review; its logic was not changed.

The full 108-case grid is 2 strategies × 3 general strengths × 3 population levels × 3 water levels × 2 maintenance settings. General strength sets the other four factors; population and water retain independent levels. Across the grid, 2050 index ranges are 44.81–53.05 and 44.40–52.66 respectively. District indicators range from 20.15 to 77.89. Maximum annual change is 3.645 points. No case required the annual movement or 0–100 clamp. External caps can bind; their attribution is tested. These ranges are sensitivity envelopes, not confidence intervals, and the small difference between strategies is not evidence of a robust policy ranking.

Additional tests cover 30 overlapping full-strength factors of either sign, order invariance, identical trajectories, small perturbations, maintenance, expected investment monotonicity, logical metric isolation, trace reconciliation and unchanged official inputs/results. See `src/lib/outlook-sensitivity.test.ts`. Full checkpoint details, assumptions and each grid outcome are saved in `src/data/long-term-sensitivity-results.json`.

## Validation

Run `pnpm test`, `pnpm typecheck` and `pnpm build` for current validation. Saved long-term result files describe historical runs, not the current acceptance status. The sensitivity grid above records the reviewed assumptions and portfolios; live research may provide different external factors. See [Future Research](FUTURE_RESEARCH.md) for current provider selection and timeouts.
