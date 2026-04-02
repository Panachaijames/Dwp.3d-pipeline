"use client";
import React, { useState, useEffect, useRef } from 'react';
import { VizProject, OUTSOURCE_RENDERERS, SECTORS } from './constants';
import { normalizeCatalogProject, readText, slugify } from './projectCatalog';
import { DrivePicker } from '../../portals/SubmissionPortal/DrivePicker';
import { notifyNewWorkRequest } from '../../../services/emailService';
import { ProjectRequest, ProjectArea } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';

interface Props { proj: VizProject | null; }
type ProjectCatalogSource = "inhouse" | "outsource";

interface ProjectOption {
    id: string;
    source: ProjectCatalogSource;
    label: string;
    projectName: string;
    projectNumber: string;
    studioFullName: string;
    subtitle: string;
}

const PREFERRED_TOOLS = ["3ds Max", "Render for Revit", "AI Rendering"];
const DEFAULT_DEPARTMENT = 'Not specified';

const emptyAreas = (): ProjectArea[] => [
    { id: 1, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
    { id: 2, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
    { id: 3, scope: '', designer: '', startDate: '', targetDate: '', description: '' },
];

const initForm = (projName?: string, requester = '', department = DEFAULT_DEPARTMENT) => ({
    selectedProjectId: '',
    studioFullName: '', projectNumber: '', requestName: '', projectName: projName || '',
    department, requester, numberOfRenderings: '1',
    sharedPresentationLink: '', designReviewBooking: '',
    providedFiles: '', description: '', deadline: '', preferredTool: '',
    driveFolderId: '', driveFolderName: '', company: '',
    areas: emptyAreas(),
});

const normalizeProjectOption = (row: any, source: ProjectCatalogSource): ProjectOption | null => {
    const projectName = readText(row?.project_name, row?.name, row?.project, row?.title, row?.project_title);
    const projectNumber = readText(row?.project_number, row?.project_id, row?.number, row?.job_number, row?.code);
    const studioFullName = readText(row?.studio_full_name, row?.studio, row?.office, row?.location);
    const createdBy = readText(row?.created_by, row?.createdBy, row?.assigned_vendor, row?.assigned_vendor_email, row?.company_name);

    if (!projectName && !projectNumber && !studioFullName) {
        return null;
    }

    const label = projectNumber && projectName
        ? `${projectNumber} - ${projectName}`
        : projectName || projectNumber || 'Unnamed project';
    const rawId = readText(row?.id, row?.project_uuid, row?.uuid, row?.project_key)
        || slugify(label);
    const subtitle = [studioFullName, createdBy].filter(Boolean).join(' • ');

    return {
        id: `${source}:${rawId}`,
        source,
        label,
        projectName,
        projectNumber,
        studioFullName,
        subtitle
    };
};

const dedupeProjectOptions = (options: ProjectOption[]) => {
    const seen = new Set<string>();

    return options
        .filter(Boolean)
        .filter(option => {
            const key = `${option.source}:${option.label}:${option.subtitle}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.label.localeCompare(b.label));
};

export default function Book3DTab({ proj }: Props) {
    const { user } = useAuth();
    const [tab, setTab] = useState<"inhouse" | "outsource">("inhouse");
    const [outsourceUsers, setOutsourceUsers] = useState<{ email: string, role: string }[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [projectsError, setProjectsError] = useState<string | null>(null);
    const defaultRequester = user?.name || user?.email || '';
    const [projectSearch, setProjectSearch] = useState('');
    const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
    const [form, setForm] = useState(() => initForm(proj?.name, defaultRequester));
    const [expandedArea, setExpandedArea] = useState<number | null>(1);
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const projectDropdownRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        setForm(prev => ({
            ...prev,
            requester: prev.requester || defaultRequester,
            department: prev.department || DEFAULT_DEPARTMENT,
        }));
    }, [defaultRequester]);

    useEffect(() => {
        if (tab === "outsource") {
            fetchOutsourceUsers();
        }
    }, [tab]);

    useEffect(() => {
        let active = true;

        const fetchProjects = async () => {
            try {
                setLoadingProjects(true);
                setProjectsError(null);

                const {
                    supabase,
                    projectCatalogSupabase,
                    hasDedicatedProjectCatalogClient,
                    projectCatalogSupabaseSchema,
                } = await import('../../../services/supabaseClient');
                const { data: projectAllData, error: projectAllError } = await projectCatalogSupabase
                    .from('project_all')
                    .select('*');

                if (projectAllError?.code === 'PGRST205') {
                    const sourceLabel = hasDedicatedProjectCatalogClient
                        ? `the dedicated project catalog connection (${projectCatalogSupabaseSchema}.project_all)`
                        : `${projectCatalogSupabaseSchema}.project_all`;
                    setProjectsError(`Supabase API cannot find ${sourceLabel}. Showing fallback projects instead.`);
                }

                if (projectAllError && projectAllError.code !== 'PGRST205') {
                    console.warn('Failed to load project_all, falling back to known tables:', projectAllError);
                }

                const projectAllOptions = !projectAllError && projectAllData?.length
                    ? dedupeProjectOptions(
                        (projectAllData
                            .map((row: any) => {
                                const project = normalizeCatalogProject(row);
                                if (!project) return null;

                                return {
                                    id: `inhouse:${project.catalogKey}`,
                                    source: 'inhouse' as const,
                                    label: project.label,
                                    projectName: project.projectName,
                                    projectNumber: project.projectNumber,
                                    studioFullName: project.studioFullName,
                                    subtitle: project.subtitle
                                };
                            })
                            .filter(Boolean) as ProjectOption[])
                    )
                    : [];

                if (!projectAllError && projectAllData?.length && !projectAllOptions.length) {
                    console.warn('project_all returned rows but no readable project fields were found.');
                    setProjectsError("project_all returned rows, but none matched the expected project fields.");
                }

                const [{ data: inhouseProjects, error: inhouseError }, { data: outsourceProjects, error: outsourceError }] = await Promise.all([
                    supabase.from('viz_projects').select('*'),
                    supabase.from('threed_projects').select('*')
                ]);

                if (inhouseError && outsourceError) {
                    throw new Error([inhouseError.message, outsourceError.message].filter(Boolean).join(' | '));
                }

                const inhouseOptions = projectAllOptions.length
                    ? projectAllOptions
                    : dedupeProjectOptions(
                        ((inhouseProjects || [])
                            .map((row: any) => normalizeProjectOption(row, 'inhouse'))
                            .filter(Boolean) as ProjectOption[])
                    );

                const outsourceOptions = dedupeProjectOptions(
                    ((outsourceProjects || [])
                        .map((row: any) => normalizeProjectOption(row, 'outsource'))
                        .filter(Boolean) as ProjectOption[])
                );

                if (active) setProjectOptions([...inhouseOptions, ...outsourceOptions]);
            } catch (err) {
                console.error("Failed to load project catalog:", err);
                if (active) {
                    setProjectOptions([]);
                    setProjectsError('Could not load project data from Supabase. You can still complete the form manually.');
                }
            } finally {
                if (active) setLoadingProjects(false);
            }
        };

        fetchProjects();

        return () => {
            active = false;
        };
    }, []);

    const availableProjects = projectOptions.filter(option => option.source === tab);
    const filteredProjects = availableProjects.filter(option => {
        const search = projectSearch.trim().toLowerCase();
        if (!search) return true;

        return [
            option.label,
            option.projectName,
            option.projectNumber,
            option.studioFullName,
            option.subtitle
        ].some(value => value.toLowerCase().includes(search));
    });
    const selectedProject = availableProjects.find(option => option.id === form.selectedProjectId) || null;

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
                setProjectDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const fetchOutsourceUsers = async () => {
        try {
            setLoadingUsers(true);
            const { supabase } = await import('../../../services/supabaseClient');
            const { data, error } = await supabase.from('threed_user_roles').select('email, role').eq('role', 'outsource');
            if (error) throw error;
            setOutsourceUsers(data || []);
        } catch (err) {
            console.error("Failed to fetch outsource users:", err);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleAreaChange = (index: number, field: keyof ProjectArea, value: string) => {
        const newAreas = [...form.areas];
        newAreas[index] = { ...newAreas[index], [field]: value };
        setForm({ ...form, areas: newAreas });
    };

    const handleProjectSelection = (projectId: string) => {
        const project = projectOptions.find(option => option.id === projectId);

        setProjectSearch(project?.label || '');
        setProjectDropdownOpen(false);

        setForm(prev => {
            if (!project) {
                return { ...prev, selectedProjectId: projectId };
            }

            return {
                ...prev,
                selectedProjectId: projectId,
                studioFullName: project.studioFullName || prev.studioFullName,
                projectNumber: project.projectNumber || prev.projectNumber,
                projectName: project.projectName || prev.projectName,
            };
        });
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

        let vendorName = '';
        let vendorEmail = '';
        const requesterName = form.requester || defaultRequester || 'Current User';
        const departmentName = form.department || DEFAULT_DEPARTMENT;
        if (tab === "outsource" && form.company) {
            vendorName = form.company;
            vendorEmail = form.company;
        }

        const newRequestBase = {
            id: newId,
            studio_full_name: form.studioFullName,
            project_number: form.projectNumber,
            request_name: form.requestName,
            project_name: form.projectName,
            department: departmentName,
            requester: requesterName,
            number_of_renderings: parseInt(form.numberOfRenderings) || 0,
            shared_presentation_link: form.sharedPresentationLink,
            design_review_booking: form.designReviewBooking,
            provided_files: form.providedFiles ? form.providedFiles.split(',').map(s => s.trim()) : [],
            description: form.description,
            deadline: form.deadline,
            preferred_tool: form.preferredTool,
            areas: form.areas,
            status: 'Submitted',
            current_phase: 'queued',
            progress: 0,
            priority: 'Medium',
            submitted_by: requesterName,
            timestamp: new Date().toISOString(),
            assigned_vendor: vendorName || null,
            assigned_vendor_email: vendorEmail || null
        };

        try {
            let finalDriveFolderId = form.driveFolderId;
            let finalDriveFolderName = form.driveFolderName;

            // 1. Create Project Folders if a destination folder was selected
            if (form.driveFolderId) {
                const driveRes = await fetch('/api/drive/create-project', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                    },
                    body: JSON.stringify({ projectName: form.projectName, parentFolderId: form.driveFolderId })
                });

                if (!driveRes.ok) {
                    const driveData = await driveRes.json();
                    throw new Error(driveData.error || 'Failed to create Drive folders');
                }

                const driveData = await driveRes.json();
                finalDriveFolderId = driveData.submissionBatchFolderId || driveData.submissionFolderId || driveData.projectFolderId;
                finalDriveFolderName = driveData.submissionBatchFolderName || driveData.submissionFolderName || form.projectName;
                
                // 2. Save Project to Outsource Projects (threed_projects)
                const { supabase: sp } = await import('../../../services/supabaseClient');
                const userEmail = localStorage.getItem('dwp_user_email') || 'admin';
                
                const { error: projError, data: projData } = await sp
                    .from('threed_projects')
                    .insert({
                        name: form.projectName,
                        created_by: userEmail,
                        resource_folder_id: driveData.resourceFolderId,
                        outsource_folder_id: driveData.outsourceFolderId
                    })
                    .select()
                    .single();

                if (projError) throw projError;
                
                const dbProjectId = projData.id;

                // 3. Assign Vendor if Outsource account is chosen
                if (tab === "outsource" && vendorEmail) {
                    const assignRes = await fetch('/api/drive/assign-outsource', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                        },
                        body: JSON.stringify({
                            email: vendorEmail,
                            resourceFolderId: driveData.resourceFolderId,
                            outsourceFolderId: driveData.outsourceFolderId
                        })
                    });

                    if (!assignRes.ok) {
                        const assignErr = await assignRes.json();
                        throw new Error(assignErr.error || 'Failed to grant Drive permissions to vendor');
                    }

                    const { error: assignError } = await sp
                        .from('threed_outsource_assignments')
                        .insert({
                            project_id: dbProjectId,
                            email: vendorEmail,
                            assigned_by: userEmail
                        });
                        
                    if (assignError) throw assignError;
                }
            }

            const newRequest = {
                ...newRequestBase,
                drive_folder_id: finalDriveFolderId,
                drive_folder_name: finalDriveFolderName,
            };

            // Save to database
            const { supabase } = await import('../../../services/supabaseClient');
            const { error } = await supabase.from('project_requests').insert(newRequest);

            if (error) {
                console.error("Supabase insert error:", error);
                throw error;
            }

            // Emails
            if (tab === "outsource" && vendorEmail) {
                // Build request object needed for email notification
                const emailReq = {
                    id: newId, studioFullName: form.studioFullName, projectNumber: form.projectNumber,
                    requestName: form.requestName, projectName: form.projectName, department: departmentName,
                    requester: requesterName, numberOfRenderings: parseInt(form.numberOfRenderings) || 0,
                    description: form.description, deadline: form.deadline, priority: 'Medium' as const,
                    submittedBy: requesterName, status: 'Submitted' as const, currentPhase: 'queued' as const, progress: 0, timestamp: new Date().toISOString(), areas: []
                };
                // notify outsource vendor
                const { notifyOutsourceVendor } = await import('../../../services/emailService');
                const userEmail = localStorage.getItem('dwp_user_email') || ''; // get current user email if possible, else just use the provided name via form
                await notifyOutsourceVendor(emailReq, userEmail || requesterName, vendorEmail);
            } else {
                // notify pipeline lead for inhouse
                const emailReq = {
                    id: newId, studioFullName: form.studioFullName, projectNumber: form.projectNumber,
                    requestName: form.requestName, projectName: form.projectName, department: departmentName,
                    requester: requesterName, numberOfRenderings: parseInt(form.numberOfRenderings) || 0,
                    description: form.description, deadline: form.deadline, priority: 'Medium' as const,
                    submittedBy: requesterName, status: 'Submitted' as const, currentPhase: 'queued' as const, progress: 0, timestamp: new Date().toISOString(), areas: []
                };
                await notifyNewWorkRequest(emailReq, '');
            }

            // Sync to Google Calendar
            try {
                await fetch('/api/calendar/create-event', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        projectName: form.projectName,
                        projectNumber: form.projectNumber,
                        requestName: form.requestName,
                        startDate: newRequestBase.timestamp,
                        deadline: form.deadline,
                        description: form.description
                    })
                });
            } catch (calErr) {
                console.error("Calendar sync failed (non-fatal):", calErr);
            }

        } catch (err: any) {
            console.error("Submission failed:", err);
            alert("Failed to submit request: " + err.message);
        }

        setSubmitting(false);
        setSubmitted(true);
        setTimeout(() => {
            setSubmitted(false);
            setProjectSearch('');
            setProjectDropdownOpen(false);
            setForm(initForm(proj?.name, defaultRequester));
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
                    <div className="vw-fgi full">
                        <label className="vw-fl">{tab === "inhouse" ? "In-house" : "Outsource"} Project</label>
                        <div ref={projectDropdownRef} style={{ position: "relative" }}>
                            <input
                                className="vw-fi"
                                value={projectSearch}
                                onChange={e => {
                                    setProjectSearch(e.target.value);
                                    setProjectDropdownOpen(true);
                                }}
                                onFocus={() => setProjectDropdownOpen(true)}
                                onKeyDown={e => {
                                    if (e.key === "Escape") {
                                        setProjectDropdownOpen(false);
                                    }

                                    if (e.key === "Enter" && filteredProjects.length > 0) {
                                        e.preventDefault();
                                        handleProjectSelection(filteredProjects[0].id);
                                    }
                                }}
                                placeholder={loadingProjects
                                    ? "Loading projects from Supabase..."
                                    : availableProjects.length === 0
                                        ? `No ${tab === "inhouse" ? "in-house" : "outsource"} projects found`
                                        : "Search and select project from database"}
                                disabled={loadingProjects || availableProjects.length === 0}
                            />
                            {projectDropdownOpen && !loadingProjects && availableProjects.length > 0 && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "calc(100% + 6px)",
                                        left: 0,
                                        right: 0,
                                        zIndex: 30,
                                        maxHeight: 280,
                                        overflowY: "auto",
                                        borderRadius: 10,
                                        border: "1px solid var(--bd)",
                                        background: "var(--bg)",
                                        boxShadow: "0 12px 32px rgba(0,0,0,0.12)"
                                    }}
                                >
                                    {filteredProjects.length === 0 ? (
                                        <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--tx3)" }}>
                                            No matching projects
                                        </div>
                                    ) : (
                                        filteredProjects.map((project, index) => {
                                            const isSelected = project.id === form.selectedProjectId;
                                            const isLast = index === filteredProjects.length - 1;

                                            return (
                                                <button
                                                    key={project.id}
                                                    type="button"
                                                    onClick={() => handleProjectSelection(project.id)}
                                                    style={{
                                                        width: "100%",
                                                        padding: "12px 14px",
                                                        border: "none",
                                                        borderBottom: isLast ? "none" : "1px solid var(--bd)",
                                                        background: isSelected ? "var(--bg2)" : "var(--bg)",
                                                        color: "var(--tx)",
                                                        textAlign: "left",
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{project.label}</div>
                                                    {project.subtitle && (
                                                        <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 3 }}>
                                                            {project.subtitle}
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 6 }}>
                            Start typing in the field above to search inside the dropdown. Selecting a project fills Studio, Project Number, and Project Name from Supabase.
                        </div>
                        {projectsError && (
                            <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 6 }}>
                                {projectsError}
                            </div>
                        )}
                    </div>
                    {selectedProject && (
                        <div className="vw-fgi full">
                            <div style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--bg2)" }}>
                                <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 4 }}>Loaded from database</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedProject.label}</div>
                                {selectedProject.subtitle && (
                                    <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>{selectedProject.subtitle}</div>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="vw-fgi"><label className="vw-fl">Studio Full Name *</label><input className="vw-fi" required value={form.studioFullName} onChange={e => setForm({ ...form, studioFullName: e.target.value })} placeholder="e.g. DWP Bangkok" /></div>
                    <div className="vw-fgi"><label className="vw-fl">Project Number *</label><input className="vw-fi" required value={form.projectNumber} onChange={e => setForm({ ...form, projectNumber: e.target.value })} placeholder="e.g. 24-0045" /></div>
                    <div className="vw-fgi"><label className="vw-fl">Request Name *</label><input className="vw-fi" required value={form.requestName} onChange={e => setForm({ ...form, requestName: e.target.value })} placeholder="Unique title for this request" /></div>
                    <div className="vw-fgi"><label className="vw-fl">Project Name *</label><input className="vw-fi" required value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} placeholder="Official Project Name" /></div>
                </div>
            </div>

            {/* ── Section 2: Destination Folder (Google Drive) ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 8 }}>Destination Folder</div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 6 }}>Select a Google Drive folder. All submissions will be uploaded there automatically.</div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 10 }}>
                    This uses the same Google Drive connection as the rest of the app. The connected Google account must have access to the folder you pick.
                </div>
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

            {/* ── Section 3: Requirements ── */}
            <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                <div className="vw-cd-t" style={{ marginBottom: 12 }}>Requirements</div>
                <div className="vw-fg">
                    <div className="vw-fgi"><label className="vw-fl">Number of Renderings</label><input className="vw-fi" type="number" min="1" value={form.numberOfRenderings} onChange={e => setForm({ ...form, numberOfRenderings: e.target.value })} /></div>
                    <div className="vw-fgi"><label className="vw-fl">Deadline *</label><input className="vw-fi" type="date" required value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></div>
                    <div className="vw-fgi full"><label className="vw-fl">Provided Files (Links)</label><input className="vw-fi" value={form.providedFiles} onChange={e => setForm({ ...form, providedFiles: e.target.value })} placeholder="Paste file links separated by commas" /></div>
                    <div className="vw-fgi full"><label className="vw-fl">Description / Notes</label><textarea className="vw-ft" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Special requirements, context..." /></div>
                </div>
            </div>

            {/* ── Section 4: Preferred Tool ── */}
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

            {/* ── Section 5: Areas & Scope ── */}
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
                            <div style={{ fontSize: 10, color: "var(--tx3)" }}>Outsource Account</div>
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
                <button className={`vw-btn ${tab === "inhouse" ? "vw-btn-p" : "vw-btn-g"}`} onClick={() => { setTab("inhouse"); setProjectSearch(''); setProjectDropdownOpen(false); setForm({ ...form, company: '', selectedProjectId: '' }); }}>In-house</button>
                <button className={`vw-btn ${tab === "outsource" ? "vw-btn-p" : "vw-btn-g"}`} onClick={() => { setTab("outsource"); setProjectSearch(''); setProjectDropdownOpen(false); setForm({ ...form, selectedProjectId: '' }); }}>Outsource</button>
            </div>

            {tab === "inhouse" ? (
                renderForm()
            ) : (
                <div>
                    {/* Vendor selection (only if no company chosen yet) */}
                    {!form.company && (
                        <div className="vw-cd" style={{ padding: 16, marginBottom: 10 }}>
                            <div className="vw-cd-t" style={{ marginBottom: 10 }}>Select Vendor</div>
                            {loadingUsers ? (
                                <div style={{ fontSize: 14, color: 'var(--tx3)' }}>Loading vendors...</div>
                            ) : outsourceUsers.length === 0 ? (
                                <div style={{ fontSize: 14, color: 'var(--tx3)' }}>No users found with 'outsource' role.</div>
                            ) : (
                                <div className="vw-fg">
                                    <div className="vw-fgi">
                                        <label className="vw-fl">Vendor Email *</label>
                                        <select
                                            className="vw-fs"
                                            value={form.company}
                                            onChange={e => setForm({ ...form, company: e.target.value })}
                                        >
                                            <option value="" disabled>Select Outsource Account</option>
                                            {outsourceUsers.map(u => (
                                                <option key={u.email} value={u.email}>{u.email}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Show the full form once a vendor is selected */}
                    {form.company && renderForm()}
                </div>
            )}
        </div>
    );
}
