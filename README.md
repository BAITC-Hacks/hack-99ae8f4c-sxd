# FARSIGHT

Future Akim Strategy & Impact Governance Tool. A Next.js application for the official HackAlem two-year simulation and a separate optional 2050 scenario outlook.

## Run and verify

Install Node.js 24 LTS and pnpm, and ensure both are available on your PATH. Node.js 24 supports the built-in TypeScript test runner used by this project. Use pnpm with the committed lockfile for reproducible dependency installation.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). No API key, separate backend, or database is required for local operation.

Development uses `.next-dev/`; production builds use `.next/`, so building does not overwrite the running development server's files. Verify the project:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

To serve the completed production build at the same address, stop the development server with Ctrl+C first:

```powershell
pnpm start
```

## Project structure

```text
.github/           GitHub Actions, issue and pull request templates
docs/              Research, model documentation and integration review
scripts/           Development and integration helpers
src/
  app/             Next.js page, layout, global styles and API routes
  assets/fonts/    Local font files
  components/      Application interface
    ui/            Shared UI primitives
  data/            Official catalogue, district data and scenario assumptions
  lib/             Simulation, validation, analysis and colocated *.test.ts tests
    agents/        Strategy, research, analysis and model integration
  types/           Shared TypeScript contracts
```

Root files contain dependency manifests, framework/TypeScript configuration and this guide. `.env.example` documents optional environment settings. Local secrets stay in ignored `.env` files. `node_modules/`, `.next/`, `.next-dev/` and `*.tsbuildinfo` are generated locally and excluded from version control.

See the [documentation index](docs/README.md) and [contribution guide](CONTRIBUTING.md).
GitHub Actions runs tests, type checking and a production build on pull requests and pushes to `main`.

## Product flow

1. Build your strategy in the expanded left-hand chat. Choose “Let’s start” to open the initiative picker, then continue to review and confirmation before simulation. You can go back to edit without losing choices. Alternatively send a strategy prompt at any step; its generated portfolio opens at the review stage. Open the starting district data, browse all five categories and select exactly five catalogue measures. Choose a district for each district-level measure; city measures apply everywhere.
2. Watch the spent/remaining budget out of 100. The editor blocks additions exceeding budget, five decisions or two measures per category. Missing districts and incompatibilities prevent confirmation. Unspent budget is allowed and gives no bonus.
3. Confirm your decisions, then choose **Run my simulation** in the chat or **Official 2-Year Simulation** in the workspace. Inspect the Astana QoL Score, district changes and automatic explanation. Editing any choice clears old results and requires confirmation before another run.
4. Alternatively ask the Copilot to propose a starting set, e.g. “Create a Green Growth strategy and compare it with Industrial-Mobility.” You can edit its exact measures and districts in the same chat editor. Switch the selected A/B strategy to edit each separately. Ask about the calculated result using **Ask about result**.
5. Optionally open **2050 Scenario Outlook** for demo research factors, trajectories and explicit assumptions. This section never changes the official result.

## Official source of truth

`src/data/` contains the existing district baselines, catalogue, weights, rules and interactions. `src/lib/official.ts` adapts those data to the existing simulator and validates every official request. No LLM calculates a score.

- Fixed budget cap **100**; exactly **5** unique measures; at most **2** per category.
- District selections require a known district; city selections cannot include a district.
- Catalogue incompatibilities and synergies are reused.
- **H = 8 quarters**. Each catalogue effect is scaled by `(8 - lag) / 8`. Effects are summed then clamped to `[0,100]`; synergies are applied and clamped afterward.
- District score is the sum of indicators multiplied by the supplied official weights.
- **Astana QoL = 0.7 × population-weighted district average + 0.3 × minimum district score − count of district indicators below 40.** No intermediate rounding. The final formula is not artificially clamped; its penalty can make it negative.
- Contributions are leave-one-out marginal score differences including lost synergies; they need not sum to the total change. These attribution calculations are internal, while official user strategies must contain five measures.

The retained generic `simulateStrategy` supports synthetic tests and internal attribution. Application routes call `runOfficialSimulation` to enforce all official strategy rules.

## Three agent roles

- **Strategy Agent** (`src/lib/agents/strategy.ts`) interprets intent, requests a structured model proposal when configured, validates it, and repairs invalid proposals through deterministic selection. Without a usable model it uses English/Russian keyword priorities; the UI identifies this local mode. Explicit district names constrain local district targets. This fallback is heuristic matching, not unrestricted language understanding.
- **Future Research Agent** (`src/lib/agents/future-research.ts`) supports optional Tavily search through the outlook and research routes. Configure `TAVILY_API_KEY` to enable live evidence; missing credentials, failures or insufficient evidence produce explicitly labelled demo factors with empty sources. Even in live mode, factor strengths, timing and confidence remain heuristic scenario assumptions, not calibrated predictions. See [future research documentation](docs/FUTURE_RESEARCH.md) for provider details.
- **Analysis Agent** (`src/lib/agents/analysis.ts`) derives numerical evidence from calculated changes, negative trade-offs, marginal contributions, synergies, district gaps, and validated one-measure alternatives. A configured LLM selects existing evidence entries and orders sections for the question; it cannot author new factual prose or overwrite calculated scores, sections or recommendations. Without a usable model, the calculated explanation remains available. Local mode orders sections by topic, including common Russian questions. Outlook analysis explains factor timing, metrics and trace-based divergence.

Optional server environment (`.env.local`; never use `NEXT_PUBLIC_*` for secrets):

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
# auto uses a model when a usable key exists; local forces offline operation
FARSIGHT_AI_MODE=auto
# Optional live trend research; absent or unusable credentials use demo factors
TAVILY_API_KEY=your_tavily_api_key_here
```

No key is required. Failures/timeouts fall back to labelled local operation. The server uses the [OpenAI Responses API structured output format](https://developers.openai.com/api/docs/guides/structured-outputs) with `store: false`, without an agent framework.

## Separate 2050 engine

`src/lib/outlook.ts` seeds from the **exact official 2028 indicator state**. The 2026 point is a baseline reference. It updates annually beginning in 2029 and reports 2026, 2028, 2030, 2035, 2040, 2045 and 2050.

All coefficients and lifecycle assumptions live in `src/data/long-term-assumptions.ts`:

```text
next indicator = clamp(current indicator
  + remaining measure effect + long-term lifecycle effect
  + baseline demand trend + external factor impact - decay)
```

Unimplemented catalogue effects are applied once over the configured completion window. Already realized effects and synergies are not applied again. Maintenance and mitigation depend on selected effects. Factors ramp only during their active years. Annual traces record every formula term and clamp adjustment for every district indicator.

The **Scenario indicator index** is a population-weighted equal-indicator average, separate from official QoL weights and the critical-indicator penalty. It is not an official hackathon score or calibrated forecast. Compared strategies face the same union of relevant research factors and the same assumptions. Population shares stay fixed; no additional measures or budget are assumed.

## API contracts

All endpoints accept/return JSON. Simulation, analysis and outlook recompute official state server-side from selections; client-supplied scores are ignored. The standalone research endpoint accepts a structurally validated completed official result as research context and does not calculate an official score.

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/copilot` | `{ message }` | `{ kind: "answer", message }` or `{ kind: "strategy", strategyA, strategyB? }` |
| `POST /api/strategy` | `{ intent, compareWith? }` | `{ strategyA, strategyB? }` |
| `POST /api/simulate` | `{ selectedMeasures }` | `{ result }` |
| `POST /api/analyze` | `{ selectedMeasures, comparisonMeasures?, question? }` | `{ analysis }` |
| `POST /api/outlook` | `{ selectedMeasures, comparisonMeasures? }` | `{ research, scenario, comparisonScenario?, analysis }` |
| `POST /api/research` | `{ officialResult }` | Structured live research or labelled demo fallback |

A selection is `{ measureId: "M1", districtId: "nura" }`, or `{ measureId: "M2" }` for city scope. Malformed bodies return 400; rule violations return 422 with structured validation errors.

Shared contracts, including `StrategyComparison`, are in `src/types/product.ts`; scenario contracts are in `src/types/outlook.ts`. No database, authentication, queues or microservices are required.

## Acceptance walkthrough

In the chat select M7, M8 and M10 in Nura, M12 citywide, and M5 in Saryarka. Confirm the five decisions: cost is 95 and remaining budget is 5. Run the simulation: the displayed baseline is 52.56 and final QoL is 56.54, with the M10 + M12 synergy. Remove a measure: previous results disappear and simulation is blocked until five valid decisions are confirmed again. Change the selected district or a measure and rerun to compare the effect. The automated suite covers manual input preservation, invalid portfolios and changed outcomes as well as the official engine and API rules.

General Copilot questions currently use English/Russian pattern matching, rather than a full conversational planner. The interactive catalogue is the authoritative way to make precise edits. Choices are held in page memory; reloading starts a new session. The optional 2050 outlook uses live trend evidence when configured and available, otherwise labelled demo factors; scenario coefficients remain assumptions in both modes.
