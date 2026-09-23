import { Map } from "lucide-react";
import { DISTRICTS, INDICATOR_CODES } from "@/data";
import type { SimulationResult } from "@/lib/simulator";
import { Card } from "./ui/card";

function signed(value: number) { const rounded = Number(value.toFixed(2)); return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`; }
export function DistrictComparison({ result, comparison, selected }: { result: SimulationResult; comparison?: SimulationResult; selected: "a" | "b" }) {
  const after = Object.values(result.districtScoresAfter);
  const highest = Math.max(...after);
  const lowest = Math.min(...after);
  return <Card className="district-panel"><div className="panel-heading"><div><h2><Map size={16} />Official district changes</h2><p>Strategy {selected.toUpperCase()} · weighted district scores at the end of eight quarters.</p></div><span className="subtle-badge">2026 → 2028</span></div><div className="table-scroll"><table className="district-table"><caption className="sr-only">Official two-year district scores for strategy {selected.toUpperCase()}</caption><thead><tr><th>District</th><th>2026 baseline</th><th>{selected.toUpperCase()} · 2028</th>{comparison && <th>{selected === "a" ? "B" : "A"} · 2028</th>}<th>Change {selected.toUpperCase()}</th><th>2028 standing</th></tr></thead><tbody>{DISTRICTS.map(district => {
      const delta = result.districtScoresAfter[district.id] - result.districtScoresBefore[district.id];
      const score = result.districtScoresAfter[district.id];
      const standing = highest === lowest ? "Equal score" : score === highest ? (after.filter(value => value === highest).length > 1 ? "Joint highest" : "Highest score") : score === lowest ? (after.filter(value => value === lowest).length > 1 ? "Joint lowest" : "Lowest score") : "—";
      return <tr key={district.id}><th scope="row">{district.name}</th><td>{result.districtScoresBefore[district.id].toFixed(2)}</td><td className="selected-column">{score.toFixed(2)}</td>{comparison && <td>{comparison.districtScoresAfter[district.id].toFixed(2)}</td>}<td className={delta < 0 ? "negative" : delta > 0 ? "positive" : ""}>{signed(delta)}</td><td><span className={`outlook ${highest === lowest ? "" : score === highest ? "leading" : score === lowest ? "lagging" : ""}`}>{standing}</span></td></tr>;
    })}</tbody></table></div><div className="panel-footnote">Highest-to-lowest district gap: {(highest - lowest).toFixed(2)} points.</div><details className="indicator-details"><summary>Inspect all ten indicator changes</summary><div className="table-scroll"><table className="indicator-table"><caption className="sr-only">Indicator point changes in strategy {selected.toUpperCase()} after eight quarters</caption><thead><tr><th>District</th>{INDICATOR_CODES.map(code => <th key={code}>{code}</th>)}</tr></thead><tbody>{DISTRICTS.map(district => <tr key={district.id}><th scope="row">{district.name}</th>{INDICATOR_CODES.map(code => <td key={code} className={result.indicatorDeltas[district.id][code] < 0 ? "negative" : ""}>{signed(result.indicatorDeltas[district.id][code])}</td>)}</tr>)}</tbody></table></div></details></Card>;
}

