import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

export function CategoryMetric({ name, icon: Icon, current, future, trend }: { name: string; icon: LucideIcon; current: number; future: number; trend?: number[] }) {
  const delta = Number((future - current).toFixed(1));
  const Trend = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  const points = trend && trend.length > 1 ? trend : [current, future];
  const low = Math.min(...points), range = Math.max(...points) - low;
  const path = points.map((value, index) => `${index ? 'L' : 'M'}${1 + index * 46 / (points.length - 1)} ${range ? 19 - (value - low) / range * 16 : 11}`).join(' ');
  return <Card className="category-card">
    <div className="category-label"><Icon size={15} /><h3>{name}</h3></div>
    <div className="category-values"><span>{Number(current.toFixed(1))}</span><span className="value-arrow">→</span><strong>{Number(future.toFixed(1))}</strong></div>
    <div className="category-captions"><span>2026</span><span>2050</span></div>
    <div className="category-bottom">
      <span className={`delta ${delta < 0 ? "negative" : "positive"}`}><Trend size={13} />{delta > 0 ? "+" : ""}{delta}<small>pts</small></span>
      <svg className={`mini-trend ${delta < 0 ? "negative" : ""}`} width="48" height="22" viewBox="0 0 48 22" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </div>
  </Card>;
}
