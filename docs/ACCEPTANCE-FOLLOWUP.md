# FARSIGHT acceptance follow-up

Verified 2026-09-23 against the working tree, including pre-existing uncommitted work. This follow-up supersedes the three remaining findings in [the earlier audit](HACKALEM-AUDIT.md).

**Overall: PASS**

| Acceptance check | Result |
| --- | --- |
| Normal Run automatically requests and displays official analysis | PASS |
| Generated strategy -> Outlook-first requests simulate -> analyze -> outlook | PASS |
| Every newly simulated A/B result gets its own official explanation | PASS |
| Analysis HTTP 503 preserves numerical results; Outlook still loads; Explain retry recovers | PASS |
| Explanatory English compare/comparison and Russian comparison questions answer without opening the picker | PASS |
| Explicit comparison commands open the picker and preserve named strategies/district priorities | PASS |
| README/product/research/model docs reflect current shipped behavior | PASS |
| Full tests | PASS: 140 passed, 0 failed, 0 skipped |
| Typecheck | PASS: `pnpm typecheck`, exit 0 |
| Production build | PASS: `pnpm build`, exit 0 |
| Official simulator/scoring/validator/data and long-term model unchanged | PASS: SHA-256 matches the earlier audit for all 13 protected files |

## Changes

Both UI entry points use the same simulation-and-analysis workflow. Each successful numerical result is published before analysis starts; analysis errors are isolated from simulation success. A comparison's successful strategy is still analyzed if the other simulation fails. Missing official results are created for Outlook; existing results are reused. Reset-session completions are discarded.

Comparison routing now recognizes commands instead of matching every occurrence of a comparison word. Named pairs prefill the picker, including custom district priorities. Confirmation remains explicit for the pair; explanatory questions preserve the current portfolio and results.

Documentation now covers generated strategies being immediately confirmed, explicit manual-edit confirmation, Outlook-first behavior, comparison picker behavior, Tavily/OpenAI provider selection, current deadlines, maintenance coverage and scenario planning rather than prediction. Prior integration reports are marked historical.

## Browser evidence

Manually authored UI walkthroughs drove the actual production controls in Edge through bundled Playwright; no application state was injected. The normal manual reference portfolio produced QoL **56.54** and its explanation. The generated Outlook-first path produced `/api/simulate -> /api/analyze -> /api/outlook`. The A/B path made two simulation calls and two analysis calls, with an explanation verified for each strategy.

A separate production instance used the existing configured AI provider. Both Run and Outlook-first displayed **AI + calculated evidence** and **AI explanation** in the official panel. Its Outlook research was deliberately set to demo: live research retrieval was not re-tested in this follow-up. The explanation screenshot was visually inspected. Both walkthroughs reported zero browser page errors.

Failure injection intercepted only `/api/analyze` with HTTP 503. Both flows kept official scores visible, Outlook-first continued to the scenario, and the Explain retry recovered after removing the injected failure. Reopening an existing Outlook did not repeat simulation/analysis.

Local scratch evidence (ignored by Git):
- `tmp/acceptance-tests.log`, `tmp/acceptance-build.log`
- `tmp/acceptance-browser.cjs`, `tmp/acceptance-browser-results.json`
- `tmp/acceptance-live-ai.cjs`, `tmp/acceptance-live-ai.json`
- `tmp/acceptance-run.png`, `tmp/acceptance-outlook-first.png`, `tmp/acceptance-analysis-failure.png`
- `tmp/acceptance-live-Run.png`, `tmp/acceptance-live-Outlook-first.png`

Windows sandbox initialization failed for shell, Node REPL and browser-control tools. Approved elevated shell execution and bundled Playwright provided the execution path for these checks.
