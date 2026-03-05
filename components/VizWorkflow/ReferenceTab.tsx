"use client";
import React from 'react';
import { PHASES, GATES, TOOLS } from './constants';

export default function ReferenceTab() {
    return (
        <div className="vw-pnl">
            <div className="vw-ph"><div className="vw-ph-t">Workflow Reference</div><div className="vw-ph-s">End-to-end visualization pipeline</div></div>
            <div className="vw-rg">
                {PHASES.map(ph => (
                    <div className="vw-rc" key={ph.key}>
                        <h4 style={{ color: ph.color }}>{ph.key} — {ph.label}</h4>
                        <div className="vw-rl">{ph.subtitle}</div>
                        <div className="vw-rl" style={{ marginTop: 6 }}>Tools</div>
                        <ul>{TOOLS.filter(t => t.phase.includes(ph.key)).sort((a, b) => a.order - b.order).map(t => <li key={t.id}>{t.icon} {t.name}{t.future ? " ◇" : ""}</li>)}</ul>
                    </div>
                ))}
            </div>
            <div className="vw-ug" style={{ marginTop: 16 }}>
                {GATES.map(g => (
                    <div className="vw-uc" key={g.id}>
                        <div className="un">GATE {g.id}</div>
                        <div className="ut">{g.from} → {g.to}</div>
                        <div className="ud"><strong>Reviewer:</strong> {g.reviewer}</div>
                        <div className="uo">{g.focus.join(" · ")}</div>
                    </div>
                ))}
            </div>
            <div className="vw-cd" style={{ padding: 18, marginTop: 16 }}>
                <div className="vw-cd-t" style={{ marginBottom: 8 }}>Naming Convention</div>
                <div style={{ fontFamily: "var(--m)", fontSize: 11, color: "var(--or)", background: "var(--inp)", padding: 10, borderRadius: "var(--r)", border: "1px solid var(--bdr)" }}>
                    [PHASE]_[zone]_opt[variant]_v[version]_[TOOL].[ext]
                </div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 6, lineHeight: 1.6 }}>
                    Example: <code style={{ fontFamily: "var(--m)", background: "var(--bg3)", padding: "1px 5px", borderRadius: 3 }}>CON_lobby_optA_v01_MJ.png</code>
                </div>
            </div>
        </div>
    );
}
