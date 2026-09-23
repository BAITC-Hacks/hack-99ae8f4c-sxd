import { ArrowDownRight, ArrowUpRight, ScanLine, ShieldAlert, SlidersHorizontal } from "lucide-react";
import type { AnalysisReport } from "@/types/product";
import { Card } from "./ui/card";

export function AnalysisPanel({ report }: { report: AnalysisReport }) {
  const isOutlook = report.title.includes("2050");
  const highlights = report.sections.slice(0, 2);
  const evidence = report.sections.slice(2);
  return <Card className="analysis-panel">
    <div className="panel-heading"><div><h2><ScanLine size={16} />Strategy analysis</h2><p>{report.title}</p></div><span className="badge">{report.answer ? "AI + calculated evidence" : "Calculated explanation"}</span></div>
    <p className="analysis-summary">{report.summary}</p>
    {report.answer && <div className="analysis-summary"><strong>AI explanation</strong><p>{report.answer}</p></div>}
    <div className="analysis-grid">
      {highlights.map((section, index) => {
        const Icon = isOutlook ? ShieldAlert : index === 0 ? ArrowUpRight : ArrowDownRight;
        return <section className="analysis-item" key={section.title}><h3><Icon size={15} className={index === 0 && !isOutlook ? "positive" : "neutral"} />{section.title}</h3><p>{section.body}</p></section>;
      })}
      <section className="analysis-item"><h3><ShieldAlert size={15} />{isOutlook ? "Long-term risks" : "Long-term risks & uncertainty"}</h3><p>{isOutlook ? "Inspect the research factors and their sources above. The 2050 trajectory is sensitive to the published assumptions." : "The official result covers eight quarters. Open the optional 2050 outlook to assess external factors and longer-term assumptions."}</p></section>
      {report.improvements.length > 0 && <section className="analysis-item"><h3><SlidersHorizontal size={15} />Suggested adjustment</h3><p>{report.improvements[0]}</p></section>}
    </div>
    {(evidence.length > 0 || report.improvements.length > 1) && <details className="analysis-evidence"><summary>Supporting evidence &amp; additional adjustments</summary><div className="analysis-grid">{evidence.map((section, index) => <section key={`${section.title}-${index}`}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div>{report.improvements.length > 1 && <ul>{report.improvements.slice(1).map((item, index) => <li key={index}>{item}</li>)}</ul>}</details>}
    <div className="panel-footnote">Calculated from model output. Suggested adjustments require a new validated simulation.</div>
  </Card>;
}
