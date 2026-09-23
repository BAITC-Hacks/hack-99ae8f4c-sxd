import type { LucideIcon } from "lucide-react";

export function ScoreCard({ label, value, suffix, note, icon: Icon, primary = false }: { label: string; value: string; suffix?: string; note: string; icon: LucideIcon; primary?: boolean }) {
  return <div className={`score-card ${primary ? "score-primary" : ""}`}><div className="score-label"><span>{label}</span><Icon size={16} strokeWidth={1.6} /></div><div className="score-value">{value}<span>{suffix}</span></div><div className="score-note">{primary && <span className="status-dot" />}{note}</div></div>;
}
