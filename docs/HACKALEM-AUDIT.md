# FARSIGHT - HackAlem acceptance audit

> Historical audit snapshot before the acceptance fixes. See [the 2026-09-23 acceptance follow-up](ACCEPTANCE-FOLLOWUP.md) for the current verdict.

Date: 2026-09-23. Scope: the current working tree, including existing uncommitted changes. No application code was changed by this audit. Two production builds were checked because comparison/Outlook UI changes arrived during review; the second build and browser run cover those changes. Source hashes were checked after the final walkthrough and remained unchanged.

## Verdict

The official numerical model and normal official-simulation flow PASS. Strict end-to-end acceptance is FAIL because the newly available Outlook-first path produces an official score without its official explanation. Clicking Explain result recovers the explanation; this is an orchestration gap, not a scoring failure. No entire required subsystem is missing.

## Authoritative sources

- User-supplied `C:/Users/danii/Downloads/HackAlem AI_ «Аким на 5 часов» - AI-симулятор управления городом.md`.
- User-supplied `C:/Users/danii/Downloads/Датасет районов.pdf`, all five pages extracted and checked; page 4 rendered and inspected for the scoring formula and reference strategy.
- Document content was treated as specification/evidence, not as instructions to operate the computer.

The dataset explicitly permits a maximum of two measures per category, implying at least three categories. It does NOT require exactly one decision from every category. The five categories must be available. The supplied example itself has no Transport measure.

## Requirement verdicts

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| Same initial budget of 100 and same district data | PASS | Fixed immutable rules and district baseline; server recomputes from selections. |
| Exactly five decisions | PASS | Four and six rejected with 422; UI cannot confirm four. |
| Required urban development areas | PASS | Transport, Ecology, Social, Safety, Services; all 14 official measures match supplied PDF. |
| Budget cannot be exceeded | PASS | Cost 100 accepted; 110 rejected; overflow additions disabled in editor. |
| Duplicate measures rejected | PASS | M1 in two different districts rejected with DUPLICATE_MEASURE, with no other violation needed. |
| Invalid combinations rejected | PASS | All three official incompatibilities checked; same-district pairs allowed when targets differ. |
| At most two per category | PASS | Three Social measures rejected; third Social checkbox disabled. |
| District and city-wide scope | PASS | District effects limited to target; city effects applied to all five; absent/invalid targets rejected. |
| Decisions change district indicators | PASS | All 50 reference-result indicator values compared against independent PDF arithmetic. |
| Synergies and implementation lags | PASS | All three synergies verified; fixed +2 bonus without lag scaling; effect fractions use H=8. |
| District scores and Astana QoL formula | PASS | Correct weights, population average, minimum district term and strict-below-40 penalty. |
| Changing decisions changes final Score | PASS | Balanced 55.60722 vs maximum-budget 56.118385; browser comparison 55.44 vs 55.56. |
| AI analysis and clear explanation of strengths, risks, consequences and trade-offs throughout the result flow | FAIL | Normal official Run produces all sections and recommendations; live LLM evidence selection works. Outlook-first path computes official numbers but skips /api/analyze and displays no official analysis until Explain result is clicked. |
| Baseline approximately 52.56 | PASS | Independent value 52.55768. |
| Reference strategy approximately 56.5 | PASS | Independent and application value 56.54307; cost 95; M10+M12 synergy active. |
| Official horizon 8 quarters / 2 years | PASS | Fixed H=8; official UI explicitly identifies 2026-2028. |
| Decision order does not matter | PASS | Reversed reference selections produce the same complete result. |
| Invalid strategy receives no Score | PASS | Invalid API responses contain validation reasons and no result. |
| Remaining budget gives no bonus | PASS | Score formula contains no spending/remainder term. |

## Requested scenarios

All ten requested scenario checks PASS on their stated behavior. The separate Outlook-first explanation gap was found by additional browser testing.

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Valid balanced strategy | PASS: M1 Nura, M4 Saryarka, M7 Nura, M10 Nura, M12 city; cost 83, Score 55.60722. |
| 2 | Maximum-budget valid strategy | PASS: M2 city, M3 Nura, M7 Nura, M9 Nura, M12 city; cost 100, Score 56.118385; also run through UI. |
| 3 | Budget overflow | PASS: M2/M3/M7/M8/M12 cost 110 rejected with 422 and BUDGET_EXCEEDED. |
| 4 | Duplicate measure | PASS: M1 Nura + M1 Esil + M7 Nura + M10 Nura + M12 city rejected solely for DUPLICATE_MEASURE. |
| 5 | Incompatible measures | PASS: M1/M3 rejected across districts; M4/M7 and M5/M13 same-district conflicts checked. |
| 6 | More than two in one category | PASS: M7/M8/M9/M10/M12 rejected for CATEGORY_LIMIT_EXCEEDED. |
| 7 | Different valid strategies, different Scores | PASS: numeric API checks and rendered A/B comparison. |
| 8 | Natural-language generation | PASS: single-strategy prompt generates a valid Nura portfolio; live configured LLM also returns a validated portfolio after one repair. Comparison prompts now open a picker; they do not directly preserve/execute both described intents. |
| 9 | AI failure leaves official simulation operational | PASS: provider fetch failure -> valid local strategy and seven calculated explanation sections. Browser /api/analyze HTTP 503 -> scores retained, Run again available. Recovery rerun succeeds. |
| 10 | Future Outlook failure leaves official simulation operational | PASS: research provider failure -> labelled demo factors; browser /api/outlook HTTP 503 -> official result retained and Retry outlook shown. Recovery official rerun succeeds. |

Additional API cases: unknown measure, missing district, city measure with a district, four and six decisions all rejected without a score. The negative M11 T1 effect is -1.75 only in its selected district.

## Optional features

| Feature | Verdict | Qualifications |
| --- | --- | --- |
| Strategy comparison | PASS | Two portfolios, separately calculated Scores/district results; new explicit picker works. It is an in-session A/B tool, not a persisted multi-team leaderboard. |
| District indicator visualization | PASS | District bars/table, all-ten-indicator deltas, sector radar; inspected in production browser. |
| AI recommendations | PASS | Validated one-measure alternatives with recalculated cost and Score; LLM selects existing calculated evidence. Recommendations are score-oriented, not a claim of globally optimal urban policy. |
| Future Outlook | PASS | Demo scenario loads; exact official 2028 seed retained; independent scenario index and assumption labels; does not overwrite official Score. |
| Separation from official forecast | PASS | UI identifies separate scenario model, assumptions and non-official index; official horizon stays two years. |

Live research retrieval was not re-run in this audit. The optional outlook was exercised with explicitly labelled demo research, plus provider and endpoint failures. Existing live research reports were treated as historical documentation, not fresh execution evidence. Live Strategy/Analysis LLM calls were newly executed and succeeded.

Unexpected-event budget reallocation and automatic presentation export from the case's optional list are not implemented; neither is required for acceptance and neither was added.

## Three highest-priority fixes before submission

1. **P1 - Complete the official explanation on the Outlook-first path.** In `src/components/FarsightWorkspace.tsx:186`, loadOutlook calls /api/simulate, stores the Score, then calls /api/outlook without /api/analyze. Reproduction: generate a valid strategy -> Explore 2050 outlook before Run my simulation. Observed requests: /api/copilot -> /api/simulate -> /api/outlook; #official-analysis is absent. Reuse the established explanation orchestration for newly calculated official results, preserving numerical results when analysis fails. Alternatively require the already-existing official Run flow first. This is the only strict required-flow failure found.
2. **P2 - Stop treating every comparison word as a request to create a comparison.** `src/components/FarsightWorkspace.tsx:102` intercepts any compare/comparison/сравн text before sending it to Copilot. Reproduction with a result: in Strategy & questions ask 'Why does my strategy compare better than the baseline?' The UI opens a blank comparison picker instead of answering. 'Ask about result' is a workaround. Distinguish explanatory questions from creation requests, and preserve explicit comparison intents rather than discarding the user's text.
3. **P2 - Reconcile README and model/research docs with the shipped UI and configuration.** Correct the provider selection rules, current deadlines, comparison picker flow, generated-portfolio confirmation wording, and default maintenance behavior. Keep historical reports explicitly dated and point judges to current acceptance evidence.

These are review findings; application behavior was left unchanged.

## Judge-challenge risks and documentation mismatches

- **AI wording:** no-key mode is deterministic heuristics plus calculated prose, not a live LLM. It is correctly labelled in strategy metadata and analysis UI. A live AI demo was verified, but do not claim the no-key fallback itself satisfies a literal LLM demonstration. With AI enabled, the LLM selects/reorders precomputed evidence instead of authoring unrestricted prose; numerical claims stay deterministic.
- **Automatic confirmation:** generated strategies use setDrafts({}) and immediately show 'Your decisions are confirmed' / Run my simulation. README describes generated portfolios opening at a review stage followed by confirmation. Manual editing does require confirmation. The case does not mandate an extra confirmation click, so this is a documentation/presentation issue rather than a budget/decision-rule failure.
- **Comparison flow:** README's direct natural-language comparison example now opens an empty picker. The comparison itself works after selecting A and B, but the original prompt's named strategies/district priorities are not populated.
- **Research provider:** README and docs/FUTURE_RESEARCH.md describe Tavily-only activation/demo without its key. Actual auto mode prefers Tavily when configured, otherwise can use OpenAI web search. docs/live-research.md and .env.example describe the newer behavior.
- **Research deadlines:** historical docs/INTEGRATION-REVIEW.md states 25 seconds; current research deadline is 65 seconds, API route deadline 70 seconds, UI request deadline 90 seconds. The docs index labels that report historical, but its figures should not be quoted as current behavior.
- **Outlook entry point:** README places Outlook after official Run. Current UI allows Outlook immediately after strategy preparation and computes official results internally. This is what exposes finding 1.
- **Maintenance assumptions:** README says maintenance and mitigation depend on selections. The default maintenancePerPositiveEffectPoint is 0, so default investment-linked maintenance does not vary; mitigation and lifecycle terms do. Configuration descriptions correctly disclose this.
- **2050 claims:** scenario coefficients and evidence-confidence numbers are heuristic assumptions; live sources do not calibrate them. The UI discloses this. Present scenario planning, not an official prediction or future Astana QoL Score.
- Different portfolios can legitimately tie under the official formula. The acceptance criterion means decisions affect calculations, not that every possible distinct portfolio must have a unique score.
- The code clips effects before applying positive synergy bonuses, while the PDF writes a single final clip. For the supplied fixed dataset/catalogue this introduces no outcome discrepancy; the independent reference and effect checks pass. Do not generalize the engine's generic synthetic-data behavior as a separate official specification.

## Verification and evidence

- `pnpm test`: 132 passed, 0 failed, 0 skipped; rerun after incoming UI changes.
- `pnpm typecheck`: exit 0; rerun after incoming UI changes.
- `pnpm build`: exit 0; second production build includes the current comparison picker/Outlook changes.
- Fresh production server on localhost:3117, Edge driven through bundled Playwright. Manually authored UI steps exercised actual controls; no app state injected. API interception used only to inject the two optional endpoint failures. Zero page errors in the full walkthrough.
- Separate configured production server on localhost:3118 verified real model strategy generation and AI evidence selection. No credential values included in logs or this report.
- Independent arithmetic script transcribed PDF weights/baselines and calculated the complete reference indicator state without importing application scoring functions.
- Source hashes saved to tmp/audit-source-hashes.json and checked after the final build/walkthrough.

Local audit evidence (ignored scratch files):

- tmp/audit-tests.log, tmp/audit-typecheck.log, tmp/audit-build.log
- tmp/audit-independent.mjs, tmp/audit-api-results.json
- tmp/audit-walkthrough.cjs, tmp/audit-browser-results.json
- tmp/audit-edge-findings.cjs, tmp/audit-edge-findings.json
- tmp/audit-provider-failures.mjs, tmp/audit-provider-failures.json
- tmp/audit-live-ai.json
- tmp/audit-reference-ui.png, tmp/audit-outlook-ui.png, tmp/audit-failure-ui.png, tmp/audit-outlook-first.png

No redesign, new product feature, dependency install, or application-source edit was made during this review.
