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

    if (!proj) return (
        <div className="vw-pnl">
            <div className="vw-empty" style={{ paddingTop: 80 }}>
                <div className="ei">◫</div><div className="et">Select a Project</div>
                <div className="es">Choose a project from the sidebar to view its workspace.</div>
            </div>
        </div>
    );

    const pIdx = phaseIdx(activePhase);
    const gatesPassed = Object.values(proj.gates).filter(g => g?.passed).length;

    return (
        <div className="vw-pnl">
            {/* Active Tool Session Banner */}
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--ord)", border: "1px solid var(--or)", borderRadius: "var(--r)", marginBottom: 16, fontSize: 12, color: "var(--tx)", fontWeight: 500 }}>
                    <span>🔒</span>
                    <span><strong>{phaseOf(activePhase)?.label}</strong> is locked — viewing historical phase.</span>
                    <button className="vw-btn vw-btn-g vw-btn-sm" style={{ marginLeft: "auto", fontSize: 11, background: "var(--bg)" }} onClick={() => setViewPhase(proj.phase)}>Return to Current Phase ({phaseOf(proj.phase)?.label})</button>
                </div>
            )}

            {/* Project Overview Header */}
            <div className="vw-cd" style={{ padding: "20px", marginBottom: 16, borderTop: "4px solid var(--tx)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 4, fontFamily: "var(--m)" }}>{proj.projectId}</div>
                        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "var(--tx)" }}>{proj.name}</h2>
                        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 13, color: "var(--tx2)" }}>
                            <span><strong>Sector:</strong> {proj.sector}</span>
                            <span>•</span>
                            <span><strong>Studio:</strong> {proj.studio}</span>
                            <span>•</span>
                            <span><strong>Created:</strong> {proj.created.split('T')[0]}</span>
                        </div>
                    </div>
                    {!isLocked && <button className="vw-btn vw-btn-g" onClick={() => setEditProj({ ...proj })}>Edit Details</button>}
                </div>

                {/* Phase Pipeline Visualization */}
                <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                    {PHASES.map((p, i) => {
                        const isPast = i < phaseIdx(proj.phase);
                        const isCurrent = i === phaseIdx(proj.phase);
                        const isViewing = i === pIdx;
                        
                        return (
                            <div key={p.key} 
                                 onClick={() => setViewPhase(p.key as PhaseKey)}
                                 style={{ 
                                    flex: 1, 
                                    padding: "10px 12px", 
                                    borderRadius: "var(--r)",
                                    background: isViewing ? "var(--tx)" : (isCurrent ? "var(--bg3)" : (isPast ? "var(--gnd)" : "var(--bg)")),
                                    color: isViewing ? "var(--bg)" : (isPast ? "var(--gn)" : "var(--tx2)"),
                                    border: `1px solid ${isViewing ? "var(--tx)" : (isCurrent ? "var(--bdr2)" : "var(--bdr)")}`,
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                 }}>
                                <div style={{ fontSize: 10, fontFamily: "var(--m)", opacity: 0.8, marginBottom: 4 }}>PHASE 0{i+1}</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                                {isPast && <div style={{ fontSize: 10, marginTop: 6 }}>✓ Completed</div>}
                                {isCurrent && <div style={{ fontSize: 10, marginTop: 6, color: "var(--or)" }}>▶ In Progress</div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Quick Navigation Links */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                <button className="vw-btn vw-btn-g" style={{ padding: "16px", justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", height: "auto" }} onClick={() => setTab("gates")}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>⛩️</div>
                    <div style={{ fontWeight: 600 }}>Phase Gates</div>
                    <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{gatesPassed}/4 Gates Passed</div>
                </button>
                <button className="vw-btn vw-btn-g" style={{ padding: "16px", justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", height: "auto" }} onClick={() => setTab("models")}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>🧊</div>
                    <div style={{ fontWeight: 600 }}>3D Models</div>
                    <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Manage exports and viewers</div>
                </button>
                <button className="vw-btn vw-btn-g" style={{ padding: "16px", justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", height: "auto" }} onClick={() => setTab("library")}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>📚</div>
                    <div style={{ fontWeight: 600 }}>Prompt Library</div>
                    <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{pLogs.filter(l => l.publishTarget && l.publishTarget !== 'none').length} saved prompts</div>
                </button>
                <button className="vw-btn vw-btn-g" style={{ padding: "16px", justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", height: "auto" }} onClick={() => setTab("logs")}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>📝</div>
                    <div style={{ fontWeight: 600 }}>Activity Logs</div>
                    <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{pLogs.length} total logs</div>
                </button>
            </div>

            {/* Phase Tools */}
            <div className="vw-cd" style={{ padding: "16px 18px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                        <div className="vw-cd-t">Suggested Tools for {phaseOf(activePhase)?.label}</div>
                        <div className="vw-cd-s">Curated AI tools optimized for your current stage in the pipeline.</div>
                    </div>
                </div>
                
                {phaseTools.length > 0 ? (
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
                ) : (
                    <div style={{ padding: "30px", textAlign: "center", color: "var(--tx3)", background: "var(--bg)", borderRadius: "var(--r)" }}>
                        No specific tools defined for this phase yet.
                    </div>
                )}
            </div>

            {/* Two-column layout for Other Tools & Recent Activity */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Recent prompts */}
                <div className="vw-cd" style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div className="vw-cd-t">Recent Activity</div>
                        {pLogs.length > 0 && <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setTab("logs")}>View all</button>}
                    </div>
                    
                    {pLogs.length > 0 ? (
                        <div className="vw-tw"><table>
                            <thead><tr><th>Date</th><th>Tool / Prompt</th></tr></thead>
                            <tbody>{[...pLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map(l => (
                                <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setEditLog({ ...l })}>
                                    <td className="vw-mono" style={{ width: "90px" }}>{l.date.split('T')[0]}</td>
                                    <td>
                                        <div style={{ fontSize: 10, fontWeight: 500, color: "var(--tx2)", marginBottom: 2 }}>{l.tool} <span className={`vw-pill ${l.status.toLowerCase()}`} style={{ display: "inline-block", transform: "scale(0.8)", transformOrigin: "left center" }}>{l.status}</span></div>
                                        <div style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--m)", fontSize: 11 }}>{l.prompt || "—"}</div>
                                    </td>
                                </tr>
                            ))}</tbody>
                        </table></div>
                    ) : (
                        <div style={{ padding: "20px", textAlign: "center", color: "var(--tx3)", fontSize: 12 }}>No activity logged yet.</div>
                    )}
                </div>

                {/* Other tools */}
                <div className="vw-cd" style={{ padding: "16px 18px" }}>
                    <div className="vw-cd-t" style={{ marginBottom: 12, color: "var(--tx)" }}>All Other Tools</div>
                    {otherTools.length > 0 ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {otherTools.map(t => t.internal ? (
                                <button key={t.id} className="vw-btn vw-btn-g vw-btn-sm" style={{ opacity: isLocked ? .3 : .8, cursor: isLocked ? "default" : "pointer" }} onClick={() => !isLocked && openTool(t)}>{t.icon} {t.name}</button>
                            ) : (
                                <a key={t.id} href={isLocked ? undefined : t.url} target="_blank" rel="noopener noreferrer" className="vw-btn vw-btn-g vw-btn-sm" style={{ opacity: isLocked ? .3 : t.future ? .5 : .8, borderStyle: t.future ? "dashed" : "solid", background: t.future ? "var(--ord)" : "transparent", cursor: isLocked ? "default" : "pointer" }} onClick={() => !isLocked && setActiveTool(t)}>{t.icon} {t.name}{t.future ? " ◇" : ""} ↗</a>
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: "20px", textAlign: "center", color: "var(--tx3)", fontSize: 12 }}>No other tools available.</div>
                    )}
                </div>
            </div>
        </div>
    );
}