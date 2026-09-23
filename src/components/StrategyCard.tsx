import { Check, Layers3 } from "lucide-react";
import type { GeneratedStrategy } from "@/types/product";
import { DISTRICTS, MEASURES, STRATEGY_RULES } from "@/data";
import { Card } from "./ui/card";

export function StrategyCard({ variant, strategy, score, selected, disabled, onSelect }: { variant: "a" | "b"; strategy: GeneratedStrategy; score?: number; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const remainingBudget = STRATEGY_RULES.budget - strategy.totalBudget;
  const targetDistricts = strategy.targetedDistricts.map(id => DISTRICTS.find(district => district.id === id)?.name ?? id).join(", ");

  return <Card className={`strategy-card strategy-${variant} ${selected ? "strategy-selected" : ""}`}>
    <div className="strategy-top"><span className="eyebrow">STRATEGY {variant.toUpperCase()}</span><span className="strategy-icon"><Layers3 size={18} /></span></div><h3>{strategy.name}</h3><p className="strategy-description">{strategy.description}</p>
    <div className="priority-list">{strategy.priorities.map(priority => <span key={priority.category} title={priority.rationale}>{priority.category}</span>)}</div>
    <div className="strategy-data"><div><span className="data-label">Total budget used</span><strong>{strategy.totalBudget}<small> / {STRATEGY_RULES.budget}</small></strong></div><div><span className="data-label">Selected initiatives</span><strong>{strategy.selectedMeasures.length}<small> / {STRATEGY_RULES.requiredMeasureCount}</small></strong></div><div className="projected-score"><span className="data-label">Official 2028 QoL</span><strong>{score === undefined ? "—" : score.toFixed(2)}</strong></div></div>
    <div className="budget-track" role="meter" aria-label={`${strategy.name} budget used`} aria-valuenow={strategy.totalBudget} aria-valuemin={0} aria-valuemax={STRATEGY_RULES.budget}><span style={{ width: `${strategy.totalBudget / STRATEGY_RULES.budget * 100}%` }} /></div>
    <div className="strategy-foot"><span className="validation-passed" title="The strategy was checked by the official server validator before generation completed."><Check size={13} aria-hidden="true" />Validation: passed</span><span>Remaining budget: <strong>{remainingBudget}</strong></span></div>
    <section className="measure-disclosure" aria-label={`Selected initiatives for ${strategy.name}`}><h4 className="initiative-heading">{strategy.selectedMeasures.length} selected initiatives</h4><p className="strategy-targets"><span className="data-label">Target districts</span>{targetDistricts}</p><div className="table-scroll measure-table-wrap"><table className="measure-table"><caption className="sr-only">Selected measures, target districts, cost and lag for {strategy.name}</caption><thead><tr><th>Selected measure / target district</th><th>Cost</th><th>Lag</th></tr></thead><tbody>{strategy.selectedMeasures.map(selection => {
      const measure = MEASURES.find(item => item.id === selection.measureId)!;
      const target = selection.districtId ? DISTRICTS.find(district => district.id === selection.districtId)?.name : `City-wide · all ${DISTRICTS.length} districts`;
      return <tr key={selection.measureId}><th scope="row"><span>{measure.id} · {measure.name}</span><small>{target} · {measure.category}</small></th><td>{measure.cost}</td><td>{measure.lag} q</td></tr>;
    })}</tbody></table></div></section>
    <p className="generation-note">{strategy.generation.mode === "manual" ? "Your decisions" : strategy.generation.mode === "model" ? "AI-assisted selection" : "Local intent matching"} · {strategy.generation.note}</p>
    <button className="select-strategy" disabled={disabled} onClick={onSelect} aria-pressed={selected}>{selected ? <><Check size={14} />Viewing strategy {variant.toUpperCase()}</> : `View strategy ${variant.toUpperCase()}`}</button>
  </Card>;
}

