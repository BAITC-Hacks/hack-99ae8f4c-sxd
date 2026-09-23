"use client";
import { useState } from 'react';
import { CATEGORIES, DISTRICTS, INDICATOR_CODES, MEASURES, STRATEGY_RULES, INCOMPATIBILITIES, SYNERGIES } from '@/data';
import { validateStrategy } from '@/lib/validator';
import type { StrategySelection } from '@/lib/validator';
import { Button } from './ui/button';
import { Card } from './ui/card';

const labels = { T1: 'Road congestion relief', T2: 'Public transport access', E1: 'Green space', E2: 'Air quality', S1: 'Schools and kindergartens', S2: 'Primary healthcare', B1: 'Street safety', B2: 'Road safety', C1: 'Utility reliability', C2: 'Resident request resolution' };
export function DecisionEditor({ selections, busy, dirty, variant, onChange, onApply, onRun, canRun }: {
  selections: readonly StrategySelection[]; busy: boolean; dirty: boolean; variant: string;
  onChange: (selections: StrategySelection[]) => void; onApply: () => void;
  onRun: () => void; canRun: boolean;
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Transport');
  const [step, setStep] = useState<'intro' | 'choose' | 'review'>(selections.length ? 'review' : 'intro');
  const validation = validateStrategy(selections);
  if (step === 'intro') return <Card className="decision-panel wizard-intro"><h2>Let’s build your strategy</h2><p>You have 100 units to make five decisions for Astana. I’ll guide you from choosing initiatives to seeing their impact.</p><Button disabled={busy} onClick={() => setStep('choose')}>Let’s start →</Button><p>Prefer to describe your idea? Send a prompt below and I’ll propose a strategy you can review and edit.</p></Card>;
  return <section className="decision-editor" aria-labelledby="decisions-title">
    {step === 'choose' && <details className="baseline-data"><summary>Explore the starting districts and indicators</summary>
      <p>All users start with the same data. Every indicator is on a 0–100 scale; higher is better. Values below 40 incur a score penalty.</p>
      <div className="table-scroll"><table className="district-table"><caption>Starting district conditions</caption><thead><tr><th>District</th><th>Population</th>{INDICATOR_CODES.map(code => <th key={code} title={labels[code]}>{code}</th>)}</tr></thead><tbody>{DISTRICTS.map(d => <tr key={d.id}><th>{d.name}</th><td>{Math.round(d.populationShare * 100)}%</td>{INDICATOR_CODES.map(code => <td key={code} className={d.initialIndicators[code] < 40 ? 'critical-value' : ''}>{d.initialIndicators[code]}</td>)}</tr>)}</tbody></table></div>
      <dl className="indicator-legend">{INDICATOR_CODES.map(code => <div key={code}><dt>{code}</dt><dd>{labels[code]}</dd></div>)}</dl>
      <p>Nura has critical school and healthcare provision. Esil faces congestion and school pressure; Almaty has aging utilities; Saryarka has air-quality and greening needs.</p>
    </details>}
    <Card className="decision-panel">
      <div className="panel-heading"><div><h2 id="decisions-title">{step === 'choose' ? 'Choose your initiatives' : dirty ? 'Review your strategy' : 'Your strategy is ready'}</h2><p>Strategy {variant.toUpperCase()} · {step === 'choose' ? 'Step 1 of 3' : dirty ? 'Step 2 of 3' : 'Step 3 of 3'}</p></div></div>
      <div className="decision-budget" aria-live="polite"><strong>{validation.totalCost} / {STRATEGY_RULES.budget} spent</strong><span>{validation.remainingBudget >= 0 ? `${validation.remainingBudget} remaining` : `${-validation.remainingBudget} over budget`}</span><span>{selections.length} / 5 decisions</span></div>
      <div className="budget-track"><span style={{ width: `${Math.min(100, validation.totalCost)}%` }} /></div>
      {step === 'choose' && <><p className="decision-help">Exactly five distinct measures. At most two per category. You may leave money unspent; the remainder gives no score bonus. Effects below are realized over two years, before synergies and the 0–100 cap.</p>
      <div className="category-choices" role="group" aria-label="Choose an initiative category">{CATEGORIES.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}<span>{selections.filter(s => MEASURES.find(m => m.id === s.measureId)?.category === item).length}</span></button>)}</div>
      <fieldset disabled={busy} className="catalog-category"><legend>{category} <small>{selections.filter(s => MEASURES.find(m => m.id === s.measureId)?.category === category).length} / 2 selected</small></legend>
        <div className="catalog-grid">{MEASURES.filter(m => m.category === category).map(measure => {
          const selection = selections.find(s => s.measureId === measure.id);
          const candidate = [...selections, { measureId: measure.id }];
          const blocked = !selection && validateStrategy(candidate).errors.some(e => ['BUDGET_EXCEEDED', 'CATEGORY_LIMIT_EXCEEDED', 'DUPLICATE_MEASURE'].includes(e.code));
          const full = !selection && selections.length >= 5;
          return <div key={measure.id} className={`catalog-measure ${selection ? 'chosen' : ''}`}>
            <label className="measure-choice"><input type="checkbox" checked={!!selection} disabled={blocked || full} onChange={() => onChange(selection ? selections.filter(s => s.measureId !== measure.id) : candidate)} /><span><strong>{measure.id} · {measure.name}</strong><small>{measure.cost} units · {measure.scope === 'city' ? 'All districts' : 'Choose one district'} · lag {measure.lag} quarters</small></span></label>
            <p>{measure.effects.map(effect => `${labels[effect.indicator]} ${effect.delta > 0 ? '+' : ''}${Number((effect.delta * (8 - measure.lag) / 8).toFixed(3))}`).join(' · ')}</p>
            {selection && measure.scope === 'district' && <label className="district-picker">Target district for {measure.id}<select value={selection.districtId ?? ''} onChange={event => onChange(selections.map(s => s.measureId === measure.id ? { measureId: s.measureId, ...(event.target.value ? { districtId: event.target.value } : {}) } : s))}><option value="">Select district…</option>{DISTRICTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
            {!selection && (blocked || full) && <small>Remove a decision to free a slot, budget or category capacity.</small>}
          </div>;
        })}</div>
      </fieldset></>}
      {selections.length > 0 && <div className="decision-receipt"><h3>Your choices</h3>{selections.map(s => { const m = MEASURES.find(item => item.id === s.measureId)!; return <div key={s.measureId}><button className="receipt-choice" disabled={busy} onClick={() => { setCategory(m.category); setStep('choose'); }}><strong>{m.id} · {m.name}</strong><small>{s.districtId ? DISTRICTS.find(d => d.id === s.districtId)?.name : m.scope === 'city' ? 'City-wide' : 'District needed'} · {m.cost} units</small></button><button disabled={busy} aria-label={`Remove ${m.id}`} onClick={() => onChange(selections.filter(item => item.measureId !== s.measureId))}>×</button></div>; })}</div>}
      <details className="catalog-rules"><summary>Synergies and incompatible measures</summary><ul>{SYNERGIES.map(s => <li key={s.id}>{s.id}: {s.effects.map(e => `${e.indicator} +${e.delta}`).join(', ')} in the district of {s.districtMeasureId}; no lag scaling.</li>)}{INCOMPATIBILITIES.map(c => <li key={c.id}>{c.measureIds.join(' + ')}: cannot be combined {c.scope === 'anywhere' ? 'anywhere in the city' : 'in the same district'}.</li>)}</ul></details>
      {!validation.valid && <div className="decision-errors" role="status"><strong>{step === 'choose' ? 'To continue:' : 'Before confirming:'}</strong><ul>{validation.errors.map((e, i) => <li key={`${e.code}-${i}`}>{e.message}</li>)}</ul></div>}
      <div className="decision-actions">
        {step === 'choose' ? <><Button disabled={busy || !validation.valid} onClick={() => setStep('review')}>Next: review strategy →</Button><Button variant="outline" disabled={busy} onClick={() => setStep('intro')}>Back</Button></> : <><Button disabled={busy || !validation.valid || (!dirty && !canRun)} onClick={dirty ? onApply : onRun}>{dirty ? 'Confirm my five decisions' : 'Run my simulation →'}</Button><Button variant="outline" disabled={busy} onClick={() => setStep('choose')}>Edit choices</Button></>}
        <span>{step === 'choose' ? 'Choose five initiatives and their districts to continue.' : dirty ? 'Check your choices and budget before confirming.' : 'Your decisions are confirmed. Run the simulation to see their impact.'}</span>
      </div>
    </Card>
  </section>;
}
