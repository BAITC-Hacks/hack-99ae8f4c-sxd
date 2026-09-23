"use client";
import { useState } from "react";
import type { GeneratedStrategy, StrategyResponse } from "@/types/product";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export type ComparisonChoice = { strategy: GeneratedStrategy } | { intent: string };
const presets = ["Industrial-Mobility", "Green Growth", "Social wellbeing", "Safety", "Utilities and services"];
export function ComparisonPicker({ initialIntents, strategies, busy, dirty, onConfirm, onCancel }: {
  initialIntents?: [string, string];
  strategies: StrategyResponse | null; busy: boolean; dirty: boolean;
  onConfirm: (choices: [ComparisonChoice, ComparisonChoice]) => Promise<void>; onCancel: () => void;
}) {
  const [choices, setChoices] = useState<[string, string]>(() => initialIntents ? initialIntents.map(intent => presets.includes(intent) ? intent : "custom") as [string, string] : ["", ""]);
  const [custom, setCustom] = useState<[string, string]>(initialIntents ?? ["", ""]);
  const [error, setError] = useState<string | null>(null);
  function resolve(index: number): ComparisonChoice | undefined {
    const choice = choices[index];
    const existing = choice === "a" ? strategies?.strategyA : choice === "b" ? strategies?.strategyB : undefined;
    if (existing) return { strategy: existing };
    if (choice === "custom") return custom[index].trim() ? { intent: custom[index].trim() } : undefined;
    return presets.includes(choice) ? { intent: choice } : undefined;
  }
  return <Card className="comparison-picker" id="comparison-picker" tabIndex={-1}>
    <h2>Choose two strategies to compare</h2>
    <p>Select each strategy explicitly. Existing strategies keep their confirmed decisions; new ideas will be prepared for review.</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      const first = resolve(0), second = resolve(1);
      if (!first || !second) { setError("Choose both strategies before continuing."); return; }
      if (choices[0] === choices[1] && (choices[0] !== "custom" || custom[0].trim().toLowerCase() === custom[1].trim().toLowerCase())) { setError("Choose two different strategies."); return; }
      if (dirty && strategies) { setError("Confirm your pending decisions before preparing a comparison."); return; }
      setError(null);
      void onConfirm([first, second]);
    }}>
      <div className="comparison-picker-grid">{choices.map((choice, index) => <label key={index}>Strategy {index === 0 ? "A" : "B"}
        <select value={choice} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "comparison-choice-error" : undefined} onChange={event => { setChoices(previous => index === 0 ? [event.target.value, previous[1]] : [previous[0], event.target.value]); setError(null); }}>
          <option value="">Select a strategy…</option>
          {strategies?.strategyA && <option value="a">Current A · {strategies.strategyA.name}</option>}
          {strategies?.strategyB && <option value="b">Current B · {strategies.strategyB.name}</option>}
          {presets.map(preset => <option key={preset} value={preset}>New · {preset}</option>)}
          <option value="custom">New · My own priorities</option>
        </select>
        {choice === "custom" && <input aria-label={`Priorities for strategy ${index === 0 ? "A" : "B"}`} disabled={busy} maxLength={2000} placeholder="Describe priorities and districts" value={custom[index]} onChange={event => { setCustom(previous => index === 0 ? [event.target.value, previous[1]] : [previous[0], event.target.value]); setError(null); }} />}
      </label>)}</div>
      {error && <p className="comparison-choice-error" id="comparison-choice-error" role="alert">{error}</p>}
      <div className="decision-actions"><Button type="submit" disabled={busy}>{busy ? "Preparing strategies…" : "Confirm pair and prepare"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
      <p>Review both sets of five initiatives, then run the official simulation.</p>
    </form>
  </Card>;
}
