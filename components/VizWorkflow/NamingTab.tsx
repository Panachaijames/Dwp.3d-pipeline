"use client";
import React, { useState, useMemo } from 'react';

const FILETYPES = ["Still Image", "Animation", "360 Panorama", "VR", "AR", "Video", "Presentation"];
const PHASES_ABBR = ["BSA", "CON", "SCH", "DD"];
const DELIVERABLES = ["INT", "EXT", "AER", "DET", "MAT", "LAN", "SEC"];

export default function NamingTab() {
    const [phase, setPhase] = useState("CON");
    const [zone, setZone] = useState("lobby");
    const [variant, setVariant] = useState("A");
    const [version, setVersion] = useState("01");
    const [tool, setTool] = useState("MJ");
    const [deliverable, setDeliverable] = useState("INT");
    const [fileType, setFileType] = useState("png");

    const name = useMemo(() =>
        `${phase}_${zone}_opt${variant}_v${version}_${tool}.${fileType}`, [phase, zone, variant, version, tool, fileType]);

    return (
        <div className="vw-pnl">
            <div className="vw-ph"><div className="vw-ph-t">Naming Convention</div><div className="vw-ph-s">Standardise file names across all visualization outputs.</div></div>
            <div className="vw-nd">{name}</div>
            <div className="vw-cd" style={{ padding: 18 }}>
                <div className="vw-nc">
                    <select value={phase} onChange={e => setPhase(e.target.value)}>{PHASES_ABBR.map(p => <option key={p}>{p}</option>)}</select>
                    <input value={zone} onChange={e => setZone(e.target.value)} placeholder="zone" />
                    <select value={variant} onChange={e => setVariant(e.target.value)}>{["A", "B", "C", "D"].map(v => <option key={v}>opt{v}</option>)}</select>
                    <input value={version} onChange={e => setVersion(e.target.value)} placeholder="01" style={{ width: 40 }} />
                    <select value={tool} onChange={e => setTool(e.target.value)}>{["MJ", "SD", "D5", "3D", "DR", "KR", "PM", "VR", "MG", "RV"].map(t => <option key={t}>{t}</option>)}</select>
                    <select value={fileType} onChange={e => setFileType(e.target.value)}>{["png", "jpg", "psd", "tiff", "mp4", "pdf"].map(f => <option key={f}>{f}</option>)}</select>
                </div>
            </div>
            <div className="vw-cd" style={{ padding: 18, marginTop: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 8 }}>Convention Reference</div>
                <div style={{ fontSize: 10, color: "var(--tx2)", lineHeight: 1.6 }}>
                    <code style={{ fontFamily: "var(--m)", fontSize: 10, background: "var(--bg3)", padding: "2px 6px", borderRadius: 3 }}>[PHASE]_[zone]_opt[variant]_v[version]_[TOOL].[ext]</code>
                    <div style={{ marginTop: 8 }}>
                        <strong>Phase:</strong> BSA, CON, SCH, DD<br />
                        <strong>Tool suffixes:</strong> MJ (Midjourney), SD (Stable Diffusion), D5 (D5 Render), 3D (3DS Max), DR (dwp.render), KR (Krea), PM (PromeAI), VR (Veras), MG (Magnific)<br />
                        <strong>Deliverables:</strong> {DELIVERABLES.join(", ")}
                    </div>
                </div>
            </div>
        </div>
    );
}
