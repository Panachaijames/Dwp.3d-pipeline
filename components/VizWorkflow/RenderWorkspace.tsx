"use client";
import React, { useState, useRef } from 'react';
import { RENDER_MODES, STYLE_PRESETS, VizProject, VizLog, PhaseKey, freshLog as makeFreshLog } from './constants';

interface Props { proj: VizProject; logs: VizLog[]; saveL: (l: VizLog) => void; freshLog: (pid: string, toolName?: string) => VizLog; }

interface Message { role: "user" | "assistant"; content: string; }

export default function RenderWorkspace({ proj, logs, saveL, freshLog: makeFresh }: Props) {
    const [mode, setMode] = useState(RENDER_MODES[0].id);
    const [style, setStyle] = useState(STYLE_PRESETS[0]);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const currentMode = RENDER_MODES.find(m => m.id === mode) || RENDER_MODES[0];

    const send = async () => {
        if (!input.trim() || loading) return;
        const userMsg: Message = { role: "user", content: input };
        const next = [...messages, userMsg];
        setMessages(next); setInput(""); setLoading(true);
        const system = `You are dwp.render — an AI visualization assistant for dwp | design worldwide partnership. Mode: ${currentMode.label}. Style preset: ${style}. Project: ${proj.name} (${proj.sector}). Phase: ${proj.phase}. Respond with professional visualization guidance.`;
        try {
            const res = await fetch("/api/gemini", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: input, systemPrompt: system, conversationHistory: next.map(m => ({ role: m.role, content: m.content })) }) });
            const data = await res.json();
            const aiContent = data.response || data.text || data.error || "No response received.";
            setMessages(prev => [...prev, { role: "assistant", content: aiContent }]);
        } catch (err) { setMessages(prev => [...prev, { role: "assistant", content: "Error connecting to API." }]); }
        setLoading(false);
        setTimeout(() => outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" }), 100);
    };

    const logSession = () => {
        const userPrompts = messages.filter(m => m.role === "user").map(m => m.content).join("\n---\n");
        const log = makeFresh(proj.id, "dwp.render");
        log.prompt = userPrompts; log.phase = proj.phase;
        log.notes = `Mode: ${currentMode.label} | Style: ${style} | ${messages.length} messages`;
        saveL(log);
    };

    const copyText = (t: string) => { navigator.clipboard.writeText(t); };

    return (
        <div className="vw-render-ws">
            <div className="vw-render-left">
                <div className="vw-render-left-hd">
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--or)", fontWeight: 600 }}>dwp.render</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>AI Visualization Workspace</div>
                    <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 2 }}>{proj.name} · {proj.phase}</div>
                </div>
                <div className="vw-render-left-body">
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--tx3)", fontWeight: 500, marginBottom: 8 }}>Mode</div>
                    <div className="vw-mode-grid">
                        {RENDER_MODES.map(m => (
                            <div key={m.id} className={`vw-mode-card ${mode === m.id ? "on" : ""}`} onClick={() => setMode(m.id)}>
                                <div className="mc-l">{m.label}</div><div className="mc-d">{m.desc}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--tx3)", fontWeight: 500, marginBottom: 8 }}>Style Preset</div>
                    <div className="vw-style-chips">
                        {STYLE_PRESETS.map(s => <button key={s} className={`vw-style-chip ${style === s ? "on" : ""}`} onClick={() => setStyle(s)}>{s}</button>)}
                    </div>
                    {messages.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <button className="vw-btn vw-btn-p vw-btn-sm" onClick={logSession}>Save session</button>
                            <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setMessages([])}>Clear</button>
                        </div>
                    )}
                </div>
            </div>
            <div className="vw-render-right">
                <div className="vw-render-output" ref={outputRef}>
                    {messages.length === 0 && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--tx3)", textAlign: "center" }}>
                            <div style={{ fontSize: 40, opacity: .12 }}>◈</div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tx2)" }}>dwp.render</div>
                            <div style={{ fontSize: 11, maxWidth: 380, lineHeight: 1.6 }}>{currentMode.desc}</div>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`vw-render-msg ${m.role === "user" ? "user" : "ai"}`}>
                            <div className="vw-render-msg-role">{m.role === "user" ? "You" : "dwp.render"}</div>
                            <div className="vw-render-msg-body">{m.content}</div>
                            {m.role === "assistant" && <div className="vw-render-msg-actions"><button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => copyText(m.content)}>Copy</button></div>}
                        </div>
                    ))}
                    {loading && <div className="vw-render-msg ai" style={{ opacity: .5 }}><div className="vw-render-msg-role">dwp.render</div><div style={{ fontSize: 11, color: "var(--tx3)" }}>Thinking…</div></div>}
                </div>
                <div className="vw-render-input-bar">
                    <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={`Describe your ${currentMode.label.toLowerCase()} request…`} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                    <button className="vw-btn vw-btn-p" onClick={send} disabled={loading || !input.trim()} style={{ alignSelf: "flex-end", opacity: loading || !input.trim() ? .4 : 1 }}>Send</button>
                </div>
            </div>
        </div>
    );
}
