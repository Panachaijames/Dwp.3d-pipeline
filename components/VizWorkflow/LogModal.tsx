"use client";
import React, { useState } from 'react';
import { VizLog, PHASES, TOOLS, STATUSES } from './constants';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';

interface Props { log: VizLog; logs: VizLog[]; onSave: (l: VizLog) => void; onDelete: (id: string) => void; onClose: () => void; }

export default function LogModal({ log, logs, onSave, onDelete, onClose }: Props) {
    const [l, setL] = useState(log);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const isEdit = logs.some(x => x.id === l.id);

    const handleSave = () => {
        onSave(l);
    };

    return (
        <div className="vw-ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="vw-mdl" style={{ width: 600, maxWidth: '90vw' }}>
                <div className="vw-mdl-t" style={{ marginBottom: 16 }}>{isEdit ? "Edit Prompt Log" : "New Prompt Log"}</div>

                <div className="vw-fg" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Top Row: Basic Info */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div className="vw-fgi" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="vw-fl">Phase</label>
                            <select className="vw-fs" value={l.phase} onChange={e => setL({ ...l, phase: e.target.value as any })}>
                                {PHASES.map(p => <option key={p.key} value={p.key}>{p.key} — {p.label}</option>)}
                            </select>
                        </div>
                        <div className="vw-fgi" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="vw-fl">Tool</label>
                            <select className="vw-fs" value={l.tool} onChange={e => setL({ ...l, tool: e.target.value })}>
                                {TOOLS.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="vw-fgi" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="vw-fl">Status</label>
                            <select className="vw-fs" value={l.status} onChange={e => setL({ ...l, status: e.target.value })}>
                                {STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Main Prompt Area - Much Larger */}
                    <div className="vw-fgi full" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label className="vw-fl" style={{ margin: 0 }}>Prompt Content</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    className="vw-fi"
                                    value={l.name || ''}
                                    onChange={e => setL({ ...l, name: e.target.value })}
                                    placeholder="Prompt Name (Required to Publish)"
                                    style={{ width: 180, padding: '4px 8px', fontSize: 11 }}
                                />
                                <select
                                    className="vw-fs"
                                    value={l.publishTarget || 'none'}
                                    onChange={e => setL({ ...l, publishTarget: e.target.value as any })}
                                    style={{
                                        width: 170, padding: '4px 8px', fontSize: 11,
                                        background: l.publishTarget && l.publishTarget !== 'none' ? 'rgba(74, 222, 128, 0.15)' : 'var(--card)',
                                        color: l.publishTarget && l.publishTarget !== 'none' ? 'var(--gn)' : 'var(--tx2)',
                                        borderColor: l.publishTarget && l.publishTarget !== 'none' ? 'var(--gn)' : 'var(--bdr)'
                                    }}
                                >
                                    <option value="none">Don't Publish</option>
                                    <option value="global">Publish: Global Library</option>
                                    <option value="project">Publish: Project Prompts</option>
                                </select>
                            </div>
                        </div>
                        <textarea
                            className="vw-ft"
                            value={l.prompt}
                            onChange={e => setL({ ...l, prompt: e.target.value })}
                            placeholder="Full prompt including parameters..."
                            style={{ fontFamily: "var(--m)", fontSize: 13, minHeight: 200, lineHeight: 1.5, padding: 12 }}
                        />
                    </div>

                    {/* Advanced Toggle */}
                    <div
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx3)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}
                    >
                        {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {showAdvanced ? "Hide additional details" : "Show additional details (Notes, Output File, References)"}
                    </div>

                    {/* Advanced Fields Container */}
                    {showAdvanced && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, borderTop: '1px solid var(--bdr)', paddingTop: 16 }}>
                            <div className="vw-fgi full" style={{ margin: 0 }}>
                                <label className="vw-fl">Notes / Rationale</label>
                                <textarea className="vw-ft" value={l.notes} onChange={e => setL({ ...l, notes: e.target.value })} placeholder="Feedback, rationale for this prompt..." style={{ minHeight: 60 }} />
                            </div>
                            <div className="vw-fgi full" style={{ margin: 0 }}>
                                <label className="vw-fl">References</label>
                                <input className="vw-fi" value={l.referenceInputs} onChange={e => setL({ ...l, referenceInputs: e.target.value })} placeholder="Source images, sketches, URLs" />
                            </div>
                            <div className="vw-fgi" style={{ flex: 1, minWidth: '45%', margin: 0 }}>
                                <label className="vw-fl">Output File Name</label>
                                <input className="vw-fi" value={l.outputFile} onChange={e => setL({ ...l, outputFile: e.target.value })} placeholder="CON_lobby_optA_v01_DR.png" style={{ fontFamily: "var(--m)", fontSize: 10 }} />
                            </div>
                            <div className="vw-fgi" style={{ flex: 1, minWidth: '45%', margin: 0 }}>
                                <label className="vw-fl">Author / Designer</label>
                                <input className="vw-fi" value={l.designer} onChange={e => setL({ ...l, designer: e.target.value })} />
                            </div>
                            <div className="vw-fgi" style={{ flex: 1, minWidth: '45%', margin: 0 }}>
                                <label className="vw-fl">Date</label>
                                <input className="vw-fi" type="date" value={l.date} onChange={e => setL({ ...l, date: e.target.value })} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="vw-mdl-a" style={{ marginTop: 24 }}>
                    {isEdit && <button className="vw-btn vw-btn-d vw-btn-sm" style={{ marginRight: "auto" }} onClick={() => onDelete(l.id)}>Delete Log</button>}
                    <button className="vw-btn vw-btn-g" onClick={onClose}>Cancel</button>
                    <button className="vw-btn vw-btn-p" onClick={handleSave}>Save Prompt Log</button>
                </div>
            </div>
        </div>
    );
}
