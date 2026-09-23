import type { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

type MetricCardProps = { label: string; value: string; suffix?: string; note: string; icon: LucideIcon; tone?: "a" | "b" };
export function MetricCard({ label, value, suffix, note, icon: Icon, tone }: MetricCardProps) {
  return <Card className={`metric-card ${tone ? `tone-${tone}` : ""}`}>
    <div className="metric-label"><span>{label}</span><Icon size={14} /></div>
    <div className="metric-value">{value}<span>{suffix}</span></div>
    <p className="metric-note">{tone && <span className={`series-dot series-${tone}`} />}{note}</p>
  </Card>;
}
