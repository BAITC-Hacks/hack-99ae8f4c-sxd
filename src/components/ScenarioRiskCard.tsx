import { ArrowDownRight, ArrowUpRight, ExternalLink, ShieldAlert } from "lucide-react";
import type { FutureFactor } from "@/types/outlook";
import { Card } from "./ui/card";

export function ScenarioRiskCard({ factor, demo }: { factor: FutureFactor; demo: boolean }) {
  const Icon = factor.direction === "positive" ? ArrowUpRight : factor.direction === "negative" ? ArrowDownRight : ShieldAlert;
  const sources = factor.sources.filter(source => /^https?:\/\//i.test(source.url));
  return <Card className="risk-card"><div className="risk-icon"><ShieldAlert size={18} /><span>{factor.startYear}–{factor.endYear}</span></div><h3>{factor.name}</h3><div className={`risk-direction ${factor.direction === "negative" ? "negative" : ""}`}><Icon size={13} />{factor.direction} pressure</div><dl><div><dt>Strength</dt><dd>{Math.round(factor.strength * 100)}%</dd></div><div><dt>{demo ? "Demo confidence" : "Research confidence"}</dt><dd>{Math.round(factor.confidence * 100)}%</dd></div><div><dt>Affected metrics</dt><dd>{factor.affectedMetrics.join(", ")}</dd></div></dl><div className="risk-source"><span>{sources.length} sources</span>{sources.length > 0 ? sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={11} /></a>) : <span>{demo ? "Demo hypothesis · no live sources" : "No sources supplied"}</span>}</div><details className="risk-rationale"><summary>Research rationale</summary><p>{factor.rationale}</p></details></Card>;
}


