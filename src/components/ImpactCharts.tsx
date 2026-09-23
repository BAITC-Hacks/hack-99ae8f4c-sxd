"use client";
import { useState } from "react";
import { ArrowUpRight, ChartColumnIncreasing, Radar as RadarIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DISTRICTS } from "@/data";
import { scoreDistrict } from "@/lib/scoring";
import type { SimulationResult } from "@/lib/simulator";
import type { IndicatorCode } from "@/types";
import { Card } from "./ui/card";

const tooltipStyle = { background: '#fff', border: '1px solid #e2eaf5', borderRadius: 12, color: '#16345b', boxShadow: '0 10px 32px #19395c12', fontSize: 12 };
const sectors: { name: string; codes: IndicatorCode[] }[] = [
  { name: 'Transport', codes: ['T1', 'T2'] }, { name: 'Ecology', codes: ['E1', 'E2'] },
  { name: 'Social', codes: ['S1', 'S2'] }, { name: 'Safety', codes: ['B1', 'B2'] },
  { name: 'Services', codes: ['C1', 'C2'] },
];

/** Visualize calculated endpoints only; the official model does not define a quarterly forecast. */
export function ImpactCharts({ result, comparison, name, comparisonName }: { result?: SimulationResult; comparison?: SimulationResult; name?: string; comparisonName?: string }) {
  const [view, setView] = useState<'scores' | 'change'>('scores');
  const rows = DISTRICTS.map(d => {
    const baseline = result?.districtScoresBefore[d.id] ?? scoreDistrict(d.initialIndicators);
    return {
      district: d.name, baseline,
      current: result ? result.districtScoresAfter[d.id] - (view === 'change' ? baseline : 0) : undefined,
      other: comparison ? comparison.districtScoresAfter[d.id] - (view === 'change' ? baseline : 0) : undefined,
    };
  });
  const sectorRows = sectors.map(sector => ({
    sector: sector.name,
    baseline: DISTRICTS.reduce((sum, d) => sum + d.populationShare * sector.codes.reduce((n, c) => n + (result?.indicatorsBefore[d.id][c] ?? d.initialIndicators[c]), 0) / sector.codes.length, 0),
    future: result ? DISTRICTS.reduce((sum, d) => sum + d.populationShare * sector.codes.reduce((n, c) => n + result.indicatorsAfter[d.id][c], 0) / sector.codes.length, 0) : undefined,
  }));
  return <section className="impact-chart-grid" aria-label="City indicators and official two-year results">
    <Card className="impact-chart-card">
      <div className="panel-heading"><div><div className="chart-eyebrow"><ChartColumnIncreasing size={14} />{result ? 'OFFICIAL · TWO-YEAR RESULT' : 'CITY SNAPSHOT · 2026'}</div><h2>{result ? 'District outcomes' : 'Every district has a starting point.'}</h2><p>{result ? 'Compare district outcomes after eight quarters.' : 'The actual district baseline, before any strategy is applied.'}</p></div>
        {result && <div className="chart-switch" aria-label="District chart view"><button aria-pressed={view === 'scores'} onClick={() => setView('scores')}>Score</button><button aria-pressed={view === 'change'} onClick={() => setView('change')}>Change</button></div>}
      </div>
      <div className="chart-legends impact-legends">{(!result || view === 'scores') && <span className="legend"><i className="legend-swatch baseline" />2026 baseline</span>}{result && <span className="legend"><i className="legend-swatch" />{name || 'Selected strategy'}</span>}{comparison && <span className="legend"><i className="legend-swatch alternative" />{comparisonName || 'Comparison'}</span>}</div>
      <div className="impact-bars" role="group" aria-label="District scores; exact values available below the chart">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -28 }} barGap={4} barCategoryGap="24%" accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#eaf0f7" strokeDasharray="3 4" /><XAxis dataKey="district" axisLine={false} tickLine={false} tick={{ fill: '#728399', fontSize: 11 }} tickMargin={12} interval={0} /><YAxis domain={view === 'change' && result ? ['auto', 'auto'] : [0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#8b9aad', fontSize: 10 }} />
          <Tooltip cursor={{ fill: '#f3f7fd' }} contentStyle={tooltipStyle} formatter={value => Number(value).toFixed(2)} />
          {(!result || view === 'scores') && <Bar dataKey="baseline" name="2026 baseline" fill="#cfdef5" radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false} />}
          {result && <Bar dataKey="current" name={name || 'Selected strategy'} fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false} />}
          {comparison && <Bar dataKey="other" name={comparisonName || 'Comparison'} fill="#6caff4" radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false} />}
        </BarChart></ResponsiveContainer>
      </div>
      <div className="chart-insight"><ArrowUpRight size={15} /><span>{result ? `City QoL ${result.baselineScore.toFixed(2)} → ${result.finalScore.toFixed(2)}. District bars show weighted district scores.` : 'Choose a strategy to see how the next two years could change each district.'}</span></div>
      <details className="chart-data"><summary>View chart data</summary><div className="table-scroll"><table className="district-table"><thead><tr><th>District</th><th>2026</th>{result && <th>{view === 'change' ? 'Change' : '2028'}</th>}{comparison && <th>Comparison</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.district}><th scope="row">{row.district}</th><td>{row.baseline.toFixed(2)}</td>{result && <td>{row.current?.toFixed(2)}</td>}{comparison && <td>{row.other?.toFixed(2)}</td>}</tr>)}</tbody></table></div></details>
    </Card>
    <Card className="sector-chart-card"><div className="panel-heading"><div><div className="chart-eyebrow"><RadarIcon size={14} />FIVE CITY PRIORITIES</div><h2>{result ? 'Official category changes' : 'City category baseline'}</h2><p>{result ? `${name || 'Selected strategy'} · 2026 baseline → 2028 result.` : 'Population-weighted sector indicators.'}</p></div></div>
      <div className="sector-radar" role="group" aria-label="Five sector indicator averages">
        <ResponsiveContainer width="100%" height="100%"><RadarChart data={sectorRows} outerRadius="63%" accessibilityLayer><PolarGrid stroke="#e3ebf6" /><PolarAngleAxis dataKey="sector" tick={{ fill: '#728399', fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} /><Radar name="2026 baseline" dataKey="baseline" stroke="#a8bfdc" fill="#d7e5f7" fillOpacity={.4} isAnimationActive={false} />{result && <Radar name={name ? `${name} · 2028` : '2028 strategy'} dataKey="future" stroke="#2563eb" fill="#3b82f6" fillOpacity={.18} strokeWidth={2} isAnimationActive={false} />}<Tooltip contentStyle={tooltipStyle} formatter={value => Number(value).toFixed(2)} /></RadarChart></ResponsiveContainer>
      </div>
      <div className="sector-values">{sectorRows.map(row => {
        const delta = row.future === undefined ? undefined : Number((row.future - row.baseline).toFixed(2));
        return <div key={row.sector}><span>{row.sector}</span><span>{row.baseline.toFixed(2)}{row.future !== undefined && <><span className="sector-arrow"> → </span><strong>{row.future.toFixed(2)}</strong></>}</span>{delta !== undefined && <span className={delta < 0 ? 'negative' : delta > 0 ? 'positive' : ''} aria-label={`${row.sector} change: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} points`}>{delta >= 0 ? '+' : ''}{delta.toFixed(2)}</span>}</div>;
      })}</div>
      <p className="chart-note">Population-weighted mean of each category’s two indicators, on a 0–100 scale. Changes are in points. These category averages are separate from the official city QoL formula.</p>
    </Card>
  </section>;
}
