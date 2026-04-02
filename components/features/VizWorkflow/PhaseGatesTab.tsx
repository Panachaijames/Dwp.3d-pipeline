"use client";
import React, { useState } from 'react';
import { PHASES, GATES, VizProject, PhaseKey, phaseIdx } from './constants';
import GatePanel from './GatePanel';

interface Props {
    proj: VizProject | null;
    projects: VizProject[];
    passGate: (pid: string, gid: number, ok: boolean) => void;
    setPhase: (pid: string, phaseKey: PhaseKey) => void;
}

export default function PhaseGatesTab({ proj, projects, passGate, setPhase }: Props) {
    const [gateOpen, setGateOpen] = useState<{ gate: typeof GATES[number]; project: VizProject } | null>(null);

    if (!proj) return <div className="vw-pnl"><div className="vw-empty"><div className="ei">◎</div><div className="et">No project selected</div></div></div>;

    const p = projects.find(x => x.id === proj.id) || proj;
    const pi = PHASES.findIndex(ph => ph.key === p.phase);

    return (
        <div className="vw-pnl">
            <div className="vw-ph"><div className="vw-ph-t">Phase Gate Reviews</div><div className="vw-ph-s">{p.name}</div></div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                {PHASES.map((ph, i) => (
                    <React.Fragment key={ph.key}>
                        <div className={`vw-pipe-s ${i === pi ? "act" : i < pi ? "done" : ""}`} style={{ cursor: "pointer" }} onClick={() => setPhase(p.id, ph.key)} title={`Set to ${ph.label}`}>
                            <div className="ps-c">{ph.key}</div><div className="ps-n">{ph.label}</div>
                        </div>
                        {i < PHASES.length - 1 && (
                            <div className="vw-gm" onClick={() => setGateOpen({ gate: GATES[i], project: p })}>
                                <div className={`vw-gd ${p.gates[i + 1]?.passed === true ? "pass" : p.gates[i + 1]?.passed === false ? "fail" : ""}`}>G{i + 1}</div>
                                <div className="vw-gl">Gate</div>
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
            <div style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 14, marginTop: -10 }}>Click any phase to move the project there. Phase Gates ahead will reset.</div>
            {gateOpen && gateOpen.project.id === p.id && <GatePanel gate={gateOpen.gate} project={p} onPass={(pid, gid, ok) => { passGate(pid, gid, ok); setGateOpen(null); }} onClose={() => setGateOpen(null)} />}
            <div className="vw-cd"><div className="vw-cd-t" style={{ marginBottom: 10 }}>Phase Gate Reference</div>
                <div className="vw-rg">{GATES.map(g => (
                    <div className="vw-rc" key={g.id}><h4>Phase Gate {g.id}: {g.from} → {g.to}</h4><div style={{ fontSize: 8, color: "var(--tx3)", marginBottom: 4 }}>Reviewer: {g.reviewer}</div><ul>{g.focus.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
                ))}</div>
                <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 8, fontStyle: "italic" }}>High-profile projects escalate Phase Gate 4 to the Group Creative Director.</div>
            </div>
        </div>
    );
}
