# Future Research

Research supports `FARSIGHT_RESEARCH_PROVIDER=auto|tavily|openai|demo` (default: `auto`). Auto selects Tavily when `TAVILY_API_KEY` is set; otherwise it selects OpenAI hosted web search using `OPENAI_API_KEY`. Explicit provider selection requires that provider's credential. `demo` or `FARSIGHT_AI_MODE=local` disables live research. A selected provider's failure falls back to labelled demo factors, not to the other live provider.

OpenAI research uses `FARSIGHT_RESEARCH_MODEL` (default `gpt-4.1-mini`), independently of the strategy/analysis `OPENAI_MODEL`. Keep credentials server-side. Missing credentials, failures or fewer than three validated live factors return `sourceMode: "demo"`, `status: "fallback"` and a safe failure code. `mode` remains a compatibility alias. Official calculations do not depend on research.

`POST /api/research` accepts `{ "officialResult": <completed SimulationResult> }`. Strategy, districts and categories are derived from the validated result. Invalid input returns 400; provider failures normally return 200 with demo fallback. `/api/outlook` invokes the same configured agent after recomputing official state. The workspace automatically requests official analysis when Outlook-first creates a simulation result; this is separate from the outlook's scenario analysis.

The live provider selects up to six topics and extracts geographic, topic and trend evidence from trusted institutional search results. It rejects unsupported domains, homepage-only URLs, embedded credentials, malformed factors and numerical score predictions. Each factor has at most three canonical, deduplicated citations (18 references per response). OpenAI evidence URLs must also appear in completed hosted-search source records. Publisher pages are not independently fetched; keyword relevance is not expert assessment.

Strength, direction, confidence, metric mappings and years remain heuristic scenario assumptions in live mode. Research never predicts Astana QoL or indicator values. National evidence is distinguished from district findings. Demo factors have empty sources.

## Timeouts and caching

| Boundary | Current limit |
| --- | --- |
| Browser POST | 90 seconds per request, not per entire multi-request workflow |
| Strategy/analysis model | 18 seconds per call by default; `FARSIGHT_LLM_TIMEOUT_MS` accepts 1-60000 ms |
| Strategy repair | At most one extra call for invalid/malformed output; outages/refusals/timeouts fall back immediately |
| Tavily search | 4.5 seconds per attempt; one transient retry after 150 ms |
| OpenAI web search | 30 seconds per attempt; one transient retry after 150 ms |
| Research provider | 65 seconds overall |
| Research stage route guard | 70 seconds in research and outlook routes |

Transient retries cover network failures, timeouts, HTTP 429 and 5xx. Authentication, invalid request and malformed-response failures are not retried. Tavily bodies are capped at 250,000 bytes; OpenAI bodies at 500,000 bytes.

Successful searches are cached for 15 minutes; failures are not cached. Tavily has a bounded 100-query cache with identical concurrent queries coalesced. OpenAI shares one national evidence snapshot across topics and compared strategies. Caches are process-local, reset on restart and are not shared between instances. Only provider endpoints are fetched server-side, never cited URLs.

## Verification

Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Automated research fixtures cover validation, provider selection, fallback, retries, caching and unchanged official results. They are not proof of live retrieval. The historical [live integration report](live-research.md) and its JSON artifacts record an earlier live check. To perform a new live check against a running app, set `RESEARCH_TEST_URL` and run `node scripts/verify-live-research.mjs`; this invokes the configured provider.
