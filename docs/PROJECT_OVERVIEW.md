# FARSIGHT

Future Akim Strategy & Impact Governance Tool

```text
   _____    _    ____  ____ ___ ____ _   _ _____
  |  ___|  / \  |  _ \/ ___|_ _/ ___| | | |_   _|
  | |_    / _ \ | |_) \___ \| | |  _| |_| | | |
  |  _|  / ___ \|  _ < ___) | | |_| |  _  | | |
  |_|   /_/   \_\_| \_\____/___\____|_| |_| |_|

     Future Akim Strategy & Impact Governance Tool

           Understand today. Explore tomorrow.


       "Green Growth"       "Industrial-Mobility"
                  \           /
                   \         /
                    YOUR IDEA
                        |
                        v
                 Strategy Agent
                        |
                 5 initiatives
                        |
                    Validator
                 budget + rules
                        |
                        v
              2-Year Official Simulation
                   8 quarters
                        |
                        v
                Astana QoL Score
                District changes
                 AI explanation
                        :
                        :  explore further?
                        v
                 FUTURE OUTLOOK
                       / \
                      /   \
             Your plan     Research Agent
                      \   /       ^
                       \ /        |
                        +     Sources & trends
                        |
                 Scenario Engine
                        |
                        v
       2030 ---- 2035 ---- 2040 ---- 2045 ---- 2050
                        |
              Compare possible futures
              Explore the trade-offs


        Two-year results. A longer perspective.
               Scenarios, not predictions.
```

FARSIGHT helps urban planners understand not only what a decision changes in the next two years, but also what direction it can create for the city in the future.

The HackAlem case gives a clear short-term simulation: the user selects 5 initiatives, stays within a fixed budget, and sees how those decisions affect Astana's districts over 8 quarters.

FARSIGHT keeps this 2-Year Official Simulation as the core of the product.

A user can describe a strategy in natural language, for example "Industrial-Mobility First" or "Green Growth". The AI turns that idea into a valid set of 5 initiatives. The system checks the budget and constraints, applies the official effects, lags and synergies, and calculates the Astana Quality of Life Score.

This answers the original case first: what happens if we make these decisions now?

FARSIGHT then adds an optional long-term scenario layer. It uses the official 2-year result as a starting point and explores how the same strategy may behave over longer periods.

A strategy that looks strong after two years may create pressure on transport, schools, utilities or natural resources later. At the same time, an expensive infrastructure project may have limited short-term impact but become more valuable over a longer horizon.

The Future Outlook can include factors such as population growth, water stress, transport demand, infrastructure aging, climate pressure and maintenance needs. A Future Research Agent can collect these trends and turn them into inputs for scenario analysis.

The goal is not to predict one exact future. It is to compare possible development paths and make long-term trade-offs visible.

This approach also connects naturally with Kazakhstan's long-term planning horizon. The Kazakhstan-2050 Strategy introduced a national vision built around long-term development priorities and future challenges. FARSIGHT applies a similar idea at the city level: evaluate short-term decisions today, then explore their possible long-term direction separately.

The main flow is:

```text
User Strategy
-> AI Strategy Agent
-> Validator
-> 2-Year Official Simulation
-> Astana Quality of Life Score
-> AI Explanation

Optional:

2-Year Result
-> Future Research Agent
-> Long-Term Scenario Engine
-> Strategy Comparison
-> Future Outlook
```

The 2-Year Official Simulation remains the official core of the project. The long-term layer is an additional scenario-planning tool and is not presented as an exact forecast.

All official numerical results are calculated by a deterministic simulation engine. The LLM is used to understand strategy intent, generate valid options, research long-term factors, compare scenarios and explain results.

The app is built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Recharts.

Run locally:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Shipped interaction details

Generated strategies arrive validated and confirmed in the review view. Manual selections and later edits need explicit confirmation. Both Run and Outlook-first request official analysis automatically for each new official result; analysis failure preserves numerical results and permits Outlook to continue.

Comparison uses an explicit A/B picker. Named comparison commands prefill the requested pair; questions that merely mention comparison remain questions about the current result. Preparing a pair does not run the simulator.

Research auto-selects Tavily when configured, otherwise OpenAI hosted web search; local/demo mode and provider failures use labelled demo factors. Current timeouts and cache behavior are documented in [Future Research](FUTURE_RESEARCH.md). Maintenance is assumed coverage (default 0.35), with no investment-linked increase or cost model. The 2050 view explores assumptions, not predictions. See [the current product flow](../README.md#product-flow).
