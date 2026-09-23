# Future Research

Configure `TAVILY_API_KEY` in the server environment to enable Tavily search. Without it, or when fewer than three factors survive validation, research returns `sourceMode: "demo"`, `status: "fallback"` and a safe failure code. `mode` remains a compatibility alias. Official calculations do not depend on research.

`POST /api/research` accepts `{ "officialResult": <completed SimulationResult> }`. Selected strategy, affected districts and categories are derived from the result to prevent contradictory client scope. Invalid requests return 400; upstream failures return 200 with demo fallback. Existing outlook calls use the configured agent too.

The live provider selects up to six relevant topics and extracts geographic, topic and trend evidence from trusted institutional search results. It rejects unsupported domains, homepage-only URLs, embedded credentials, malformed factors and numerical score predictions. Each factor has at most three canonical, deduplicated citations (18 references per response). A source may support multiple factors. Publisher pages are not independently fetched; keyword relevance is not expert assessment.

Strength, direction, confidence, metric mappings and years remain heuristic scenario assumptions in live mode. Research never forecasts Astana QoL or indicator values. National evidence is explicitly distinguished from district findings. Demo fallback factors have no fabricated citations.

Search requests have a 4.5-second timeout and one retry for network errors, HTTP 429 or 5xx, after 150ms. The overall provider deadline is 12 seconds. Successful searches are cached for 15 minutes in a bounded 100-entry process-local cache; concurrent identical queries share a request. Failures are not cached. Cache entries reset on restart and are not shared across instances. Response bodies are capped at 250KB. Only the fixed Tavily endpoint is fetched; cited URLs are not server-fetch targets.

Run `node node_modules/typescript/bin/tsc --noEmit` and `node --test src/lib/*.test.ts`. Research tests exercise three strategies using synthetic search responses, source validation, immutable results, timeout/retry/cache behavior, invalid API input and malformed-provider fallback. Real network validation requires a Tavily key and is not claimed by these fixtures.
