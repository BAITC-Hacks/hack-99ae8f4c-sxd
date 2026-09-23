```text
██████╗  █████╗ ██████╗ ███████╗██╗ ██████╗ ██╗  ██╗████████╗
██╔════╝ ██╔══██╗██╔══██╗██╔════╝██║██╔════╝ ██║  ██║╚══██╔══╝
█████╗   ███████║██████╔╝███████╗██║██║  ███╗███████║   ██║
██╔══╝   ██╔══██║██╔══██╗╚════██║██║██║   ██║██╔══██║   ██║
██║      ██║  ██║██║  ██║███████║██║╚██████╔╝██║  ██║   ██║
╚═╝      ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝

        Future Akim Strategy & Impact Governance Tool
                   ASTANA · KAZAKHSTAN
```

# FARSIGHT

Future Akim Strategy & Impact Governance Tool

FARSIGHT is an AI-powered urban strategy simulator for Astana.

It helps users evaluate how five urban decisions affect city districts over the official two-year horizon across transport, ecology, social infrastructure, safety and city services.

The system follows the HackAlem budget and rules, validates selected initiatives, applies implementation lags and synergies, and calculates the Astana Quality of Life Score.

The main goal is to provide a clear short-term view first, then allow users to explore the same strategy over a longer horizon.

The optional long-term layer extends the two-year result into scenario planning under different assumptions and external pressures. It is not presented as an exact forecast.

This connects naturally with the Kazakhstan-2050 planning horizon and the idea of evaluating today’s decisions from a longer strategic perspective.

FARSIGHT uses three AI agents.

The Strategy Agent turns natural-language goals such as “Green Growth” or “Industrial-Mobility First” into a valid set of five initiatives.

The Future Research Agent gathers long-term factors such as population growth, water stress, transport demand, infrastructure aging and climate pressure.

The Analysis Agent explains results, compares strategies, highlights trade-offs and suggests improvements.

All official numerical results are calculated by deterministic code, not by the LLM.

The long-term scenario model is kept separate from the official two-year simulation and starts from its final state.

The project is built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Recharts. AI functionality uses NVIDIA / LLM APIs.

Run locally:

```bash
npm install
npm run dev
```
