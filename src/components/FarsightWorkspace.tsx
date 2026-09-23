"use client";
import { useEffect, useRef, useState } from "react";
import { RequestSession } from "@/lib/request-session";
import { STRATEGY_PRESETS, presetPrompt } from "@/data/strategy-presets";
import { createPresetStrategy } from "@/lib/strategy-presets";
import type { AnalysisResponse } from "@/types/api";
import { comparisonIntent } from "@/lib/comparison-intent";
import { simulateWithAnalysis } from "@/lib/official-workflow";
import { Activity, AlertCircle, ArrowUpRight, Building2, BusFront, ChevronDown, ChevronRight, GitCompareArrows, HeartHandshake, Leaf, LoaderCircle, ShieldCheck } from "lucide-react";
import type { AnalysisReport, CopilotResponse, GeneratedStrategy, OutlookResponse, StrategyResponse } from "@/types/product";
import type { SimulationResult } from "@/lib/simulator";
import { scoreCity } from "@/lib/scoring";
import { DISTRICTS } from "@/data";
import { ComparisonPicker, type ComparisonChoice } from "./ComparisonPicker";
import { ChatSidebar } from "./ChatSidebar";
import { CategoryMetric } from "./CategoryMetric";
import { MetricCard } from "./MetricCard";
import { StrategyCard } from "./StrategyCard";
import { DecisionEditor } from "./DecisionEditor";
import { createManualStrategy } from "@/lib/manual-strategy";
import type { StrategySelection } from "@/lib/validator";
import { OfficialSimulation } from "./OfficialSimulation";
import { AnalysisPanel } from "./AnalysisPanel";
import { TrajectoryChart } from "./TrajectoryChart";
import { ScenarioRiskCard } from "./ScenarioRiskCard";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { IndicatorCode } from "@/types";

type Key = "a" | "b";
type Pending = "strategy" | "simulation" | "analysis" | "outlook" | null;
const baselineScore = scoreCity(DISTRICTS.map(district => ({ id: district.id, populationShare: district.populationShare, indicators: district.initialIndicators }))).score;
const categoryMetrics: { name: string; icon: typeof BusFront; metrics: [IndicatorCode, IndicatorCode] }[] = [
  { name: "Transport", icon: BusFront, metrics: ["T1", "T2"] },
  { name: "Ecology", icon: Leaf, metrics: ["E1", "E2"] },
  { name: "Social", icon: HeartHandshake, metrics: ["S1", "S2"] },
  { name: "Safety", icon: ShieldCheck, metrics: ["B1", "B2"] },
  { name: "Services", icon: Building2, metrics: ["C1", "C2"] },
];
async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => { throw new Error(`Server could not complete the request (${response.status}). Please try again.`); });
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}). Please try again.`);
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The request timed out. Please try again.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }

export function FarsightWorkspace() {
  const session = useRef(new RequestSession());
  const [strategies, setStrategies] = useState<StrategyResponse | null>(null);
  const [builderVersion, setBuilderVersion] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<Key, StrategySelection[]>>>({ a: [] });
  const [results, setResults] = useState<Partial<Record<Key, SimulationResult>>>({});
  const [analyses, setAnalyses] = useState<Partial<Record<Key, AnalysisReport>>>({});
  const [outlooks, setOutlooks] = useState<Partial<Record<Key, OutlookResponse>>>({});
  const [selected, setSelected] = useState<Key>("a");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonRequest, setComparisonRequest] = useState<{ pair?: [string, string]; version: number }>({ version: 0 });
  const [outlookOpen, setOutlookOpen] = useState(false);
  const busy = pending !== null;
  const current = selected === "a" ? strategies?.strategyA : strategies?.strategyB;
  const other = selected === "a" ? strategies?.strategyB : strategies?.strategyA;
  const otherKey: Key = selected === "a" ? "b" : "a";
  const result = results[selected];
  const outlook = outlooks[selected];
  const draft = drafts[selected] ?? current?.selectedMeasures ?? [];
  const dirty = drafts[selected] !== undefined;
  const anyDirty = drafts.a !== undefined || drafts.b !== undefined;
  const canUseResults = Boolean(current && result) && !anyDirty && !busy;
  useEffect(() => {
    if (results.a && !outlookOpen) document.getElementById("official-title")?.scrollIntoView({ block: "start" });
  }, [results]);

  function clearResults() { setResults({}); setAnalyses({}); setOutlooks({}); setOutlookOpen(false); }
  function reset() { session.current.reset(); setPending(null); setBuilderVersion(v => v + 1); setStrategies(null); setDrafts({ a: [] }); clearResults(); setSelected("a"); setComparisonOpen(false); setError(null); }
  function editDecisions(selections: StrategySelection[]) {
    setDrafts(previous => ({ ...previous, [selected]: selections }));
    clearResults(); setError(null);
  }
  function applyDecisions() {
    try {
      const strategy = createManualStrategy(draft, `My city strategy ${selected.toUpperCase()}`);
      setStrategies(previous => selected === 'a' ? { ...previous, strategyA: strategy } : { strategyA: previous!.strategyA, strategyB: strategy });
      setDrafts(previous => { const next = { ...previous }; delete next[selected]; return next; });
      clearResults(); setError(null);
    } catch (failure) { setError(errorMessage(failure)); }
  }
  function openComparison(pair?: [string, string]) {
    if (!canUseResults) return;
    setComparisonRequest(previous => ({ pair, version: previous.version + 1 }));
    setComparisonOpen(true);
    window.requestAnimationFrame(() => {
      const picker = document.getElementById("comparison-picker");
      picker?.scrollIntoView({ behavior: "smooth", block: "start" });
      picker?.focus({ preventScroll: true });
    });
  }
  async function generate(text: string) {
    const comparison = comparisonIntent(text);
    if (comparison) {
      if (!canUseResults) return "Run the 2-Year Official Simulation for your confirmed strategy before comparing strategies.";
      openComparison(comparison.pair);
      return "Choose strategy A and strategy B in the comparison form, then confirm the pair. Nothing has been replaced or compared yet.";
    }
    const token = session.current.begin();
    if (token === undefined) return "A request is already in progress.";
    setPending("strategy"); setError(null);
    try {
      const preset = STRATEGY_PRESETS.find(item => presetPrompt(item) === text.trim());
      const data: CopilotResponse = preset ? { kind: "strategy", strategyA: createPresetStrategy(preset) } : await post<CopilotResponse>("/api/copilot", { message: text, ...(!anyDirty && current ? { selectedMeasures: current.selectedMeasures, ...(other ? { comparisonMeasures: other.selectedMeasures } : {}) } : {}) });
      if (!session.current.isCurrent(token)) return "This session was reset.";
      if (data.kind === "answer") return data.message;
      clearResults(); setStrategies(data); setDrafts({}); setBuilderVersion(v => v + 1); setSelected("a"); setComparisonOpen(false);
      const names = [data.strategyA.name, data.strategyB?.name].filter(Boolean).join(" and ");
      return `${names} ${data.strategyB ? "are" : "is"} ready. Each strategy has five validated catalog measures. Review the measures and budget, then run the 2-Year Official Simulation. ${data.strategyA.generation.note}`;
    } catch (failure) { if (session.current.isCurrent(token)) setError(errorMessage(failure)); throw failure; }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function compare(choices: [ComparisonChoice, ComparisonChoice]) {
    if (busy || (strategies && anyDirty)) return;
    const token = session.current.begin();
    if (token === undefined) return;
    setPending("strategy"); setError(null);
    try {
      const resolve = async (choice: ComparisonChoice) => "strategy" in choice ? choice.strategy : (await post<StrategyResponse>("/api/strategy", { intent: choice.intent })).strategyA;
      const [strategyA, strategyB] = await Promise.all(choices.map(resolve));
      if (!session.current.isCurrent(token)) return;
      const signature = (strategy: GeneratedStrategy) => JSON.stringify(strategy.selectedMeasures.map(measure => [measure.measureId, measure.districtId ?? ""]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
      if (signature(strategyA) === signature(strategyB)) throw new Error("Both strategies contain the same decisions. Choose different priorities or districts to compare.");
      setStrategies({ strategyA, strategyB }); setDrafts({}); setBuilderVersion(v => v + 1);
      clearResults(); setSelected("a"); setComparisonOpen(false);
      window.requestAnimationFrame(() => document.getElementById("strategies-title")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (failure) { if (session.current.isCurrent(token)) setError(errorMessage(failure)); }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function createOfficialResults(token: number, keys: Key[]) {
    if (!strategies) return;
    const completed = await Promise.allSettled(keys.map(async key => {
      const strategy = key === "a" ? strategies.strategyA : strategies.strategyB;
      const comparison = key === "a" ? strategies.strategyB : strategies.strategyA;
      if (!strategy) return;
      await simulateWithAnalysis({
        post, selectedMeasures: strategy.selectedMeasures, comparisonMeasures: comparison?.selectedMeasures,
        isCurrent: () => session.current.isCurrent(token),
        onResult: value => {
          setResults(previous => ({ ...previous, [key]: value }));
          setPending(previous => previous === "simulation" ? "analysis" : previous);
        },
        onAnalysis: value => setAnalyses(previous => ({ ...previous, [key]: value })),
        onAnalysisError: () => setError("An explanation is unavailable. Your official numerical results are ready. Use Explain to retry."),
      });
    }));
    const failed = completed.find(item => item.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  async function simulate() {
    if (!strategies || busy || anyDirty) return;
    const token = session.current.begin();
    if (token === undefined) return;
    setPending("simulation"); setError(null);
    try {
      clearResults();
      await createOfficialResults(token, strategies.strategyB ? ["a", "b"] : ["a"]);
    } catch (failure) { if (session.current.isCurrent(token)) setError(errorMessage(failure)); }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function explain(question?: string) {
    if (!current || !result) throw new Error("Run the 2-Year Official Simulation before asking about the result.");
    const token = session.current.begin();
    if (token === undefined) return "A request is already in progress.";
    setPending("analysis"); setError(null);
    try {
      const data = await post<AnalysisResponse>("/api/analyze", { selectedMeasures: current.selectedMeasures, ...(question ? { question } : {}), ...(other ? { comparisonMeasures: other.selectedMeasures } : {}) });
      if (!session.current.isCurrent(token)) return "This session was reset.";
      setAnalyses(previous => ({ ...previous, [selected]: data.analysis }));
      return data.analysis.answer || data.analysis.summary;
    } catch (failure) { if (session.current.isCurrent(token)) setError(`Explanation unavailable. Your official result is still available. ${errorMessage(failure)}`); throw failure; }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function loadOutlook() {
    if (!canUseResults || !current) return;
    setOutlookOpen(true);
    window.requestAnimationFrame(() => document.getElementById("outlook-content")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (outlooks[selected]) return;
    const token = session.current.begin();
    if (token === undefined) return;
    setPending("outlook"); setError(null);
    try {
      const missing = ([selected, ...(other ? [otherKey] : [])] as Key[]).filter(key => !results[key]);
      await createOfficialResults(token, missing);
      if (!session.current.isCurrent(token)) return;
      const data = await post<OutlookResponse>("/api/outlook", { selectedMeasures: current.selectedMeasures, ...(other ? { comparisonMeasures: other.selectedMeasures } : {}) });
      if (!session.current.isCurrent(token)) return;
      setOutlooks(previous => ({ ...previous, [selected]: data }));
    } catch (failure) { if (session.current.isCurrent(token)) setError(`Future Outlook unavailable. Please retry. ${errorMessage(failure)}`); }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  function select(key: Key) { if (busy) return; setSelected(key); setOutlookOpen(false); setError(null); }
  async function showExplanation() {
    if (!analyses[selected]) {
      try { await explain(); } catch { return; }
    }
    window.requestAnimationFrame(() => {
      const panel = document.getElementById("official-analysis");
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      panel?.focus({ preventScroll: true });
    });
  }
  const outlookAction = <Button disabled={!canUseResults} aria-expanded={outlookOpen} aria-controls="outlook-content" onClick={() => void loadOutlook()}>{pending === "outlook" ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}Explore outlook to 2050</Button>;
  const officialSimulation = <OfficialSimulation result={result} comparison={results[otherKey]} name={current?.name} comparisonName={other?.name} selected={selected} hasStrategy={Boolean(strategies) && !anyDirty} hasComparison={Boolean(strategies?.strategyB)} busy={busy} pending={pending} onRun={() => void simulate()} onExplain={() => void showExplanation()} />;

  return <div className="dashboard-shell farsight-workspace">
    <ChatSidebar canCompare={canUseResults} onCompare={() => openComparison()} onOutlook={() => void loadOutlook()} busy={busy} canExplain={Boolean(result)} onGenerate={generate} onExplain={explain} onReset={reset} strategyBuilder={<DecisionEditor key={`${selected}-${builderVersion}`} selections={draft} busy={busy} dirty={dirty} variant={selected} onChange={editDecisions} onApply={applyDecisions} onRun={() => void simulate()} canRun={Boolean(strategies) && !anyDirty} />} />
    <main className="workspace">
      <div className="workspace-content"><div className={`workspace-hero${strategies ? "" : " workspace-hero-welcome"}`}><div className="page-heading"><div><div className="eyebrow city-eyebrow"><span className="status-dot" />ASTANA · A BETTER TOMORROW</div><h1>Small decisions. <span>A better city.</span></h1><p>Choose five initiatives with a budget of 100. See how your decisions change the city.</p></div>{result && <div className="heading-actions"><Button variant="outline" disabled={!canUseResults} onClick={() => openComparison()}>Compare strategies <ArrowUpRight size={16} /></Button>{outlookAction}</div>}</div>
        {comparisonOpen && <ComparisonPicker key={comparisonRequest.version} initialIntents={comparisonRequest.pair} strategies={strategies} busy={busy} dirty={anyDirty} onConfirm={compare} onCancel={() => setComparisonOpen(false)} />}
        <div className="kpi-grid" aria-label="Official model overview">
          <MetricCard label="Current Astana QoL" value={baselineScore.toFixed(2)} note="2026 · calculated official baseline" icon={Activity} />
          <MetricCard label="Strategy A · 2028 QoL" value={results.a ? results.a.finalScore.toFixed(2) : "—"} note={results.a ? "Official two-year result" : "Awaiting 2-Year Official Simulation"} icon={ArrowUpRight} tone="a" />
          <MetricCard label="Strategy B · 2028 QoL" value={results.b ? results.b.finalScore.toFixed(2) : "—"} note={results.b ? "Official two-year result" : "Awaiting comparison simulation"} icon={ArrowUpRight} tone="b" />
        </div>
        </div>
        <ol className="flow-steps" aria-label="Strategy workflow">
          <li className={!strategies || anyDirty ? "active" : "complete"} aria-current={!strategies || anyDirty ? "step" : undefined}><b className="step-number">1</b><span>Choose<small>Five decisions · 100 budget</small></span></li>
          <li className={result ? "complete" : strategies && !anyDirty ? "active" : ""} aria-current={!result && strategies && !anyDirty ? "step" : undefined}><b className="step-number">2</b><span>Run 2-year simulation<small>Official result · 2028</small></span></li>
          <li className={analyses[selected] ? "complete" : result ? "active" : ""} aria-current={result && !analyses[selected] ? "step" : undefined}><b className="step-number">3</b><span>Explain<small>Understand the impact</small></span></li>
          <li className="optional-step"><b className="step-number">4</b><span>Explore future<small>Optional · 2050 outlook</small></span></li>
        </ol>
        {error && <div className="error-banner" role="alert"><AlertCircle size={17} /><div><strong>Request could not be completed</strong><p>{error}</p></div><button aria-label="Dismiss error" onClick={() => setError(null)}>×</button></div>}
        {pending === "strategy" && <Card className="loading-state" role="status"><LoaderCircle className="spin" size={20} /><span>Selecting catalog measures and checking official rules…</span></Card>}
        {anyDirty && strategies && <p className="decision-help" role="status">There are unapplied decisions. Apply each edited strategy before running a comparison.</p>}
        {result && <>
          {strategies?.strategyB && <div className="result-strategy-switch" role="group" aria-label="Select official result"><span>View official result</span><Button variant="outline" size="sm" disabled={busy} aria-pressed={selected === "a"} onClick={() => select("a")}>A · {strategies.strategyA.name}</Button><Button variant="outline" size="sm" disabled={busy} aria-pressed={selected === "b"} onClick={() => select("b")}>B · {strategies.strategyB.name}</Button></div>}
          {officialSimulation}
          {analyses[selected] && <section id="official-analysis" tabIndex={-1} aria-label="Official result explanation"><AnalysisPanel report={analyses[selected]} /></section>}
        </>}
        {strategies && <section aria-labelledby="strategies-title"><div className="comparison-heading"><h2 id="strategies-title"><GitCompareArrows size={16} />{anyDirty ? "Last confirmed decisions · edits pending" : strategies.strategyB ? "Strategy comparison" : "Your validated strategy"}</h2><span>5 measures · up to 100 budget · at most 2 per category</span></div><div className={`strategy-grid ${strategies.strategyB ? "" : "single-strategy"}`}><StrategyCard variant="a" strategy={strategies.strategyA} score={results.a?.finalScore} selected={selected === "a"} disabled={busy} onSelect={() => select("a")} />{strategies.strategyB && <StrategyCard variant="b" strategy={strategies.strategyB} score={results.b?.finalScore} selected={selected === "b"} disabled={busy} onSelect={() => select("b")} />}</div>
          {result && <div className="strategy-next-actions"><Button variant="outline" disabled={!canUseResults} onClick={() => openComparison()}><GitCompareArrows size={14} />Choose two strategies to compare</Button>{outlookAction}</div>}
        </section>}
        {strategies && !result && officialSimulation}
        {result && <section className="outlook-section" aria-labelledby="outlook-title"><button id="explore-2050" className="outlook-toggle" disabled={!canUseResults} aria-expanded={outlookOpen} aria-controls="outlook-content" onClick={() => outlookOpen ? setOutlookOpen(false) : void loadOutlook()}><span>{outlookOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}<span><strong id="outlook-title">Explore future <span className="outlook-optional">Optional</span></strong><small>{current && result && !anyDirty ? "Future Outlook · 2050 research factors and long-term assumptions" : "Run the 2-Year Official Simulation to explore 2050"}</small></span></span><span className="subtle-badge">Separate scenario model</span></button>
          {outlookOpen && <div id="outlook-content" className="outlook-content">{pending === "outlook" && <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} />Running the research agent and calculating your strategy through 2050…</div>}
            {!outlook && pending !== "outlook" && <Button variant="outline" onClick={() => void loadOutlook()} disabled={!canUseResults}>Retry outlook</Button>}
            {outlook && current && <><div className="research-notice"><span className="subtle-badge">{outlook.research.mode === "demo" ? "Demo research factors" : "Live research factors"}</span><p>{outlook.research.notice}</p><p>The scenario indicator index is separate from the official Astana Quality of Life Score. The official 2028 result remains {result?.finalScore.toFixed(2)}.</p></div>
              <section className="primary-trajectory" aria-label="Optional 2050 scenario visualization">
                <TrajectoryChart scenario={outlook.scenario} comparison={outlook.comparisonScenario} name={current.name} comparisonName={other?.name} />
                <section className="category-section" aria-label="Scenario category indicators"><div className="category-section-heading"><h2>Scenario category indicators</h2><span>Strategy {selected.toUpperCase()} · 2026 reference → 2050 scenario · average of two indicators</span></div><div className="category-grid">{categoryMetrics.map(category => {
                  const baseline = outlook.scenario.checkpoints.find(point => point.year === 2026)!;
                  const future = outlook.scenario.checkpoints.find(point => point.year === 2050)!;
                  const average = (indicators: Record<IndicatorCode, number>) => Number(((indicators[category.metrics[0]] + indicators[category.metrics[1]]) / 2).toFixed(1));
                  return <CategoryMetric key={category.name} name={category.name} icon={category.icon} current={average(baseline.cityIndicators)} future={average(future.cityIndicators)} trend={outlook.scenario.checkpoints.map(point => average(point.cityIndicators))} />;
                })}</div></section>
              </section>
              <div className="comparison-heading risk-heading"><h2>External factors &amp; research</h2><span>{outlook.research.provider}</span></div><div className="risk-grid">{outlook.research.factors.map(factor => <ScenarioRiskCard key={factor.id} factor={factor} demo={outlook.research.mode === "demo"} />)}</div>
              <AnalysisPanel report={outlook.analysis} />
              <details className="assumptions-details"><summary>Scenario assumptions &amp; transparent formula</summary><p>Each next indicator = current value + remaining measure effect + lifecycle effect + baseline trend + external factor impact − decay, limited to 0–100.</p><ul>{outlook.scenario.assumptions.description.map((description, index) => <li key={index}>{description}</li>)}</ul><dl className="assumptions-list"><div><dt>Configuration</dt><dd>{outlook.scenario.assumptions.version}</dd></div><div><dt>Remaining effect window</dt><dd>{outlook.scenario.assumptions.remainingEffectYears} years</dd></div><div><dt>Annual decay rate</dt><dd>{(outlook.scenario.assumptions.annualDecayRate * 100).toFixed(2)}%</dd></div><div><dt>Baseline maintenance coverage</dt><dd>{(outlook.scenario.assumptions.baselineMaintenanceCoverage * 100).toFixed(0)}%</dd></div><div><dt>Factor ramp</dt><dd>{outlook.scenario.assumptions.factorRampYears} years</dd></div></dl><div className="table-scroll"><table className="district-table"><caption>Additional annual lifecycle effects</caption><thead><tr><th>Category</th><th>Annual fraction of catalog effect</th><th>Half-life</th></tr></thead><tbody>{Object.entries(outlook.scenario.assumptions.lifecycleByCategory).map(([category, lifecycle]) => <tr key={category}><th scope="row">{category}</th><td>{(lifecycle.annualEffectFraction * 100).toFixed(1)}%</td><td>{lifecycle.halfLifeYears} years</td></tr>)}</tbody></table></div></details>
              <details className="assumptions-details"><summary>Inspect complete scenario configuration</summary><pre className="scenario-json" style={{ maxHeight: 400, overflow: "auto", fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(outlook.scenario.assumptions, null, 2)}</pre></details>
              <details className="assumptions-details"><summary>Inspect annual scenario calculation trace</summary><p>Every district and indicator includes its value before and after the update, the remaining and lifecycle measure effects, baseline trend, external factors, decay and clamping adjustment. Decay is subtracted; the other change terms are added.</p><div className="table-scroll"><table className="district-table"><caption>Strategy {selected.toUpperCase()} · annual scenario indicator index</caption><thead><tr><th>Year</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>{outlook.scenario.annualSteps.map(step => <tr key={step.year}><th scope="row">{step.year}</th><td>{step.indexBefore.toFixed(3)}</td><td>{step.indexAfter.toFixed(3)}</td><td>{(step.indexAfter - step.indexBefore).toFixed(3)}</td></tr>)}</tbody></table></div><details><summary>All calculation terms by year, district and indicator</summary><pre className="scenario-json" style={{ maxHeight: 500, overflow: "auto", fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(outlook.scenario.annualSteps, null, 2)}</pre></details></details>
            </>}
          </div>}
        </section>}<footer className="workspace-footer"><span>FARSIGHT · Future Akim Strategy &amp; Impact Governance Tool</span><span>Official results · optional scenario research</span></footer>
      </div>
    </main>
  </div>;
}
