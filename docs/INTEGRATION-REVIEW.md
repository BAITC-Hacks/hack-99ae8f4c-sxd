# FARSIGHT Hour 3 integration review

> Historical integration snapshot. For current behavior and timeouts, see [the README](../README.md), [Future Research](FUTURE_RESEARCH.md), and [acceptance follow-up](ACCEPTANCE-FOLLOWUP.md).

Reviewed 2026-09-23. Changes are limited to API orchestration, shared API types, client request lifecycle, integration tests, development logging, and a local failure-injection proxy. Strategy/model, research-provider, analysis-agent, official scoring, and long-term calibration implementations were not rewritten by this review.

## Required flow

User prompt → Strategy Agent → Validator → Official 2-Year Simulation → QoL Result → Analysis Agent works without requesting Future Outlook. The browser renders official numbers before analysis completes. A failed analysis HTTP request keeps those numbers and exposes an explanation retry. Comparison analysis uses independent settled outcomes so one failed explanation does not discard the other.

Future Research → Long-Term Scenario Engine → Future Outlook remains optional. Research orchestration has a 25-second deadline in addition to provider-owned timeouts. Timeout errors return a human-readable 504. Optional failure never clears the official result. Malformed factors are rejected before a scenario is rendered.

## Requested test cases

| # | Case | Evidence and outcome |
|---|---|---|
| 1 | Local strategy generation | WORKING: route tests and production browser run; validated five-measure portfolios. |
| 2 | Live Strategy Agent | WORKING: HTTP-contract fixtures and real configured model in the browser; two model-generated portfolios validated. |
| 3 | Live strategy fails | FALLBACK: injected provider outage returns a valid local portfolio and permits simulation/explanation. |
| 4 | Invalid model strategy | WORKING: invalid → repaired valid HTTP fixture; persistent-invalid unit cases use validated local fallback. |
| 5 | Official simulation | WORKING: deterministic route tests and browser; live-generated comparison scores 54.26 and 54.07. |
| 6 | Analysis fails | FALLBACK: provider failure returns calculated evidence; injected HTTP 503 leaves production-browser scores 55.56 and 55.44 visible with an Explain retry. |
| 7 | Future Research succeeds | DEMO in the configured app; live provider contract passes synthetic sourced fixtures. Real search is unverified because TAVILY_API_KEY is absent. |
| 8 | Future Research times out | FALLBACK: provider timeout tests use demo factors; orchestration deadline test returns 504 if optional work remains hung. Official simulation still succeeds. |
| 9 | Malformed outlook factor | WORKING: malformed/NaN factors rejected; official simulation still succeeds. |
| 10 | Compare valid strategies | WORKING: API comparison tests and live/no-key browser comparisons. |
| 11 | Reset/new generation | WORKING: browser reset removed comparison, scores, analysis and outlook; new Social First generation had no previous result. RequestSession tests reject stale completions and overlapping actions. |
| 12 | No API keys | DEMO: API tests remove keys and disallow network; production browser with OpenAI/Tavily keys blank completes generation, simulation, analysis and optional demo outlook. |

## Verification

- Full typecheck: passed.
- Full test suite: 124 passed, 0 failed at the final test run.
- Production build: passed; rebuilt after the final route logging changes.
- Local browser review: real configured model at port 3000; no-key production server at port 3103; injected optional endpoint failures through port 3104.
- The first test run had three failures while concurrent module updates were arriving. The integration fixture was corrected to use an allowed synthetic source URL. Research relevance/order tests passed on the updated owner-provided code without changing that core logic here.

Development logs include `strategy_generation`, `validation`, `official_simulation`, `analysis`, `future_research`, and `future_outlook`, with stage/status/duration only. No secrets, prompts, response bodies, or raw provider errors are logged. Production suppresses these development logs.

To reproduce browser failure checks, run a production app on localhost:3103, then `node scripts/integration-failure-proxy.mjs` and open localhost:3104. That local-only proxy deliberately returns 503 for analysis/outlook and forwards everything else. It is not part of application routing.

## Module status

| Module | Status | Qualification |
|---|---|---|
| Copilot / intent routing | WORKING | Prompt-based generation and questions. |
| Live Strategy Agent | WORKING | Real model browser run succeeded; invalid-output repair tested. |
| Local strategy generation | FALLBACK | Validated deterministic generation without model access. |
| Manual strategy editor | WORKING | Existing validation tests; fresh/reset builder state checked. |
| Validator | WORKING | Rejects invalid portfolios before official simulation. |
| Official 2-Year Simulation | WORKING | Deterministic and independent of research/model availability. |
| QoL result / district display | WORKING | Remains visible when optional requests fail. |
| Analysis Agent | WORKING | Live evidence selection plus calculated fallback; endpoint failure isolated. |
| Comparison | WORKING | Two official results; independent explanation outcomes. |
| Future Research | DEMO | Live implementation and fixture tests exist; real search key missing. |
| Long-Term Scenario Engine | WORKING | Deterministic assumption-based engine; empirical calibration not asserted by this review. |
| Future Outlook | DEMO | Demo research shown explicitly; optional failure/retry isolated. |
| API orchestration / shared types | WORKING | Typed responses, validation errors, optional deadlines. |
| Session reset / request lifecycle | WORKING | State cleared; stale response and overlap protection. |
| Development logging | WORKING | Six requested stages, no payloads or secrets. |

No remaining integration test/build failures. Live search verification remains unavailable in this environment; this is a configuration limitation, not a claim that the research implementation is missing. Concurrent agents may continue changing the workspace after these checks.
