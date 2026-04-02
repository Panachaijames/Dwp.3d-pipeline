"use client";
import React, { useState } from 'react';
import { VizProject } from './constants';

interface GateType { id: number; from: string; to: string; focus: string[]; reviewer: string; }
interface Props { gate: GateType; project: VizProject; onPass: (pid: string, gid: number, ok: boolean) => void; onClose: () => void; }

export default function GatePanel({ gate, project, onPass, onClose }: Props) {
    const [checks, setChecks] = useState(gate.focus.map(() => false));
    const all = checks.every(Boolean);
    const ex = project.gates[gate.id];
    return (
        <div className="vw-gp">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--or)", fontWeight: 600 }}>Phase Gate {gate.id} Review</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{gate.from} → {gate.to}</div>
                    <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 1 }}>Reviewer: {gate.reviewer}</div>
                </div>
                <button className="vw-btn vw-btn-g vw-btn-sm" onClick={onClose}>Close</button>
            </div>
            {ex ? (
                <div style={{ marginTop: 12, padding: 12, background: ex.passed ? "var(--gnd)" : "var(--rdd)", borderRadius: "var(--r)", fontSize: 11 }}>
                    <span style={{ color: ex.passed ? "var(--gn)" : "var(--rd)", fontWeight: 600 }}>{ex.passed ? "✓ Passed" : "✗ Failed"}</span>
                    <span style={{ color: "var(--tx3)", marginLeft: 10, fontSize: 9 }}>{ex.date}</span>
                </div>
            ) : <>
                <ul className="vw-gcl">
                    {gate.focus.map((f, i) => <li key={i}><div className={`vw-cb ${checks[i] ? "ck" : ""}`} onClick={() => setChecks(p => p.map((c, j) => j === i ? !c : c))}>{checks[i] ? "✓" : ""}</div>{f}</li>)}
                </ul>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button className="vw-btn vw-btn-ok" disabled={!all} style={{ opacity: all ? 1 : .4 }} onClick={() => onPass(project.id, gate.id, true)}>Pass Phase Gate {gate.id}</button>
                    <button className="vw-btn vw-btn-d vw-btn-sm" onClick={() => onPass(project.id, gate.id, false)}>Fail</button>
                </div>
            </>}
        </div>
    );
}
