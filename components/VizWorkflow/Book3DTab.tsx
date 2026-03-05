"use client";
import React, { useState } from 'react';
import { VizProject, OUTSOURCE_RENDERERS, SECTORS } from './constants';
import { DrivePicker } from '../SubmissionPortal/DrivePicker';
import { notifyNewWorkRequest } from '../../services/emailService';
import { ProjectRequest, ProjectArea } from '../../types';

interface Props { proj: VizProject | null; }

const DEPARTMENTS = ["Architecture", "Interior Design", "Urban Planning", "Marketing", "Product Design"];
const PREFERRED_TOOLS = ["3ds Max", "Render for Revit", "AI Rendering"];

const emptyAreas = (): ProjectArea[] => [
    { id: 1, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
    { id: 2, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
    { id: 3, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
];

const initForm = (projName?: string) => ({
    studioFullName: '', projectNumber: '', requestName: '', projectName: projName || '',
    department: '', requester: '', numberOfRenderings: '1',
    sharedPresentationLink: '', designReviewBooking: '',
    providedFiles: '', description: '', deadline: '', preferredTool: '',
    driveFolderId: '', driveFolderName: '', company: '',
    areas: emptyAreas(),
});

export default function Book3DTab({ proj }: Props) {
    const [tab, setTab] = useState<"inhouse" | "outsource">("inhouse");
    const [catFilter, setCatFilter] = useState("All");
    const [form, setForm] = useState(initForm(proj?.name));
    const [expandedArea, setExpandedArea] = useState<number | null>(1);
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const filteredRenderers = catFilter === "All" ? OUTSOURCE_RENDERERS : OUTSOURCE_RENDERERS.filter(r => r.category === catFilter);

    const handleAreaChange = (index: number, field: keyof ProjectArea, value: string) => {
        const newAreas = [...form.areas];
        newAreas[index] = { ...newAreas[index], [field]: value };
        setForm({ ...form, areas: newAreas });
    };

    const generateRequestId = (studioName: string) => {
        let studioCode = 'XX';
        if (studioName && studioName.trim().length >= 2) {
            studioCode = studioName.trim().substring(0, 2).toUpperCase();
        }
        const now = new Date();
        const yearShort = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const randomChars = Math.random().toString(36).substring(2, 4).toUpperCase();
        return `${studioCode}${yearShort}${month}${day}${randomChars}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const newId = generateRequestId(form.studioFullName);
        const newRequest: ProjectRequest = {
            id: newId,
            studioFullName: form.studioFullName,
            projectNumber: form.projectNumber,
            requestName: form.requestName,
            projectName: form.projectName,
            department: form.department,
            requester: form.requester,
            numberOfRenderings: parseInt(form.numberOfRenderings) || 0,
            sharedPresentationLink: form.sharedPresentationLink,
            designReviewBooking: form.designReviewBooking,
            providedFiles: form.providedFiles ? form.providedFiles.split(',').map(s => s.trim()) : [],
            description: form.description,
            deadline: form.deadline,
            inputType: undefined,
            outputType: undefined,
            preferredTool: form.preferredTool as ProjectRequest['preferredTool'],
            areas: form.areas,
            driveFolderId: form.driveFolderId,
            driveFolderName: form.driveFolderName,
            status: 'Submitted',
            currentPhase: 'queued',
            progress: 0,
            priority: 'Medium',
            submittedBy: form.requester || 'Current User',
            timestamp: new Date().toISOString(),
        };

        try {
            await notifyNewWorkRequest(newRequest, '');
        } catch (err) {
            console.error("Email notification failed:", err);
        }

        setSubmitting(false);
        setSubmitted(true);
        setTimeout(() => {
            setSubmitted(false);
            setForm(initForm(proj?.name));
            setExpandedArea(1);
            setShowDrivePicker(false);
        }, 3000);
    };

    /* ─── Shared request form (used for both in-house & outsource) ─── */
    const renderForm = () => (
        <form onSubmit={handleSubmit}>
            {/* ── Section 1: Project Info ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 12 }}>Project Information</div>
                <div className="vw-fg">
                    <div className="vw-fgi"><label className="vw-fl">Studio Full Name *</label><input className="vw-fi" required value={form.studioFullName} onChange={e => setForm({ ...form, studioFullName: e.target.value })} placeholder="e.g. DWP Bangkok" /></div>
                    <div className="vw-fgi"><label className="vw-fl">Project Number *</label><input className="vw-fi" required value={form.projectNumber} onChange={e => setForm({ ...form, projectNumber: e.target.value })} placeholder="e.g. 24-0045" /></div>
                    <div className="vw-fgi"><label className="vw-fl">Request Name *</label><input className="vw-fi" required value={form.requestName} onChange={e => setForm({ ...form, requestName: e.target.value })} placeholder="Unique title for this request" /></div>
                    <div className="vw-fgi"><label className="vw-fl">Project Name *</label><input className="vw-fi" required value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} placeholder="Official Project Name" /></div>
                </div>
            </div>

            {/* ── Section 2: Destination Folder (Google Drive) ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 8 }}>Destination Folder</div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 10 }}>Select a Google Drive folder. All submissions will be uploaded there automatically.</div>
                {!form.driveFolderId ? (
                    <button type="button" className="vw-btn vw-btn-g" onClick={() => setShowDrivePicker(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14 }}>📁</span> Select Drive Folder
                    </button>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--bg2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 18 }}>📁</span>
                            <div>
                                <div style={{ fontSize: 10, color: "var(--tx3)" }}>Selected Folder</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ac)" }}>{form.driveFolderName}</div>
                            </div>
                        </div>
                        <button type="button" className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setForm({ ...form, driveFolderId: '', driveFolderName: '' })}>✕</button>
                    </div>
                )}
                {showDrivePicker && (
                    <div style={{ marginTop: 10 }}>
                        <DrivePicker
                            onSelect={(id, name) => {
                                setForm({ ...form, driveFolderId: id, driveFolderName: name });
                                setShowDrivePicker(false);
                            }}
                            onCancel={() => setShowDrivePicker(false)}
                        />
                    </div>
                )}
            </div>

            {/* ── Section 3: Requester Details ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 12 }}>Requester Details</div>
                <div className="vw-fg">
                    <div className="vw-fgi"><label className="vw-fl">Requester Name *</label><input className="vw-fi" required value={form.requester} onChange={e => setForm({ ...form, requester: e.target.value })} placeholder="Your Name" /></div>
                    <div className="vw-fgi">
                        <label className="vw-fl">Department *</label>
                        <select className="vw-fs" required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                            <option value="" disabled>Select Department</option>
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Section 4: Requirements ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 12 }}>Requirements</div>
                <div className="vw-fg">
                    <div className="vw-fgi"><label className="vw-fl">Number of Renderings</label><input className="vw-fi" type="number" min="1" value={form.numberOfRenderings} onChange={e => setForm({ ...form, numberOfRenderings: e.target.value })} /></div>
                    <div className="vw-fgi"><label className="vw-fl">Deadline *</label><input className="vw-fi" type="date" required value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></div>
                    <div className="vw-fgi full"><label className="vw-fl">Provided Files (Links)</label><input className="vw-fi" value={form.providedFiles} onChange={e => setForm({ ...form, providedFiles: e.target.value })} placeholder="Paste file links separated by commas" /></div>
                    <div className="vw-fgi full"><label className="vw-fl">Description / Notes</label><textarea className="vw-ft" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Special requirements, context..." /></div>
                </div>
            </div>

            {/* ── Section 5: Preferred Tool ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 10 }}>Preferred Tool</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {PREFERRED_TOOLS.map(tool => (
                        <button key={tool} type="button"
                            className={`vw-btn ${form.preferredTool === tool ? "vw-btn-p" : "vw-btn-g"} vw-btn-sm`}
                            onClick={() => setForm({ ...form, preferredTool: tool })}
                        >{tool}</button>
                    ))}
                </div>
                <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 6 }}>Select the primary software or AI tool for this project.</div>
            </div>

            {/* ── Section 6: Areas & Scope ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div className="vw-cd-t">Areas &amp; Scope Definition</div>
                    <span style={{ fontSize: 9, color: "var(--tx3)" }}>Define up to 3 areas</span>
                </div>
                {[0, 1, 2].map(index => (
                    <div key={index} style={{ border: "1px solid var(--bd)", borderRadius: 8, marginBottom: 6, overflow: "hidden" }}>
                        <button type="button"
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg2)", border: "none", cursor: "pointer", color: "var(--tx)" }}
                            onClick={() => setExpandedArea(expandedArea === index + 1 ? null : index + 1)}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--ac)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{index + 1}</span>
                                <span style={{ fontWeight: 500, fontSize: 12 }}>{form.areas[index].scope || `Area ${index + 1}`}</span>
                            </div>
                            <span style={{ fontSize: 10 }}>{expandedArea === index + 1 ? "▾" : "▸"}</span>
                        </button>
                        {expandedArea === index + 1 && (
                            <div style={{ padding: 14 }}>
                                <div className="vw-fg">
                                    <div className="vw-fgi full"><label className="vw-fl">Scope Name</label><input className="vw-fi" value={form.areas[index].scope} onChange={e => handleAreaChange(index, 'scope', e.target.value)} placeholder="e.g. Living Room Rendering" /></div>
                                    <div className="vw-fgi"><label className="vw-fl">Suggested Designer</label><input className="vw-fi" value={form.areas[index].designer} onChange={e => handleAreaChange(index, 'designer', e.target.value)} placeholder="Designer Name" /></div>
                                    <div className="vw-fgi"><label className="vw-fl">Target Date</label><input className="vw-fi" type="date" value={form.areas[index].targetDate} onChange={e => handleAreaChange(index, 'targetDate', e.target.value)} /></div>
                                    <div className="vw-fgi full"><label className="vw-fl">Task Description</label><textarea className="vw-ft" value={form.areas[index].description} onChange={e => handleAreaChange(index, 'description', e.target.value)} placeholder="Specific requirements for this area..." /></div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Outsource: Company Info (shown only in outsource mode) ── */}
            {tab === "outsource" && form.company && (
                <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                    <div className="vw-cd-t" style={{ marginBottom: 8 }}>Outsource To</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--ac)", background: "var(--bg2)" }}>
                        <span style={{ fontSize: 18 }}>◫</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{form.company}</div>
                            {(() => { const v = OUTSOURCE_RENDERERS.find(r => r.name === form.company); return v ? <div style={{ fontSize: 10, color: "var(--tx3)" }}>{v.email} · {v.loc} · {v.category}</div> : null; })()}
                        </div>
                        <button type="button" className="vw-btn vw-btn-g vw-btn-sm" style={{ marginLeft: "auto" }} onClick={() => setForm({ ...form, company: '' })}>Change</button>
                    </div>
                </div>
            )}

            {/* ── Submit ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingBottom: 60 }}>
                <div style={{ fontSize: 9, color: "var(--tx3)" }}>* Estimate: <span style={{ color: "var(--ac)" }}>~24h turnaround</span> for basic visualizations.</div>
                <button type="submit" className="vw-btn vw-btn-p" disabled={submitting} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {submitting ? "Submitting..." : submitted ? "✓ Submitted!" : "◇ Submit Request"}
                </button>
            </div>
        </form>
    );

    /* ─── Success Message ─── */
    if (submitted) {
        return (
            <div className="vw-pnl">
                <div style={{ maxWidth: 400, margin: "60px auto", textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Request Submitted</div>
                    <div style={{ fontSize: 11, color: "var(--tx3)", lineHeight: 1.5 }}>Your work request has been submitted successfully. An email notification has been sent to the pipeline lead.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="vw-pnl">
            <div className="vw-ph"><div className="vw-ph-t">Book a 3D</div><div className="vw-ph-s">Submit visualization work requests</div></div>
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                <button className={`vw-btn ${tab === "inhouse" ? "vw-btn-p" : "vw-btn-g"}`} onClick={() => { setTab("inhouse"); setForm({ ...form, company: '' }); }}>In-house</button>
                <button className={`vw-btn ${tab === "outsource" ? "vw-btn-p" : "vw-btn-g"}`} onClick={() => setTab("outsource")}>Outsource</button>
            </div>

            {tab === "inhouse" ? (
                renderForm()
            ) : (
                <div>
                    {/* Vendor selection (only if no company chosen yet) */}
                    {!form.company && (
                        <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                            <div className="vw-cd-t" style={{ marginBottom: 10 }}>Select Vendor</div>
                            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                                {["All", "3D Visualizer", "Revit Support"].map(cat => (
                                    <button key={cat} className={`vw-style-chip ${catFilter === cat ? "on" : ""}`} onClick={() => setCatFilter(cat)}>{cat}</button>
                                ))}
                            </div>
                            <div className="vw-tw"><table>
                                <thead><tr><th>Name</th><th>Email</th><th>Category</th><th>Location</th><th>Specialization</th><th>Rate</th><th></th></tr></thead>
                                <tbody>{filteredRenderers.map(r => (
                                    <tr key={r.name}>
                                        <td style={{ fontWeight: 500 }}>{r.name}</td>
                                        <td style={{ fontSize: 10 }}>{r.email}</td>
                                        <td><span className={`vw-pill ${r.category === "3D Visualizer" ? "advanced" : "revised"}`} style={{ fontSize: 8 }}>{r.category}</span></td>
                                        <td>{r.loc}</td>
                                        <td style={{ fontSize: 10, color: "var(--tx3)" }}>{r.spec}</td>
                                        <td className="vw-mono">{r.rate}</td>
                                        <td><button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setForm({ ...form, company: r.name })}>Select</button></td>
                                    </tr>
                                ))}</tbody>
                            </table></div>
                        </div>
                    )}
                    {/* Show the full form once a vendor is selected */}
                    {form.company && renderForm()}
                </div>
            )}
        </div>
    );
}
