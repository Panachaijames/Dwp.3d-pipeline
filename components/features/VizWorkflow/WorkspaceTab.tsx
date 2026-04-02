"use client";
import React from 'react';
import { PHASES, TOOLS, VizProject, VizLog, VizTool, PhaseKey, phaseOf, phaseIdx } from './constants';

interface Props {
    proj: VizProject | null;
    pLogs: VizLog[];
    activePhase: PhaseKey;
    isLocked: boolean;
    activeTool: VizTool | null;
    setActiveTool: (t: VizTool | null) => void;
    openTool: (t: VizTool) => void;
    logFromTool: (t: VizTool) => void;
    setEditProj: (p: VizProject | null) => void;
    setEditLog: (l: VizLog | null) => void;
    setTab: (t: string) => void;
    setViewPhase: (p: PhaseKey) => void;
}

export default function WorkspaceTab({ proj, pLogs, activePhase, isLocked, activeTool, setActiveTool, openTool, logFromTool, setEditProj, setEditLog, setTab, setViewPhase }: Props) {
    const phaseTools = proj ? TOOLS.filter(t => t.phase.includes(activePhase)).sort((a, b) => a.order - b.order) : TOOLS;
    const otherTools = proj ? TOOLS.filter(t => !t.phase.includes(activePhase)).sort((a, b) => a.order - b.order) : [];

    const INPUTS: Record<string, string[]> = {
        BSA: ["Location", "Client", "Program", "Revit", "Matterport"],
        CON: ["Key Words", "Concept", "References", "Revit"],
        SCH: ["Mood Images", "Narrative", "Sketches", "Revit"],
        DD: ["Selected Design Options", "Material Board", "Revit"],
    };
    const OUTPUTS: Record<string, string[]> = {
        BSA: ["Site Analysis", "Briefing"],
        CON: ["Narrative", "Mood Images / Videos", "Pitch Deck"],
        SCH: ["Design Options", "Material Board"],
        DD: ["3D Model + 2D Drawings", "3D Renderings"],
    };

    if (!proj) return (
        <div className="vw-pnl">
            <div className="vw-empty" style={{ paddingTop: 80 }}>
                <div className="ei">◫</div><div className="et">Select a Book a 3D project</div>
                <div className="es">The sidebar only shows projects that were submitted through Book a 3D.</div>
            </div>
        </div>
    );

    return (
        <div className="vw-pnl">
            {!isLocked && activeTool && !activeTool.internal && (
                <div className="vw-session">
                    <div className="vw-session-dot" />
                    <span className="vw-session-text">Working in {activeTool.name}</span>
                    <div className="vw-session-actions">
                        <a href={activeTool.url} target="_blank" rel="noopener noreferrer" className="vw-btn vw-btn-g vw-btn-sm">Reopen ↗</a>
                        <button className="vw-btn vw-btn-p vw-btn-sm" onClick={() => logFromTool(activeTool)}>Log prompt</button>
                        <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setActiveTool(null)}>End</button>
                    </div>
                </div>
            )}
            {isLocked && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: "var(--r)", marginBottom: 10, fontSize: 10, color: "var(--tx2)" }}>
                    <span>🔒</span>
                    <span><strong>{phaseOf(activePhase)?.label}</strong> is locked — viewing only.</span>
                    <button className="vw-btn vw-btn-g vw-btn-sm" style={{ marginLeft: "auto", fontSize: 9 }} onClick={() => setViewPhase(proj.phase)}>Back to {phaseOf(proj.phase)?.label}</button>
                </div>
            )}
            <div className="vw-stats">
                <div className="vw-st"><div className="vw-st-l">Viewing</div><div className="vw-st-v or">{phaseOf(activePhase)?.label}</div></div>
                <div className="vw-st"><div className="vw-st-l">Prompts</div><div className="vw-st-v">{pLogs.length}</div></div>
                <div className="vw-st"><div className="vw-st-l">Phase Gates</div><div className="vw-st-v">{Object.values(proj.gates).filter(g => g?.passed).length}/4</div></div>
                <div className="vw-st"><div className="vw-st-l">Library</div><div className="vw-st-v">{pLogs.filter(l => l.publishTarget && l.publishTarget !== 'none').length}</div></div>
            </div>
            {/* Inputs */}
            <div className="vw-cd" style={{ padding: "16px 18px", marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 8 }}>Inputs</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(INPUTS[activePhase] || []).map(inp => <button key={inp} className="vw-btn vw-btn-g vw-btn-sm" style={{ opacity: .5, cursor: "default" }}>{inp}</button>)}
                </div>
            </div>
            {/* Phase Tools */}
            <div className="vw-cd" style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div><div className="vw-cd-t">Phase Tools — {phaseOf(activePhase)?.label}</div><div className="vw-cd-s">Current tools are active. Dashed cards are on the future pipeline.</div></div>
                    {!isLocked && <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setEditProj({ ...proj })}>Edit Project</button>}
                </div>
                <div className="vw-tgrid">
                    {phaseTools.map(t => (
                        <div key={t.id} className={`vw-tcard ${activeTool?.id === t.id ? "active" : ""} ${t.internal ? "internal" : ""} ${t.future ? "future" : ""}`}>
                            {t.internal && <div className="vw-tcard-badge">In-app</div>}
                            {t.future && <div className="vw-tcard-future-badge">◇ Future</div>}
                            <div className="vw-tcard-top"><span className="vw-tcard-icon">{t.icon}</span><span className="vw-tcard-abbr">{t.abbr}</span></div>
                            <div className="vw-tcard-name">{t.name}</div>
                            <div className="vw-tcard-desc">{t.desc}</div>
                            <div className="vw-tcard-actions">
                                {isLocked ? <button className="vw-tcard-btn" style={{ opacity: .4, cursor: "default" }}>🔒 Locked</button>
                                    : t.internal && t.url ? <button className="vw-tcard-btn primary" onClick={() => openTool(t)}>Open ↗</button>
                                        : t.internal ? <button className="vw-tcard-btn primary" onClick={() => openTool(t)}>Open</button>
                                            : t.future ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="vw-tcard-btn" style={{ opacity: .6 }} onClick={() => setActiveTool(t)}>Preview ↗</a>
                                                : <a href={t.url} target="_blank" rel="noopener noreferrer" className="vw-tcard-btn primary" onClick={() => setActiveTool(t)}>Open ↗</a>}
                                {!isLocked && !t.internal && <button className="vw-tcard-btn" style={{ opacity: .5, cursor: "default" }}>Request Login</button>}
                                {!isLocked && <button className="vw-tcard-btn" onClick={() => logFromTool(t)}>Log prompt</button>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {/* Outputs */}
            <div className="vw-cd" style={{ padding: "16px 18px", marginTop: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 8 }}>Outputs</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(OUTPUTS[activePhase] || []).map(out => <button key={out} className="vw-btn vw-btn-g vw-btn-sm" style={{ opacity: .5, cursor: "default" }}>{out}</button>)}
                </div>
            </div>
            {/* Other tools */}
            {otherTools.length > 0 && (
                <div className="vw-cd" style={{ padding: "16px 18px", marginTop: 10 }}>
                    <div className="vw-cd-t" style={{ marginBottom: 8, color: "var(--tx3)" }}>Other Tools</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {otherTools.map(t => t.internal ? (
                            <button key={t.id} className="vw-btn vw-btn-g vw-btn-sm" style={{ opacity: isLocked ? .3 : .7, cursor: isLocked ? "default" : "pointer" }} onClick={() => !isLocked && openTool(t)}>{t.icon} {t.name}</button>
                        ) : (
                            <a key={t.id} href={isLocked ? undefined : t.url} target="_blank" rel="noopener noreferrer" className="vw-btn vw-btn-g vw-btn-sm" style={{ opacity: isLocked ? .3 : t.future ? .5 : .7, borderStyle: t.future ? "dashed" : "solid", background: t.future ? "var(--ord)" : "transparent", cursor: isLocked ? "default" : "pointer" }} onClick={() => !isLocked && setActiveTool(t)}>{t.icon} {t.name}{t.future ? " ◇" : ""} ↗</a>
                        ))}
                    </div>
                </div>
            )}
            {/* Recent prompts */}
            {pLogs.length > 0 && (
                <div className="vw-cd" style={{ padding: "16px 18px", marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div className="vw-cd-t">Recent Prompts</div>
                        <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setTab("logs")}>View all →</button>
                    </div>
                    <div className="vw-tw"><table>
                        <thead><tr><th>Date</th><th>Tool</th><th>Prompt</th><th>Status</th></tr></thead>
                        <tbody>{[...pLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(l => (
                            <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setEditLog({ ...l })}>
                                <td className="vw-mono">{l.date}</td><td style={{ fontSize: 10 }}>{l.tool}</td>
                                <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--m)", fontSize: 9 }}>{l.prompt || "—"}</td>
                                <td><span className={`vw-pill ${l.status.toLowerCase()}`}>{l.status}</span></td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                </div>
            )}
        </div>
    );
}
