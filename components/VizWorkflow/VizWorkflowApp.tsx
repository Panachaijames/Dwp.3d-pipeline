"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
    PHASES, TOOLS, GATES, SECTORS, STATUSES,
    VizProject, VizLog, VizTool, PhaseKey,
    uid, today, phaseOf, freshProject, freshLog,
} from './constants';
import './vizworkflow.css';
import { supabase } from '@/services/supabaseClient';

import WorkspaceTab from './WorkspaceTab';
import PromptLogTab from './PromptLogTab';
import PhaseGatesTab from './PhaseGatesTab';
import PromptLibraryTab from './PromptLibraryTab';
import ImageLibraryTab from './ImageLibraryTab';
import ModelsTab from './ModelsTab';
import RenderTab from './RenderTab';
import NamingTab from './NamingTab';
import Book3DTab from './Book3DTab';
import Portal3DTab from './Portal3DTab';
import ReferenceTab from './ReferenceTab';
import RenderWorkspace from './RenderWorkspace';
import PromptGenWorkspace from './PromptGenWorkspace';
import ProjectModal from './ProjectModal';
import LogModal from './LogModal';
import { PdfLibrary } from '../PdfLibrary/PdfLibrary';
import { SettingsPortal } from '../SettingsPortal';

export default function VizWorkflowApp() {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const dark = theme === 'dark';

    const [projects, setProjects] = useState<VizProject[]>([]);
    const [logs, setLogs] = useState<VizLog[]>([]);
    const [ready, setReady] = useState(false);
    const [rail, setRail] = useState(true);
    const [proj, setProj] = useState<VizProject | null>(null);
    const [activeTool, setActiveTool] = useState<VizTool | null>(null);
    const [tab, setTab] = useState("workspace");
    const [viewPhase, setViewPhase] = useState<PhaseKey | null>(null);
    const [editProj, setEditProj] = useState<VizProject | null>(null);
    const [editLog, setEditLog] = useState<VizLog | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Load from Supabase on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch projects
                const { data: pData } = await supabase.from('viz_projects').select('*');
                if (pData) {
                    setProjects(pData.map(p => ({
                        id: p.id,
                        name: p.name,
                        projectId: p.project_id,
                        sector: p.sector,
                        studio: p.studio,
                        phase: p.phase as any,
                        gates: p.gates,
                        created: p.created
                    })));
                }

                // Fetch logs
                const { data: lData } = await supabase.from('viz_logs').select('*');
                if (lData) {
                    setLogs(lData.map(l => ({
                        id: l.id,
                        projectId: l.project_id,
                        phase: l.phase as any,
                        tool: l.tool,
                        prompt: l.prompt,
                        referenceInputs: l.reference_inputs,
                        outputFile: l.output_file,
                        status: l.status,
                        designer: l.designer,
                        date: l.date,
                        notes: l.notes,
                        inLibrary: l.in_library
                    })));
                }
            } catch (err) {
                console.error("Failed to load projects or logs", err);
            } finally {
                setReady(true);
            }
        };
        loadData();
    }, []);

    useEffect(() => { if (proj) { const u = projects.find(p => p.id === proj.id); if (u) setProj(u); } }, [projects]);
    useEffect(() => { if (proj) setViewPhase(proj.phase); }, [proj?.id]);

    const activePhase = viewPhase || (proj ? proj.phase : "BSA");
    const isLocked = false; // All phases unlocked

    const saveP = async (p: VizProject) => {
        setProjects(prev => prev.find(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]);
        setProj(p); setEditProj(null);

        // Upsert to Supabase
        await supabase.from('viz_projects').upsert({
            id: p.id,
            name: p.name,
            project_id: p.projectId,
            sector: p.sector,
            studio: p.studio,
            phase: p.phase,
            gates: p.gates,
            created: p.created
        });
    };

    const saveL = async (l: VizLog) => {
        setLogs(prev => prev.find(x => x.id === l.id) ? prev.map(x => x.id === l.id ? l : x) : [...prev, l]);
        setEditLog(null);

        // Upsert to Supabase
        await supabase.from('viz_logs').upsert({
            id: l.id,
            project_id: l.projectId,
            phase: l.phase,
            tool: l.tool,
            prompt: l.prompt,
            name: l.name,
            reference_inputs: l.referenceInputs,
            output_file: l.outputFile,
            status: l.status,
            designer: l.designer,
            date: l.date,
            notes: l.notes,
            publish_target: l.publishTarget
        });

        // If marked for publishing, push to the respective project or global library
        if (l.publishTarget && l.publishTarget !== 'none' && l.prompt?.trim()) {
            const projName = projects.find(p => p.id === l.projectId)?.name || l.projectId || 'Untitled';
            const endpoint = l.publishTarget === 'project' ? '/api/project-prompts' : '/api/prompt-library';

            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: l.prompt,
                    name: l.name || 'Unnamed Logging Prompt',
                    is_snippet: false,
                    tool: l.tool,
                    phase: l.phase,
                    mode: 'log',
                    llm: '',
                    notes: l.notes,
                    designer: l.designer,
                    project_name: projName,
                    saved_by: user?.name || user?.email || 'Unknown',
                    ...(l.publishTarget === 'project' && { project_id: l.projectId })
                }),
            }).catch(() => { });
        }
    };
    const deleteLog = async (id: string) => {
        setLogs(prev => prev.filter(l => l.id !== id));
        setEditLog(null);
        await supabase.from('viz_logs').delete().eq('id', id);
    };

    const deleteProject = async (id: string) => {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (proj?.id === id) setProj(null);
        setEditProj(null);
        // Supabase DB migration was set up with ON DELETE CASCADE, 
        // which will automatically wipe its viz_logs and pdf_sections
        await supabase.from('viz_projects').delete().eq('id', id);
    };

    const passGate = async (pid: string, gid: number, ok: boolean) => {
        let updatedProject: VizProject | null = null;
        setProjects(prev => prev.map(p => {
            if (p.id !== pid) return p;
            const g = { ...p.gates, [gid]: { passed: ok, date: today() } };
            let ph = p.phase;
            if (gid === 1 && ok) ph = "CON"; if (gid === 2 && ok) ph = "SCH"; if (gid === 3 && ok) ph = "DD";
            updatedProject = { ...p, gates: g, phase: ph };
            return updatedProject;
        }));

        if (updatedProject) {
            await supabase.from('viz_projects').update({
                gates: (updatedProject as VizProject).gates,
                phase: (updatedProject as VizProject).phase
            }).eq('id', pid);
        }
    };
    const setPhase = async (pid: string, phaseKey: PhaseKey) => {
        const pi = PHASES.findIndex(ph => ph.key === phaseKey);
        let updatedProject: VizProject | null = null;
        setProjects(prev => prev.map(p => {
            if (p.id !== pid) return p;
            const gates = { ...p.gates };
            if (pi < 1) { gates[1] = null; gates[2] = null; gates[3] = null; gates[4] = null; }
            else if (pi < 2) { gates[2] = null; gates[3] = null; gates[4] = null; }
            else if (pi < 3) { gates[3] = null; gates[4] = null; }
            else { gates[4] = null; }
            updatedProject = { ...p, phase: phaseKey, gates };
            return updatedProject;
        }));

        if (updatedProject) {
            await supabase.from('viz_projects').update({
                gates: (updatedProject as VizProject).gates,
                phase: (updatedProject as VizProject).phase
            }).eq('id', pid);
        }
    };

    const openTool = (tool: VizTool) => {
        if (tool.id === "promptgen") { setActiveTool(tool); setTab("promptgen"); }
        else if (tool.internal && tool.url) { window.open(tool.url, "_blank"); setActiveTool(tool); }
        else if (tool.internal) { setActiveTool(tool); setTab("render"); }
        else { setActiveTool(tool); }
    };
    const logFromTool = (tool: VizTool) => {
        if (!proj) { setNotice("Select or create a project first"); setTimeout(() => setNotice(null), 3000); return; }
        setEditLog(freshLog(proj.id, tool.name));
    };

    const pLogs = proj ? logs.filter(l => l.projectId === proj.id) : [];

    if (!ready) return (
        <div style={{ background: "#F5F4F1", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#E8731A", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600 }}>
            dwp.VizWorkflow
        </div>
    );

    const NAV_ITEMS = [
        { k: "workspace", ic: "◫", lb: "Workspace" },
        { k: "promptgen", ic: "◇", lb: "Prompt Gen" },
        { k: "logs", ic: "▤", lb: "Prompt Log" },
        { k: "gates", ic: "◎", lb: "Phase Gates" },
    ];
    const LIB_ITEMS = [
        { k: "library", ic: "▦", lb: "Prompt Library" },
        { k: "pdflibrary", ic: "▤", lb: "PDF Library" },
        { k: "imagelibrary", ic: "◐", lb: "Image Library" },
        { k: "models", ic: "△", lb: "3D Models" },
    ];
    const TOOL_ITEMS = [
        { k: "render", ic: "◈", lb: "dwp.render" },
        { k: "naming", ic: "⌗", lb: "Naming" },
        { k: "book3d", ic: "◫", lb: "Book a 3D" },
        { k: "portal3d", ic: "◩", lb: "3D Portal" },
        { k: "reference", ic: "◆", lb: "Reference" },
        { k: "settings", ic: "⚙", lb: "Settings" } // Added Settings
    ];

    const renderNavSection = (items: { k: string; ic: string; lb: string }[]) =>
        items.map(n => (
            <div key={n.k} className={`vw-ri ${tab === n.k ? "on" : ""}`} onClick={() => setTab(n.k)}>
                <span className="vw-ic">{n.ic}</span><span>{n.lb}</span>
            </div>
        ));

    return (
        <div className={`vw-root ${dark ? 'viz-dark' : 'viz-light'}`}>
            {/* RAIL */}
            <div className={`vw-rail ${rail ? 'open' : 'closed'}`}>
                <div className="vw-rail-hd" onClick={() => setRail(!rail)}>
                    {rail ? <div className="vw-full">dwp<b>.</b>VizWorkflow</div> : <div className="vw-mark">d.</div>}
                </div>
                <div className="vw-rail-body">
                    <div className="vw-rsec">
                        {rail ? <>Projects <span style={{ cursor: "pointer", fontSize: 12, color: "var(--or)" }} onClick={e => { e.stopPropagation(); setEditProj(freshProject()); }}>+</span></> : ""}
                    </div>
                    {projects.map(p => (
                        <div key={p.id} className={`vw-rp ${proj?.id === p.id ? "on" : ""}`} onClick={() => setProj(p)}>
                            <span className="vw-dot" style={{ background: phaseOf(p.phase)?.color }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name || p.projectId || "Untitled"}</span>
                        </div>
                    ))}
                    {projects.length === 0 && rail && <div style={{ padding: "6px 8px", fontSize: 9, color: "var(--tx3)", textAlign: "center" }}>No projects</div>}
                    <div className="vw-rsec">{rail ? "Navigation" : ""}</div>
                    {renderNavSection(NAV_ITEMS)}
                    <div className="vw-rsec">{rail ? "Library" : ""}</div>
                    {renderNavSection(LIB_ITEMS)}
                    <div className="vw-rsec">{rail ? "Tools" : ""}</div>
                    {renderNavSection(TOOL_ITEMS)}
                </div>
            </div>

            {/* MAIN */}
            <div className="vw-mn">
                {/* TOP BAR */}
                <div className="vw-bar">
                    <button className="vw-bar-btn" onClick={() => setRail(!rail)}>☰</button>
                    {proj ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.3px" }}>{proj.name || proj.projectId || "Untitled"}</span>
                            <span style={{ fontSize: 9, color: "var(--tx3)" }}>{proj.sector}{proj.studio ? ` · ${proj.studio}` : ""}</span>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                {PHASES.map(ph => (
                                    <span key={ph.key} className="vw-bar-ph" style={{
                                        background: activePhase === ph.key ? `${ph.color}15` : "var(--card)",
                                        color: activePhase === ph.key ? ph.color : "var(--tx3)",
                                        border: `1px solid ${activePhase === ph.key ? `${ph.color}30` : "var(--bdr)"}`,
                                        fontWeight: activePhase === ph.key ? 600 : 400,
                                    }} onClick={() => { setViewPhase(ph.key); setTab("workspace"); }}>
                                        {ph.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <span style={{ fontSize: 12, color: "var(--tx3)", marginLeft: 4 }}>No project selected</span>
                    )}
                    <div className="vw-bar-r">
                        <div className={`vw-tog ${dark ? "dk" : ""}`} onClick={toggleTheme}><div className="vw-th" /></div>
                        {user && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                                {user.picture ? (
                                    <img src={user.picture} alt="" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid var(--bdr)" }} referrerPolicy="no-referrer" />
                                ) : (
                                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--or)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                                        {(user.name || user.email || "U").charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--tx2)", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
                                <button className="vw-btn vw-btn-g vw-btn-sm" style={{ padding: "3px 8px", fontSize: 9 }} onClick={logout}>Sign Out</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* TAB CONTENT */}
                {tab === "render" && <RenderTab />}
                {tab === "promptgen" && (proj
                    ? <PromptGenWorkspace proj={proj} logs={logs} saveL={saveL} freshLog={freshLog} />
                    : <div className="vw-pnl"><div className="vw-empty" style={{ paddingTop: 80 }}><div className="ei">◇</div><div className="et">Select a project to use Prompt Gen</div><div className="es">Generate optimised prompts from briefs, images, or custom inputs.</div></div></div>
                )}
                {tab === "workspace" && <WorkspaceTab proj={proj} pLogs={pLogs} activePhase={activePhase} isLocked={isLocked} activeTool={activeTool} setActiveTool={setActiveTool} openTool={openTool} logFromTool={logFromTool} setEditProj={setEditProj} setEditLog={setEditLog} setTab={setTab} setViewPhase={setViewPhase} />}
                {tab === "logs" && <PromptLogTab proj={proj} pLogs={pLogs} setEditLog={setEditLog} freshLog={freshLog} />}
                {tab === "gates" && <PhaseGatesTab proj={proj} projects={projects} passGate={passGate} setPhase={setPhase} />}
                {tab === "library" && <PromptLibraryTab projId={proj?.id} />}
                {tab === "pdflibrary" && (proj
                    ? <PdfLibrary projectId={proj.id} />
                    : <div className="vw-pnl"><div className="vw-empty" style={{ paddingTop: 80 }}><div className="ei">▤</div><div className="et">Select a project to use PDF Library</div><div className="es">Manage and read reference PDFs for your project.</div></div></div>
                )}
                {tab === "imagelibrary" && <ImageLibraryTab />}
                {tab === "models" && <ModelsTab />}
                {tab === "naming" && <NamingTab />}
                {tab === "book3d" && <Book3DTab proj={proj} />}
                {tab === "portal3d" && <Portal3DTab />}
                {tab === "reference" && <ReferenceTab />}
                {tab === "settings" && <div className="p-8 h-full overflow-y-auto w-full"><SettingsPortal /></div>}
            </div>

            {/* FEEDBACK BUTTON */}
            <a
                href="https://appmanager-4w57ydlk6q-uc.a.run.app/project/app-1771581605734?mode=USER"
                target="_blank"
                rel="noopener noreferrer"
                className="vw-feedback-btn"
                title="Send Feedback"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Feedback</span>
            </a>

            {/* NOTICES & MODALS */}
            {notice && <div className="vw-notice">{notice}</div>}
            {editProj && <ProjectModal project={editProj} projects={projects} onSave={saveP} onDelete={deleteProject} onClose={() => setEditProj(null)} />}
            {editLog && <LogModal log={editLog} logs={logs} onSave={saveL} onDelete={deleteLog} onClose={() => setEditLog(null)} />}
        </div>
    );
}
