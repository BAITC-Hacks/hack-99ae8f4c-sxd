# Future Research live integration

> Historical integration snapshot. For current behavior and timeouts, see [the README](../README.md), [Future Research](FUTURE_RESEARCH.md), and [acceptance follow-up](ACCEPTANCE-FOLLOWUP.md).

## Root cause
The previous defaultProvider only inspected TAVILY_API_KEY. The local .env contains OPENAI_API_KEY but no TAVILY_API_KEY. Therefore the adapter was never instantiated and requests returned not_configured/demo before attempting retrieval. OPENAI_MODEL and the existing strategy/analysis integration did not enable research. Both /api/research and /api/outlook were already wired to getFutureFactors.

The existing Tavily adapter already had HTTPS/domain validation, deduplication, caching, a per-request timeout and one transient retry. Its extraction required geography, topic and trend in the same sentence; valid paragraphs could be discarded. Fewer than three valid factors triggers demo fallback. Provider failures were swallowed without useful adapter diagnostics. Strategy-dependent search queries could also give the comparison endpoint inconsistent definitions of the same factor.

## Changes
- Auto configuration selects Tavily when its credential is present, otherwise OpenAI Responses hosted web search. Explicit auto/openai/tavily/demo selection is supported.
- OpenAI search is required, and model-generated URLs must also appear in completed web_search_call.action.sources. Existing trusted HTTPS domain validation and URL normalization/deduplication still apply.
- One national evidence snapshot is coalesced and cached for 15 minutes. Strategy context selects relevant factors afterward. Tavily queries are consistent across strategies for each topic.
- Bounded paragraph extraction handles a geographic reference in an adjacent sentence. Malformed envelopes, JSON, sources, factors and insufficient evidence safely return sourceMode demo. Successful validated research returns sourceMode live.
- OpenAI requests allow 30 seconds each and one retry for transient network, timeout, HTTP 429 or 5xx errors. Authentication/invalid request/malformed response failures are not retried. Research has a 65-second deadline; route protection is 70 seconds; the existing client permits 90 seconds. Response bodies are size limited. Logs report provider, attempt, safe failure category and factor counts without credentials.
- gpt-4.1-mini rejected the hosted filters parameter in a real request, so source restrictions are instructed in the query and enforced locally, rather than using that unsupported parameter.
- No official simulator or long-term simulator code changed. Research supplies evidence and FutureFactor records only. Direction, strength, confidence and timing remain explicit heuristic scenario assumptions; these are not measurements from sources or QoL predictions.

## Configuration
Only one server credential is required:
- OPENAI_API_KEY for the OpenAI search path (already present locally), or
- TAVILY_API_KEY for Tavily.

Optional settings:
- FARSIGHT_RESEARCH_PROVIDER=auto (default), openai, tavily, or demo.
- FARSIGHT_RESEARCH_MODEL=gpt-4.1-mini (default; separate from OPENAI_MODEL).
- FARSIGHT_AI_MODE=local disables live calls; auto allows them.

Never expose credentials through NEXT_PUBLIC variables. No credential values were changed or written to reports.

## Verification
Typecheck: node node_modules/typescript/bin/tsc --noEmit — passed.
Tests: node --test src/lib/*.test.ts — 132 passed, 0 failed.
Actual app: http://localhost:3002 (isolated development build directory because another instance was already using port 3000).
Actual HTTP sequence: /api/simulate → /api/research for each strategy; /api/outlook with Green Growth and Industrial-Mobility comparison. All responses succeeded.

| Strategy | sourceMode | Factors |
| --- | --- | --- |
| Green Growth | live | 5 |
| Industrial-Mobility | live | 5 |
| Social Infrastructure First | live | 5 |

Every factor has trusted real source URLs. The live comparison passed its consistency checks and the script asserted that Scenario Engine factors equal the returned research factors. Repeated live requests can yield different evidence/counts after cache invalidation.

Evidence: live-research-results.json, live-outlook-result.json, and live-research-source-checks.json in this directory. Independent publisher URL checks returned HTTP 200 for five URLs; one government URL timed out from this host, so HTTP accessibility of that URL is unconfirmed. Search provenance for it was present. Unit fixtures remain explicitly synthetic; they are not evidence of live retrieval.

Example actual result: Water stress, negative, strength 0.6, confidence 0.65, 2030–2050, affectedMetrics C1/E1. The retrieved UNDP summaries discuss climate-related water stress and rising demand in Kazakhstan. The numerical factor parameters are scenario assumptions. Sources:
- https://www.undp.org/kazakhstan/stories/climate-change-impact-water-resources-kazakhstan
- https://www.undp.org/kazakhstan/publications/forecast-impact-climate-change-water-flow-changes-hydro-economic-basins-kazakhstan-2100

Re-run against a running app with RESEARCH_TEST_URL=http://localhost:3002 and node scripts/verify-live-research.mjs. This intentionally invokes real search and may incur provider charges.
