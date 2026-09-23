"use client";
import { useId, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LongTermScenario, ScenarioCheckpoint } from "@/types/outlook";
import type { IndicatorCode } from "@/types";
import { Card } from "./ui/card";

const views: { id: string; label: string; codes?: IndicatorCode[] }[] = [
  { id: 'index', label: 'Scenario index' }, { id: 'transport', label: 'Transport', codes: ['T1', 'T2'] },
  { id: 'ecology', label: 'Ecology', codes: ['E1', 'E2'] }, { id: 'social', label: 'Social', codes: ['S1', 'S2'] },
  { id: 'safety', label: 'Safety', codes: ['B1', 'B2'] }, { id: 'services', label: 'Services', codes: ['C1', 'C2'] },
];
export function TrajectoryChart({ scenario, comparison, name = "Selected strategy", comparisonName = "Comparison" }: { scenario?: LongTermScenario; comparison?: LongTermScenario; name?: string; comparisonName?: string }) {
  const [visible, setVisible] = useState({ a: true, b: true });
  const [metric, setMetric] = useState('index');
  const gradientId = useId().replace(/:/g, '');
  if (!scenario) return <Card className="trajectory-card"><div className="panel-heading"><h2>Explore the road to 2050</h2></div><div className="empty-state chart-empty"><p>Run the official two-year simulation, then open the optional 2050 Outlook.</p></div></Card>;
  const view = views.find(v => v.id === metric)!;
  const value = (point: ScenarioCheckpoint) => view.codes ? view.codes.reduce((sum, code) => sum + point.cityIndicators[code], 0) / view.codes.length : point.index;
  const rows = scenario.checkpoints.map(point => {
    const other = comparison?.checkpoints.find(p => p.year === point.year);
    return { year: point.year, a: value(point), b: other ? value(other) : undefined };
  });
  const seed = rows.find(row => row.year === 2028)!;
  const end = rows[rows.length - 1];
  const change = end.a - seed.a;
  return <Card className="trajectory-card">
    <div className="panel-heading"><div><div className="chart-eyebrow"><ChartNoAxesCombined size={14} />OPTIONAL · LONG-TERM SCENARIO</div><h2>A longer view of your city</h2><p>Explore how your decisions and external pressures may unfold through 2050.</p></div><span className="subtle-badge">Scenario assumptions · not official scoring</span></div>
    <div className="forecast-highlights"><div><span>2028 starting point</span><strong>{seed.a.toFixed(1)}</strong></div><div><span>2050 scenario</span><strong>{end.a.toFixed(1)}</strong></div><div><span>Scenario change</span><strong>{change > 0 ? '+' : ''}{change.toFixed(1)}</strong><small>points</small></div></div>
    <div className="chart-toolbar"><label className="forecast-metric">View <select value={metric} onChange={event => setMetric(event.target.value)} aria-label="Scenario metric">{views.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label><div className="chart-legends"><button className={`legend ${!visible.a ? 'legend-off' : ''}`} aria-pressed={visible.a} onClick={() => setVisible(v => ({ ...v, a: !v.a }))}><span className="legend-line" />{name}</button>{comparison && <button className={`legend ${!visible.b ? 'legend-off' : ''}`} aria-pressed={visible.b} onClick={() => setVisible(v => ({ ...v, b: !v.b }))}><span className="legend-line green" />{comparisonName}</button>}</div></div>
    <div className="chart-container" role="group" aria-label={`${view.label} to 2050, using scenario assumptions. Exact values in the checkpoint table.`}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 25, right: 18, bottom: 8, left: -18 }} accessibilityLayer>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={.17} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={.01} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#e9eff8" strokeDasharray="3 5" />
        <XAxis type="number" dataKey="year" domain={[2026, 2050]} ticks={[2026, 2030, 2035, 2040, 2045, 2050]} axisLine={false} tickLine={false} tick={{ fill: '#8fa3bd', fontSize: 11 }} tickMargin={12} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9babc0', fontSize: 10 }} />
        <Tooltip contentStyle={{ background: '#fff', color: '#244d80', borderRadius: 12, border: '1px solid #e0eafa', boxShadow: '0 8px 24px #234e7810', fontSize: 12 }} labelFormatter={label => `Year ${label}`} formatter={value => Number(value).toFixed(2)} />
        <ReferenceLine x={2028} stroke="#b4ccef" strokeDasharray="4 5" label={{ value: 'Scenario begins', position: 'insideTopRight', fill: '#88a8d3', fontSize: 9 }} />
        {visible.a && <Area type="linear" dataKey="a" name={name} stroke="#2563eb" fill={`url(#${gradientId})`} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} isAnimationActive={false} />}
        {comparison && visible.b && <Line type="linear" dataKey="b" name={comparisonName} stroke="#61a6ec" strokeDasharray="6 4" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} isAnimationActive={false} />}
      </ComposedChart></ResponsiveContainer>
    </div>
    <div className="chart-footer"><span>{view.codes ? 'Population-weighted mean of the two sector indicators.' : 'Scenario indicator index: population-weighted average of all ten indicators.'} The 2028 state comes from the official simulation. Later values are exploratory scenarios, not official QoL scores.</span></div>
    <details className="indicator-details"><summary>View scenario checkpoint values</summary><div className="table-scroll"><table className="district-table"><caption className="sr-only">{view.label}: scenario checkpoints</caption><thead><tr><th>Year</th><th>Phase</th><th>{name}</th>{comparison && <th>{comparisonName}</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.year === 2026 ? 'Baseline reference' : row.year === 2028 ? 'Official indicators' : 'Scenario'}</td><td>{row.a.toFixed(2)}</td>{comparison && <td>{row.b?.toFixed(2)}</td>}</tr>)}</tbody></table></div></details>
  </Card>;
}
