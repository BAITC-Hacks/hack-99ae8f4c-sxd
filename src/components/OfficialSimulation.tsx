import { ArrowUpRight, Banknote, CheckCircle2, Gauge, Play, ScanLine } from "lucide-react";
import type { SimulationResult } from "@/lib/simulator";
import { ScoreCard } from "./ScoreCard";
import { DistrictComparison } from "./DistrictComparison";
import { ImpactCharts } from "./ImpactCharts";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type Props = { result?: SimulationResult; comparison?: SimulationResult; name?: string; comparisonName?: string; selected: "a" | "b"; hasStrategy: boolean; hasComparison: boolean; busy: boolean; pending: string | null; onRun: () => void; onExplain: () => void };
export function OfficialSimulation({ result, comparison, name, comparisonName, selected, hasStrategy, hasComparison, busy, pending, onRun, onExplain }: Props) {
  const scoreDifference = result && comparison ? result.finalScore - comparison.finalScore : undefined;
  return <section className="official-section" aria-labelledby="official-title"><div className="comparison-heading"><h2 id="official-title"><CheckCircle2 size={16} />2-Year Official Simulation</h2><span>2026 → 2028 · H = 8 quarters</span></div>
    <div className="official-actions"><p>Deterministic HackAlem model · official weights, implementation lags and synergies.</p><Button className="primary-action" disabled={busy || !hasStrategy} onClick={onRun}><Play size={14} />{pending === "simulation" ? "Simulating…" : result ? "Run again" : "Run 2-Year Official Simulation"}</Button></div>
    {!result ? <Card className="empty-state simulation-empty"><Gauge size={28} /><div><h3>{hasStrategy ? "Your strategy is ready for simulation" : "Build your strategy in the chat"}</h3><p>{hasStrategy ? `Run the 2-Year Official Simulation to calculate ${hasComparison ? "both strategies’ scores" : "your strategy’s score"} and district-level changes.` : "Choose five initiatives and their districts in the chat, then confirm your decisions. The total cost must stay within 100 units."}</p></div></Card> : <>
      <div className="result-heading"><span className="eyebrow">STRATEGY {selected.toUpperCase()} · OFFICIAL RESULT</span><Button variant="outline" size="sm" disabled={busy} onClick={onExplain}><ScanLine size={14} />{pending === "analysis" ? "Explaining…" : "Explain result"}</Button></div>
      <div className="summary-grid"><ScoreCard label="Astana Quality of Life Score" value={result.finalScore.toFixed(2)} note="Official 2028 result · deterministic" icon={Gauge} primary /><ScoreCard label="Change from baseline" value={`${result.scoreDelta >= 0 ? "+" : ""}${result.scoreDelta.toFixed(2)}`} note={`2026 baseline: ${result.baselineScore.toFixed(2)}`} icon={ArrowUpRight} /><ScoreCard label="Budget remaining" value={String(result.remainingBudget)} suffix={`/ ${result.totalCost + result.remainingBudget}`} note={`${result.totalCost} spent on ${result.selectedMeasures.length} initiatives`} icon={Banknote} /><ScoreCard label="Critical indicators" value={String(result.final.criticalCount)} note={`${result.baseline.criticalCount} before · threshold below 40`} icon={CheckCircle2} /></div>
      {comparison && scoreDifference !== undefined && <div className="comparison-result">{Math.abs(scoreDifference) < 1e-9 ? <>Strategies A and B <strong>tie at {result.finalScore.toFixed(2)}</strong> in the 2-Year Official Simulation.</> : <>Strategy {selected.toUpperCase()} scores <strong>{Number(scoreDifference.toFixed(2)) === 0 ? "less than 0.01" : Math.abs(scoreDifference).toFixed(2)} points {scoreDifference > 0 ? "higher" : "lower"}</strong> than strategy {selected === "a" ? "B" : "A"} ({comparison.finalScore.toFixed(2)}) in the 2-Year Official Simulation.</>}</div>}
      <ImpactCharts result={result} comparison={comparison} name={name || `Strategy ${selected.toUpperCase()}`} comparisonName={comparisonName || `Strategy ${selected === "a" ? "B" : "A"}`} />
      <DistrictComparison result={result} comparison={comparison} selected={selected} />
      <details className="scoring-details"><summary>How the official score is calculated</summary><p>Astana QoL = 0.7 × population-weighted city average + 0.3 × lowest district score − number of indicators below 40.</p><p>City average: {result.final.cityAverage.toFixed(3)} · lowest district: {result.final.minimumDistrictScore.toFixed(3)} · critical indicators: {result.final.criticalCount}. Values are rounded only for display.</p><p>Each catalog effect is realized by (8 − lag) / 8, followed by indicator limits and applicable synergy bonuses.</p></details>
    </>}
  </section>;
}

