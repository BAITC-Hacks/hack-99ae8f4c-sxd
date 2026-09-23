"use client";
import { useEffect, useRef, useState } from "react";
import { RequestSession } from "@/lib/request-session";
import type { AnalysisResponse, SimulationResponse } from "@/types/api";
import { Activity, AlertCircle, ArrowRight, ArrowUpRight, Building2, BusFront, ChevronDown, ChevronRight, GitCompareArrows, HeartHandshake, Landmark, Layers3, Leaf, LoaderCircle, ShieldCheck } from "lucide-react";
import type { AnalysisReport, CopilotResponse, GeneratedStrategy, OutlookResponse, StrategyResponse } from "@/types/product";
import type { SimulationResult } from "@/lib/simulator";
import { scoreCity } from "@/lib/scoring";
import { DISTRICTS } from "@/data";
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
  const [comparisonInput, setComparisonInput] = useState("");
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
  useEffect(() => {
    if (results.a) document.getElementById("official-title")?.scrollIntoView({ block: "start" });
  }, [results]);

  function clearResults() { setResults({}); setAnalyses({}); setOutlooks({}); setOutlookOpen(false); }
  function reset() { session.current.reset(); setPending(null); setBuilderVersion(v => v + 1); setStrategies(null); setDrafts({ a: [] }); clearResults(); setSelected("a"); setComparisonInput(""); setError(null); }
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
  async function generate(text: string) {
    const token = session.current.begin();
    if (token === undefined) return "A request is already in progress.";
    setPending("strategy"); setError(null);
    try {
      const data = await post<CopilotResponse>("/api/copilot", { message: text, ...(!anyDirty && current ? { selectedMeasures: current.selectedMeasures, ...(other ? { comparisonMeasures: other.selectedMeasures } : {}) } : {}) });
      if (!session.current.isCurrent(token)) return "This session was reset.";
      if (data.kind === "answer") return data.message;
      clearResults(); setStrategies(data); setDrafts({}); setBuilderVersion(v => v + 1); setSelected("a"); setComparisonInput("");
      const names = [data.strategyA.name, data.strategyB?.name].filter(Boolean).join(" and ");
      return `${names} ${data.strategyB ? "are" : "is"} ready. Each strategy has five validated catalog measures. Review the measures and budget, then run the Official 2-Year Simulation. ${data.strategyA.generation.note}`;
    } catch (failure) { if (session.current.isCurrent(token)) setError(errorMessage(failure)); throw failure; }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function compare() {
    const comparisonIntent = comparisonInput.trim();
    if (!strategies || !comparisonIntent || busy || anyDirty) return;
    const token = session.current.begin();
    if (token === undefined) return;
    setPending("strategy"); setError(null);
    try {
      const data = await post<StrategyResponse>("/api/strategy", { intent: comparisonIntent });
      if (!session.current.isCurrent(token)) return;
      // Keep the current strategy byte-for-byte: only the alternative is generated.
      setStrategies({ strategyA: strategies.strategyA, strategyB: data.strategyA });
      clearResults(); setSelected("a"); setComparisonInput("");
    } catch (failure) { if (session.current.isCurrent(token)) setError(errorMessage(failure)); }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function simulate() {
    if (!strategies || busy || anyDirty) return;
    const token = session.current.begin();
    if (token === undefined) return;
    setPending("simulation"); setError(null);
    try {
      const simulateOne = (strategy: GeneratedStrategy) => post<SimulationResponse>("/api/simulate", { selectedMeasures: strategy.selectedMeasures });
      const [a, b] = await Promise.all([simulateOne(strategies.strategyA), strategies.strategyB ? simulateOne(strategies.strategyB) : Promise.resolve(undefined)]);
      if (!session.current.isCurrent(token)) return;
      setAnalyses({}); setOutlooks({}); setOutlookOpen(false);
      setResults({ a: a.result, ...(b ? { b: b.result } : {}) });
      setPending("analysis");
      const analyzeOne = (strategy: GeneratedStrategy, comparison?: GeneratedStrategy) => post<AnalysisResponse>("/api/analyze", { selectedMeasures: strategy.selectedMeasures, ...(comparison ? { comparisonMeasures: comparison.selectedMeasures } : {}) });
      const [analysisA, analysisB] = await Promise.allSettled([analyzeOne(strategies.strategyA, strategies.strategyB), strategies.strategyB ? analyzeOne(strategies.strategyB, strategies.strategyA) : Promise.resolve(undefined)]);
      if (!session.current.isCurrent(token)) return;
      setAnalyses({ ...(analysisA.status === 'fulfilled' && analysisA.value ? { a: analysisA.value.analysis } : {}), ...(analysisB.status === 'fulfilled' && analysisB.value ? { b: analysisB.value.analysis } : {}) });
      if (analysisA.status === 'rejected' || analysisB.status === 'rejected') setError("An explanation is unavailable. Your official numerical results are ready. Use Explain to retry.");
    } catch (failure) { if (session.current.isCurrent(token)) setError(errorMessage(failure)); }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function explain(question?: string) {
    if (!current || !result) throw new Error("Run the official simulation before asking about the result.");
    const token = session.current.begin();
    if (token === undefined) return "A request is already in progress.";
    setPending("analysis"); setError(null);
    try {
      const data = await post<AnalysisResponse>("/api/analyze", { selectedMeasures: current.selectedMeasures, ...(question ? { question } : {}), ...(other ? { comparisonMeasures: other.selectedMeasures } : {}) });
      if (!session.current.isCurrent(token)) return "This session was reset.";
      setAnalyses(previous => ({ ...previous, [selected]: data.analysis }));
      return [data.analysis.answer || data.analysis.summary, ...data.analysis.sections.slice(0, 2).map(section => `${section.title}: ${section.body}`)].join('\n\n');
    } catch (failure) { if (session.current.isCurrent(token)) setError(`Explanation unavailable. Your official result is still available. ${errorMessage(failure)}`); throw failure; }
    finally { if (session.current.finish(token)) setPending(null); }
  }
  async function loadOutlook() {
    if (!current || !result || busy) return;
    setOutlookOpen(true);
    if (outlooks[selected]) return;
    const token = session.current.begin();
    if (token === undefined) return;
    setPending("outlook"); setError(null);
    try {
      const data = await post<OutlookResponse>("/api/outlook", { selectedMeasures: current.selectedMeasures, ...(other ? { comparisonMeasures: other.selectedMeasures } : {}) });
      if (!session.current.isCurrent(token)) return;
      setOutlooks(previous => ({ ...previous, [selected]: data }));
    } catch (failure) { if (session.current.isCurrent(token)) setError(`Future Outlook unavailable. Your official result is still available. ${errorMessage(failure)}`); }
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
  const officialSimulation = <OfficialSimulation result={result} comparison={results[otherKey]} name={current?.name} comparisonName={other?.name} selected={selected} hasStrategy={Boolean(strategies) && !anyDirty} hasComparison={Boolean(strategies?.strategyB)} busy={busy} pending={pending} onRun={() => void simulate()} onExplain={() => void showExplanation()} />;

  return <div className="dashboard-shell farsight-workspace">
    <ChatSidebar busy={busy} canExplain={Boolean(result)} onGenerate={generate} onExplain={explain} onReset={reset} strategyBuilder={<DecisionEditor key={`${selected}-${builderVersion}`} selections={draft} busy={busy} dirty={dirty} variant={selected} onChange={editDecisions} onApply={applyDecisions} onRun={() => void simulate()} canRun={Boolean(strategies) && !anyDirty} />} />
    <main className="workspace"><header className="workspace-header"><div className="breadcrumb"><Landmark size={14} /><span>Astana</span><ChevronRight size={12} /><strong>Strategy workspace</strong></div><span className="preview-indicator"><span className="status-dot" />Official model connected</span></header>
      <div className="workspace-content"><div className="page-heading"><div><div className="eyebrow city-eyebrow"><span className="status-dot" />ASTANA · A BETTER TOMORROW</div><h1>Small decisions.<br /><span>A better city.</span></h1><p>Choose five initiatives with a budget of 100. See how your decisions change the city.</p></div><div className="heading-actions"><div className="scenario-badge"><Layers3 size={14} />Planning horizon · 2026–2028</div>{!strategies && <Button disabled={busy} onClick={() => void generate('Create an Industrial-Mobility strategy and compare it with Green Growth.').catch(() => undefined)}>Create a comparison <ArrowUpRight size={16} /></Button>}{result && <Button variant="outline" disabled={busy} onClick={() => outlookOpen ? setOutlookOpen(false) : void loadOutlook()}>{outlookOpen ? "Hide 2050 outlook" : "Explore 2050 outlook"}<ArrowUpRight size={16} /></Button>}</div></div>
        <div className="kpi-grid" aria-label="Official model overview">
          <MetricCard label="Current Astana QoL" value={baselineScore.toFixed(2)} note="2026 · calculated official baseline" icon={Activity} />
          <MetricCard label="Strategy A · 2028 QoL" value={results.a ? results.a.finalScore.toFixed(2) : "—"} note={results.a ? "Official two-year result" : "Awaiting official simulation"} icon={ArrowUpRight} tone="a" />
          <MetricCard label="Strategy B · 2028 QoL" value={results.b ? results.b.finalScore.toFixed(2) : "—"} note={results.b ? "Official two-year result" : "Awaiting comparison simulation"} icon={ArrowUpRight} tone="b" />
        </div>
        <ol className="flow-steps" aria-label="Strategy workflow"><li className={strategies ? "complete" : "active"}>1 <span>Choose five decisions</span></li><ArrowRight aria-hidden="true" size={13} /><li className={result ? "complete" : strategies ? "active" : ""}>2 <span>Run official simulation</span></li><ArrowRight aria-hidden="true" size={13} /><li className={analyses[selected] ? "complete" : result ? "active" : ""}>3 <span>Explain &amp; compare</span></li></ol>
        {error && <div className="error-banner" role="alert"><AlertCircle size={17} /><div><strong>Request could not be completed</strong><p>{error}</p></div><button aria-label="Dismiss error" onClick={() => setError(null)}>×</button></div>}
        {pending === "strategy" && <Card className="loading-state" role="status"><LoaderCircle className="spin" size={20} /><span>Selecting catalog measures and checking official rules…</span></Card>}
        {anyDirty && strategies && <p className="decision-help" role="status">There are unapplied decisions. Apply each edited strategy before running a comparison.</p>}
        {result && <>
          {strategies?.strategyB && <div className="result-strategy-switch" role="group" aria-label="Select official result"><span>View official result</span><Button variant="outline" size="sm" disabled={busy} aria-pressed={selected === "a"} onClick={() => select("a")}>A · {strategies.strategyA.name}</Button><Button variant="outline" size="sm" disabled={busy} aria-pressed={selected === "b"} onClick={() => select("b")}>B · {strategies.strategyB.name}</Button></div>}
          {officialSimulation}
          {analyses[selected] && <section id="official-analysis" tabIndex={-1} aria-label="Official result explanation"><AnalysisPanel report={analyses[selected]} /></section>}
        </>}
        {strategies && <section aria-labelledby="strategies-title"><div className="comparison-heading"><h2 id="strategies-title"><GitCompareArrows size={16} />{anyDirty ? "Last confirmed decisions · edits pending" : strategies.strategyB ? "Strategy comparison" : "Your validated strategy"}</h2><span>5 measures · up to 100 budget · at most 2 per category</span></div><div className={`strategy-grid ${strategies.strategyB ? "" : "single-strategy"}`}><StrategyCard variant="a" strategy={strategies.strategyA} score={results.a?.finalScore} selected={selected === "a"} disabled={busy} onSelect={() => select("a")} />{strategies.strategyB && <StrategyCard variant="b" strategy={strategies.strategyB} score={results.b?.finalScore} selected={selected === "b"} disabled={busy} onSelect={() => select("b")} />}</div>
          <form className="comparison-form" onSubmit={event => { event.preventDefault(); void compare(); }}><label htmlFor="comparison-intent">{strategies.strategyB ? "Replace comparison strategy" : "Compare with another strategy"}</label><div><input id="comparison-intent" value={comparisonInput} disabled={busy} onChange={event => setComparisonInput(event.target.value)} maxLength={2000} placeholder="e.g. Green Growth focused on Nura" /><Button variant="outline" type="submit" disabled={busy || anyDirty || !comparisonInput.trim()}><GitCompareArrows size={14} />Compare</Button></div></form>
        </section>}
        {!result && officialSimulation}
        <section className="outlook-section" aria-labelledby="outlook-title"><button className="outlook-toggle" disabled={busy || !result} aria-expanded={outlookOpen} aria-controls="outlook-content" onClick={() => outlookOpen ? setOutlookOpen(false) : void loadOutlook()}><span>{outlookOpen ? <ChevronDown size={19} /> : <ChevronRight size={19} />}<span><strong id="outlook-title">2050 Scenario Outlook</strong><small>{result ? "Optional · explore research factors and long-term assumptions" : "Optional · available after the official simulation"}</small></span></span><span className="subtle-badge">Separate scenario model</span></button>
          {outlookOpen && <div id="outlook-content" className="outlook-content">{pending === "outlook" && <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} />Loading long-term factors and calculating scenario checkpoints…</div>}
            {!outlook && pending !== "outlook" && <Button variant="outline" onClick={() => void loadOutlook()} disabled={busy}>Retry outlook</Button>}
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
        </section><footer className="workspace-footer"><span>FARSIGHT · Future Akim Strategy &amp; Impact Governance Tool</span><span>Official results · optional scenario research</span></footer>
      </div>
    </main>
  </div>;
}

