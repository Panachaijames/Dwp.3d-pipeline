"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import {
    PHASES, TOOLS, GATES, SECTORS, STATUSES,
    VizProject, VizLog, VizTool, PhaseKey,
    uid, today, phaseOf, freshLog, freshProject,
} from './constants';
import { inferPhaseKey, readText, slugify } from './projectCatalog';
import './vizworkflow.css';
import { supabase } from '@/services/supabaseClient';
import { buildSSOUrl, openWithSSO } from '@/utils/sso';

import WorkspaceTab from './WorkspaceTab';
import PromptLogTab from './PromptLogTab';
import PhaseGatesTab from './PhaseGatesTab';
import PromptLibraryTab from './PromptLibraryTab';
import ModelsTab from './ModelsTab';
import RenderTab from './RenderTab';
import NamingTab from './NamingTab';
import Book3DTab from './Book3DTab';
import Portal3DTab from './Portal3DTab';
import ReferenceTab from './ReferenceTab';
import ScheduleTab from './ScheduleTab';
import RenderWorkspace from './RenderWorkspace';
import PromptGenWorkspace from './PromptGenWorkspace';
import ProjectModal from './ProjectModal';
import LogModal from './LogModal';
import { PdfLibrary } from '../PdfLibrary/PdfLibrary';
import { SettingsPortal } from '../../portals/SettingsPortal';
import { AlertTriangle, HardDrive, MessageSquare } from 'lucide-react';

const EMPTY_GATES: VizProject['gates'] = { 1: null, 2: null, 3: null, 4: null };

const normalizeGates = (gates: unknown): VizProject['gates'] => {
    if (!gates || typeof gates !== 'object') return { ...EMPTY_GATES };

    const source = gates as Partial<VizProject['gates']>;
    return {
        1: source[1] ?? null,
        2: source[2] ?? null,
        3: source[3] ?? null,
        4: source[4] ?? null,
    };
};

const normalizeVizProjectRow = (row: any): VizProject => ({
    id: readText(row?.id) || `viz:${slugify(readText(row?.project_id, row?.name) || today())}`,
    name: readText(row?.name),
    projectId: readText(row?.project_id),
    sector: readText(row?.sector) || 'Hospitality',
    studio: readText(row?.studio),
    phase: inferPhaseKey(row?.phase),
    gates: normalizeGates(row?.gates),
    created: readText(row?.created, row?.created_at) || today(),
});

const normalizeRequestedProjectRow = (row: any): VizProject | null => {
    const projectId = readText(row?.project_number);
    const name = readText(row?.project_name);
    const studio = readText(row?.studio_full_name);

    if (!projectId && !name && !studio) return null;

    const requestKey = slugify(`${projectId}|${name}|${studio}`) || slugify(readText(row?.id) || today());

    return {
        id: `request:${requestKey}`,
        name,
        projectId,
        sector: 'Hospitality',
        studio,
        phase: inferPhaseKey(row?.current_phase),
        gates: { ...EMPTY_GATES },
        created: readText(row?.created_at, row?.timestamp) || today(),
        requestKey,
    };
};

const matchesRequestedProject = (requestedProject: VizProject, vizProject: VizProject) => {
    if (requestedProject.requestKey && vizProject.requestKey && requestedProject.requestKey === vizProject.requestKey) {
        return true;
    }

    const requestedProjectId = slugify(requestedProject.projectId);
    const vizProjectId = slugify(vizProject.projectId);
    if (requestedProjectId && vizProjectId && requestedProjectId === vizProjectId) {
        return true;
    }

    const requestedName = slugify(requestedProject.name);
    const vizName = slugify(vizProject.name);
    if (!requestedName || !vizName || requestedName !== vizName) {
        return false;
    }

    const requestedStudio = slugify(requestedProject.studio);
    const vizStudio = slugify(vizProject.studio);
    return !requestedStudio || !vizStudio || requestedStudio === vizStudio;
};

const sortProjects = (projects: VizProject[]) =>
    [...projects].sort((left, right) => {
        const leftLabel = `${left.projectId} ${left.name}`.trim().toLowerCase();
        const rightLabel = `${right.projectId} ${right.name}`.trim().toLowerCase();
        return leftLabel.localeCompare(rightLabel);
    });

const mergeProjects = (requestRows: any[] | null | undefined, vizRows: any[] | null | undefined) => {
    const requestProjects = new Map<string, VizProject>();
    for (const row of requestRows || []) {
        const project = normalizeRequestedProjectRow(row);
        if (project && !requestProjects.has(project.requestKey || project.id)) {
            requestProjects.set(project.requestKey || project.id, project);
        }
    }

    const requestedProjects = sortProjects(Array.from(requestProjects.values()));
    const vizProjects = (vizRows || []).map(row => normalizeVizProjectRow(row));
    const mergedProjects: VizProject[] = [];

    for (const requestedProject of requestedProjects) {
        const matchingVizProject = vizProjects.find(vizProject => matchesRequestedProject(requestedProject, vizProject));

        if (!matchingVizProject) {
            mergedProjects.push(requestedProject);
            continue;
        }

        mergedProjects.push({
            ...requestedProject,
            ...matchingVizProject,
            id: matchingVizProject.id,
            name: matchingVizProject.name || requestedProject.name,
            projectId: matchingVizProject.projectId || requestedProject.projectId,
            studio: matchingVizProject.studio || requestedProject.studio,
            sector: matchingVizProject.sector || requestedProject.sector,
            phase: matchingVizProject.phase || requestedProject.phase,
            gates: normalizeGates(matchingVizProject.gates),
            created: matchingVizProject.created || requestedProject.created,
            requestKey: requestedProject.requestKey,
        });
    }

    return sortProjects(mergedProjects);
};

export default function VizWorkflowApp() {
    const { theme, toggleTheme } = useTheme();
    const {
        user,
        logout,
        accessToken,
        requestDriveAccess,
        driveTokenExpiresAt,
        driveSessionEmail,
        driveExpiringSoon,
        driveNeedsReconnect,
    } = useAuth();
    const dark = theme === 'dark';

    const [projects, setProjects] = useState<VizProject[]>([]);
    const [rawRequests, setRawRequests] = useState<any[]>([]);
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
        let active = true;

        const loadData = async () => {
            try {
                const [
                    { data: requestData, error: requestError },
                    { data: vizProjectData, error: vizProjectError },
                    { data: lData }
                ] = await Promise.all([
                    supabase.from('project_requests').select('*').order('created_at', { ascending: false }),
                    supabase.from('viz_projects').select('*'),
                    supabase.from('viz_logs').select('*')
                ]);

                if (requestError) {
                    throw requestError;
                }

                if (vizProjectError) {
                    throw vizProjectError;
                }

                if (active) {
                    setRawRequests(requestData || []);
                    setProjects(mergeProjects(requestData, vizProjectData));
                }

                if (active && lData) {
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
                if (active) {
                    setReady(true);
                }
            }
        };
        loadData();

        const channel = supabase
            .channel('vizworkflow_project_requests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'project_requests' }, () => {
                void loadData();
            })
            .subscribe();

        return () => {
            active = false;
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (!proj) return;

        const updatedProject = projects.find(project => project.id === proj.id)
            || (proj.requestKey ? projects.find(project => project.requestKey === proj.requestKey) : undefined)
            || (proj.catalogKey ? projects.find(project => project.catalogKey === proj.catalogKey) : undefined);

        if (updatedProject) {
            setProj(updatedProject);
        } else {
            setProj(null);
        }
    }, [projects, proj?.id, proj?.catalogKey]);
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
        const currentProject = projects.find(project => project.id === id);
        if (currentProject?.requestKey) {
            setNotice("Book a 3D request projects can't be deleted here");
            setTimeout(() => setNotice(null), 3000);
            setEditProj(null);
            return;
        }

        if (currentProject?.catalogKey) {
            setNotice("Projects from project_all can't be deleted here");
            setTimeout(() => setNotice(null), 3000);
            setEditProj(null);
            return;
        }

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
        else if (tool.internal && tool.url) { openWithSSO(tool.url); setActiveTool(tool); }
        else if (tool.internal) { setActiveTool(tool); setTab("render"); }
        else { setActiveTool(tool); }
    };
    const logFromTool = (tool: VizTool) => {
        if (!proj) { setNotice("Select or create a project first"); setTimeout(() => setNotice(null), 3000); return; }
        setEditLog(freshLog(proj.id, tool.name));
    };

    const pLogs = proj ? logs.filter(l => l.projectId === proj.id) : [];
    const driveMinutesRemaining = driveTokenExpiresAt
        ? Math.max(Math.ceil((driveTokenExpiresAt - Date.now()) / (60 * 1000)), 0)
        : null;
    const showDriveStatus = Boolean(accessToken || driveSessionEmail);

    if (!ready) return (
        <div style={{ background: "#F5F4F1", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#E8731A", fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600 }}>
            <a href={buildSSOUrl("https://dwp-visualization-747963782073.asia-southeast3.run.app/")} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>dwp.visualization</a>
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
        { k: "models", ic: "△", lb: "3D Models" },
    ];
    const TOOL_ITEMS_BASE = [
        { k: "naming", ic: "⌗", lb: "Naming" },
        { k: "book3d", ic: "◫", lb: "Book a 3D" },
        { k: "portal3d", ic: "◩", lb: "3D Portal" },
        { k: "reference", ic: "◆", lb: "Reference" },
    ];
    const TOOL_ITEMS = user?.role === 'leader'
        ? [...TOOL_ITEMS_BASE, { k: "schedule", ic: "📅", lb: "3D Schedule" }, { k: "settings", ic: "⚙", lb: "Settings" }]
        : TOOL_ITEMS_BASE;

    const renderNavSection = (items: { k: string; ic: string; lb: string }[]) =>
        items.map(n => (
            <div key={n.k} className={`vw-ri ${tab === n.k ? "on" : ""}`} onClick={() => setTab(n.k)}>
                <span className="vw-ic">{n.ic}</span><span>{n.lb}</span>
            </div>
        ));

    return (
        <div className={`vw-root ${dark ? 'viz-dark' : 'viz-light'}`}>
            {/* RAIL / SIDEBAR */}
            <div className={`vw-rail ${rail ? 'open' : 'closed'}`}>
                <div className="vw-rail-hd" onClick={() => setRail(!rail)}>
                    {rail ? <a href={buildSSOUrl("https://dwp-visualization-747963782073.asia-southeast3.run.app/")} target="_blank" rel="noopener noreferrer" className="vw-full" style={{ textDecoration: 'none', color: 'inherit' }}>dwp<b>.</b>visualization</a> : <div className="vw-mark">d.</div>}
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
                        {showDriveStatus && (
                            <button
                                className="vw-btn vw-btn-sm"
                                onClick={() => requestDriveAccess(true)}
                                style={{
                                    padding: "5px 10px",
                                    fontSize: 9,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    border: driveNeedsReconnect
                                        ? "1px solid rgba(220, 38, 38, 0.25)"
                                        : driveExpiringSoon
                                            ? "1px solid rgba(245, 158, 11, 0.25)"
                                            : "1px solid var(--bdr)",
                                    background: driveNeedsReconnect
                                        ? "rgba(220, 38, 38, 0.10)"
                                        : driveExpiringSoon
                                            ? "rgba(245, 158, 11, 0.10)"
                                            : "var(--card)",
                                    color: driveNeedsReconnect
                                        ? "#dc2626"
                                        : driveExpiringSoon
                                            ? "#d97706"
                                            : "var(--tx2)",
                                }}
                                title={driveSessionEmail ? `Google Drive connected as ${driveSessionEmail}` : 'Reconnect Google Drive'}
                            >
                                {driveNeedsReconnect || driveExpiringSoon ? <AlertTriangle size={12} /> : <HardDrive size={12} />}
                                <span>
                                    {driveNeedsReconnect
                                        ? 'Reconnect Drive'
                                        : driveExpiringSoon && driveMinutesRemaining !== null
                                            ? `Drive ${driveMinutesRemaining}m`
                                            : 'Drive Connected'}
                                </span>
                            </button>
                        )}
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
                {tab === "models" && <ModelsTab />}
                {tab === "naming" && <NamingTab />}
                {tab === "book3d" && <Book3DTab proj={proj} />}
                {tab === "portal3d" && <Portal3DTab />}
                {tab === "reference" && <ReferenceTab />}
                {tab === "schedule" && user?.role === 'leader' && <ScheduleTab rawRequests={rawRequests} setRawRequests={setRawRequests} />}
                {tab === "settings" && <div className="p-8 h-full overflow-y-auto w-full"><SettingsPortal /></div>}
            </div>

            {/* FEEDBACK BUTTON */}
            <a
                href={buildSSOUrl("https://appmanager-4w57ydlk6q-uc.a.run.app/project/app-1771581605734?mode=USER")}
                target="_blank"
                rel="noopener noreferrer"
                className="vw-feedback-btn"
                title="Send Feedback"
            >
                <MessageSquare size={24} color="white" />
            </a>

            {/* NOTICES & MODALS */}
            {notice && <div className="vw-notice">{notice}</div>}
            {editProj && <ProjectModal project={editProj} projects={projects} onSave={saveP} onDelete={deleteProject} onClose={() => setEditProj(null)} />}
            {editLog && <LogModal log={editLog} logs={logs} onSave={saveL} onDelete={deleteLog} onClose={() => setEditLog(null)} />}
        </div>
    );
}
