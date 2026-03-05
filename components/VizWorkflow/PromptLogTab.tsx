"use client";
import React from 'react';
import { VizProject, VizLog, phaseOf, freshLog } from './constants';

interface Props {
    proj: VizProject | null;
    pLogs: VizLog[];
    setEditLog: (l: VizLog | null) => void;
    freshLog: (pid: string, toolName?: string) => VizLog;
}

export default function PromptLogTab({ proj, pLogs, setEditLog, freshLog: makeFreshLog }: Props) {
    return (
        <div className="vw-pnl">
            <div className="vw-ph" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div className="vw-ph-t">Prompt Log</div><div className="vw-ph-s">{proj ? `${pLogs.length} entries — ${proj.name}` : "Select a project"}</div></div>
                {proj && <button className="vw-btn vw-btn-p vw-btn-sm" onClick={() => setEditLog(makeFreshLog(proj.id))}>+ Log</button>}
            </div>
            {!proj ? <div className="vw-empty"><div className="ei">▤</div><div className="et">No project selected</div></div>
                : pLogs.length === 0 ? <div className="vw-empty"><div className="ei">▤</div><div className="et">No prompts</div><div className="es">Log your first AI prompt.</div><button className="vw-btn vw-btn-p" onClick={() => setEditLog(makeFreshLog(proj.id))}>Log Prompt</button></div>
                    : <div className="vw-cd" style={{ padding: 0 }}><div className="vw-tw"><table>
                        <thead><tr><th>Date</th><th>Phase</th><th>Name / Tool</th><th>Prompt</th><th>Output</th><th>Status</th><th>Library</th><th></th></tr></thead>
                        <tbody>{[...pLogs].sort((a, b) => b.date.localeCompare(a.date)).map(l => (
                            <tr key={l.id}>
                                <td className="vw-mono">{l.date}</td>
                                <td><span className="vw-badge" style={{ background: `${phaseOf(l.phase)?.color}12` }}><span className="vw-dot" style={{ background: phaseOf(l.phase)?.color }} />{l.phase}</span></td>
                                <td>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: "var(--tx1)" }}>{l.name || 'Unnamed Prompt'}</div>
                                    <div style={{ fontSize: 9, color: "var(--tx3)" }}>{l.tool}</div>
                                </td>
                                <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--m)", fontSize: 9 }}>{l.prompt}</td>
                                <td className="vw-mono">{l.outputFile}</td>
                                <td><span className={`vw-pill ${l.status.toLowerCase()}`}>{l.status}</span></td>
                                <td style={{ textAlign: "center", fontSize: 10 }}>
                                    {l.publishTarget === 'global' ? <span style={{ color: "var(--gn)" }}>Global</span> :
                                        l.publishTarget === 'project' ? <span style={{ color: "var(--or)" }}>Project</span> :
                                            "—"}
                                </td>
                                <td><button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setEditLog({ ...l })}>Edit</button></td>
                            </tr>
                        ))}</tbody>
                    </table></div></div>}
        </div>
    );
}
