"use client";
import React from 'react';
import { VizProject, SECTORS } from './constants';

interface Props { project: VizProject; projects: VizProject[]; onSave: (p: VizProject) => void; onDelete?: (id: string) => void; onClose: () => void; }

export default function ProjectModal({ project, projects, onSave, onDelete, onClose }: Props) {
    const [p, setP] = React.useState(project);
    const isEdit = projects.find(x => x.id === p.id);
    const canDelete = Boolean(isEdit && onDelete && !p.catalogKey && !p.requestKey);
    return (
        <div className="vw-ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="vw-mdl">
                <div className="vw-mdl-t">{isEdit ? "Edit Project" : "New Project"}</div>
                <div className="vw-fg">
                    <div className="vw-fgi"><label className="vw-fl">Name</label><input className="vw-fi" value={p.name} onChange={e => setP({ ...p, name: e.target.value })} placeholder="Bumrungrad Tower" /></div>
                    <div className="vw-fgi"><label className="vw-fl">ID</label><input className="vw-fi" value={p.projectId} onChange={e => setP({ ...p, projectId: e.target.value })} placeholder="DWP-2026-BKK-042" style={{ fontFamily: "var(--m)" }} /></div>
                    <div className="vw-fgi"><label className="vw-fl">Sector</label><select className="vw-fs" value={p.sector} onChange={e => setP({ ...p, sector: e.target.value })}>{SECTORS.map(s => <option key={s}>{s}</option>)}</select></div>
                    <div className="vw-fgi"><label className="vw-fl">Studio</label><input className="vw-fi" value={p.studio} onChange={e => setP({ ...p, studio: e.target.value })} placeholder="Bangkok" /></div>
                </div>
                <div className="vw-mdl-a">
                    {canDelete && <button className="vw-btn vw-btn-d vw-btn-sm" style={{ marginRight: "auto" }} onClick={() => { if (confirm('Are you sure you want to delete this project? All prompt logs and PDF data will be permanently deleted.')) onDelete?.(p.id); }}>Delete Project</button>}
                    <button className="vw-btn vw-btn-g" onClick={onClose}>Cancel</button>
                    <button className="vw-btn vw-btn-p" onClick={() => onSave(p)}>Save</button>
                </div>
            </div>
        </div>
    );
}
