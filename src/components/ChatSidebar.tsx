"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronUp, Plus, ScanLine, UserRound } from "lucide-react";
import { Button } from "./ui/button";
import { STRATEGY_PRESETS, presetPrompt } from "@/data/strategy-presets";

type Message = { role: "assistant" | "user"; text: string; prepared?: boolean };
type ChatSidebarProps = { onCompare?: () => void; onOutlook?: () => void; canCompare?: boolean; busy?: boolean; canExplain?: boolean; strategyBuilder?: ReactNode; onGenerate?: (intent: string) => Promise<string>; onExplain?: (question: string) => Promise<string>; onReset?: () => void };
const initialMessages: Message[] = [
  { role: "assistant", text: "Let’s build your strategy. You have 100 budget units and five decisions to make. Choose initiatives and their districts below, or describe your priorities and I’ll suggest a starting point." },
  { role: "user", text: "Create an Industrial-Mobility First strategy and compare it with Green Growth." },
  { role: "assistant", text: "Two illustrative pathways are ready. Compare their trajectories, district outcomes, and long-term trade-offs.", prepared: true },
];

export function ChatSidebar({ onCompare, onOutlook, canCompare = false, busy = false, canExplain = false, strategyBuilder, onGenerate, onExplain, onReset }: ChatSidebarProps) {
  const [messages, setMessages] = useState(onGenerate ? [initialMessages[0]] : initialMessages);
  const [mode, setMode] = useState<"strategy" | "explain">("strategy");
  const [input, setInput] = useState("");
  const [preset, setPreset] = useState<string | null>(null);
  const [topicsOpen, setTopicsOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (messages.length === 1 && logRef.current) logRef.current.scrollTop = 0;
    if (messages.length > 1 && logRef.current) {
      const entries = logRef.current.querySelectorAll<HTMLElement>('.conversation-message');
      const last = entries[entries.length - 1];
      if (last) logRef.current.scrollTop += last.getBoundingClientRect().top - logRef.current.getBoundingClientRect().top;
    }
  }, [messages]);
  useEffect(() => { if (!canExplain) setMode("strategy"); }, [canExplain]);
  async function send() {
    const value = input.trim();
    if (!value || busy || (mode === "explain" && !canExplain)) return;
    setMessages(m => [...m, { role: "user", text: value }]);
    setInput("");
    setPreset(null);
    try {
      const answer = mode === "explain" && onExplain ? await onExplain(value) : onGenerate ? await onGenerate(value) : "Your request is captured in this local preview. The workspace shows fixed example scenarios; AI strategy generation and simulation are not connected yet.";
      setMessages(m => [...m, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages(m => [...m, { role: "assistant", text: error instanceof Error ? error.message : "The request failed. Please try again." }]);
      setInput(value);
    }
  }
  return <aside className="chat-sidebar" aria-label="FARSIGHT copilot">
    <div className="copilot-heading"><span><strong>FARSIGHT</strong><span className="separator" aria-hidden="true">·</span>AI Copilot</span><Button variant="ghost" size="icon" disabled={busy} aria-label="Start a new strategy session" title="New conversation" onClick={() => { onReset?.(); setMode("strategy"); setMessages([initialMessages[0]]); setInput(""); setPreset(null); setTopicsOpen(true); inputRef.current?.focus(); }}><Plus size={16} /></Button></div>
    <div ref={logRef} className="conversation" role="log" aria-live="polite" aria-label="Strategy conversation">
      <div className="session-label">SCENARIO EXPLORATION <span>01</span></div>
      {messages.map((message, index) => strategyBuilder && index === 0 ? <div key={index} className="conversation-message assistant strategy-builder-message"><div className="message-author"><ScanLine size={13} /><span>YOUR STRATEGY</span><small>INTERACTIVE</small></div>{strategyBuilder}</div> : <div key={index} className={`conversation-message ${message.role}`}>
        <div className="message-author">{message.role === "assistant" ? <ScanLine size={13} /> : <UserRound size={13} />}<span>{message.role === "assistant" ? "FARSIGHT" : "YOU"}</span>{message.role === "assistant" && <small>COPILOT</small>}</div>
        <p>{message.text}</p>
        {message.prepared && <div className="prepared-strategies"><span><Check size={13} />Comparison prepared</span><div><i className="series-dot series-a" />Industrial-Mobility <small>A</small></div><div><i className="series-dot series-b" />Green Growth <small>B</small></div><p>Illustrative scenarios · Not simulated</p></div>}
      </div>)}
      {busy && <p className="working-note" role="status">Working on your request…</p>}
    </div>
    <div className="copilot-compose">
      <button type="button" className="topic-toggle" aria-expanded={topicsOpen} aria-controls="strategy-topics" onClick={() => setTopicsOpen(open => !open)}>
        <span>{topicsOpen ? 'Hide strategy ideas' : 'Show strategy ideas'}</span>{topicsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <div id="strategy-topics" className="quick-prompts" hidden={!topicsOpen}>{STRATEGY_PRESETS.map(item => <button type="button" key={item.id} disabled={busy} className={preset === item.name ? 'selected' : ''} onClick={() => { setMode('strategy'); setPreset(item.name); setInput(presetPrompt(item)); setTopicsOpen(false); inputRef.current?.focus(); }}>{item.name}<ArrowUpRight size={11} /></button>)}</div>
      {canExplain && <div className="quick-prompts"><button type="button" disabled={busy || !canCompare} onClick={() => { if (onCompare) onCompare(); else { setMode('strategy'); setInput('Compare strategies'); inputRef.current?.focus(); } }}>Compare strategies<ArrowUpRight size={11} /></button>{onOutlook && <button type="button" disabled={!canCompare || busy} onClick={onOutlook}>Explore outlook to 2050<ArrowUpRight size={11} /></button>}</div>}
      {onGenerate && <div className="composer-modes" aria-label="Message purpose"><button type="button" aria-pressed={mode === "strategy"} disabled={busy} onClick={() => setMode("strategy")}>Strategy &amp; questions</button>{canExplain && <button type="button" aria-pressed={mode === "explain"} disabled={busy || !canExplain} onClick={() => setMode("explain")}>Ask about result</button>}</div>}
      <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="strategy-message" className="sr-only">Describe a strategy or ask a question</label><textarea ref={inputRef} id="strategy-message" disabled={busy} value={input} onChange={event => setInput(event.target.value)} placeholder={mode === "strategy" ? (canExplain ? "Describe a strategy or compare two strategies…" : "Describe your strategy priorities…") : "Ask about the calculated result…"} rows={2} maxLength={2000} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div className="composer-controls"><span>↵ Send <span>·</span> ⇧↵ New line</span><Button size="icon" type="submit" disabled={busy || !input.trim() || (mode === "explain" && !canExplain)} aria-label="Send message"><ArrowUp size={16} /></Button></div></form>
      <p className="copilot-disclaimer">Official results and 2050 scenarios are distinct.</p>
    </div>
    <div className="sidebar-footer"><span className="workspace-avatar">AS</span><div>Astana research workspace<span><i className="status-dot" />{onGenerate ? "5 districts · 14 measures" : "Local preview"}</span></div><span className="footer-version">v0.1</span></div>
  </aside>;
}
