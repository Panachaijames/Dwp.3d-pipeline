"use client";
import React, { useState } from 'react';
import { PORTAL_JOBS, OUTSOURCE_RENDERERS } from './constants';

export default function Portal3DTab() {
    const [filter, setFilter] = useState("all");
    const [view, setView] = useState<"inhouse" | "outsource">("inhouse");

    const jobs = PORTAL_JOBS.filter(j => view === "inhouse" ? j.id.startsWith("D") : j.id.startsWith("J"));
    const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);

    return (
        <div className="vw-pnl">
            <div className="vw-ph" style={{ display: "flex", justifyContent: "space-between" }}>
                <div><div className="vw-ph-t">3D Portal</div><div className="vw-ph-s">{filtered.length} jobs</div></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <button className={`vw-btn ${view === "inhouse" ? "vw-btn-p" : "vw-btn-g"} vw-btn-sm`} onClick={() => setView("inhouse")}>In-house ({PORTAL_JOBS.filter(j => j.id.startsWith("D")).length})</button>
                <button className={`vw-btn ${view === "outsource" ? "vw-btn-p" : "vw-btn-g"} vw-btn-sm`} onClick={() => setView("outsource")}>Outsource ({PORTAL_JOBS.filter(j => j.id.startsWith("J")).length})</button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    {["all", "In progress", "Pending", "Review", "Complete"].map(f => <button key={f} className={`vw-style-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f}</button>)}
                </div>
            </div>
            <div className="vw-cd" style={{ padding: 0 }}><div className="vw-tw"><table>
                <thead><tr><th>ID</th><th>Project</th>{view === "outsource" && <th>Company</th>}<th>Render</th><th>Type</th><th>Designer</th><th>Status</th><th>Priority</th><th>Due</th><th>Upload</th></tr></thead>
                <tbody>{filtered.map(j => (
                    <tr key={j.id}>
                        <td className="vw-mono">{j.id}</td><td style={{ fontWeight: 500 }}>{j.project}</td>
                        {view === "outsource" && <td style={{ fontSize: 10 }}>{j.company}</td>}
                        <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.render}</td>
                        <td style={{ fontSize: 9, color: "var(--tx3)" }}>{j.type}</td><td>{j.designer}</td>
                        <td><span className={`vw-pill ${j.status === "In progress" ? "advanced" : j.status === "Pending" ? "revised" : j.status === "Review" ? "revised" : "advanced"}`}>{j.status}</span></td>
                        <td><span style={{ fontSize: 9, color: j.priority === "Urgent" ? "var(--rd)" : j.priority === "Presentation" ? "var(--or)" : "var(--tx3)" }}>{j.priority}</span></td>
                        <td className="vw-mono">{j.due}</td>
                        <td>{j.uploaded ? <span style={{ color: "var(--gn)", fontSize: 9 }}>✓ {j.uploaded}</span> : <button className="vw-btn vw-btn-g vw-btn-sm">Upload</button>}</td>
                    </tr>
                ))}</tbody>
            </table></div></div>
        </div>
    );
}
