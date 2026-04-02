"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { Folder, UploadCloud, LogOut, ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { DriveUploader } from '../features/DriveUploader';
import { ResourceViewer } from '../features/ResourceViewer';

interface Project {
    id: string;
    name: string;
    resource_folder_id: string | null;
    outsource_folder_id: string | null;
}

interface AssignedRequest {
    id: string;
    request_name: string;
    project_name: string;
    requester: string;
    deadline: string;
    description: string;
    provided_files: string[];
    drive_folder_id: string | null;
    drive_folder_name: string | null;
    areas: any[];
    number_of_renderings: number;
    status: string;
}

export const OutsourcePortal: React.FC = () => {
    const { user, logout } = useAuth();

    // Portal Tabs State
    const [mainTab, setMainTab] = useState<'projects' | 'requests'>('requests');

    // Data State
    const [projects, setProjects] = useState<Project[]>([]);
    const [requests, setRequests] = useState<AssignedRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Selection State
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<AssignedRequest | null>(null);

    useEffect(() => {
        if (user?.email) {
            fetchDashboardData();
        }
    }, [user]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Assigned Projects
            const { data: assignments, error: assignError } = await supabase
                .from('threed_outsource_assignments')
                .select('project_id')
                .eq('email', user?.email);

            if (assignError) throw assignError;

            if (assignments && assignments.length > 0) {
                const projectIds = assignments.map(a => a.project_id);
                const { data: projectsData, error: projError } = await supabase
                    .from('threed_projects')
                    .select('*')
                    .in('id', projectIds)
                    .order('created_at', { ascending: false });

                if (projError) throw projError;
                setProjects(projectsData || []);
            } else {
                setProjects([]);
            }

            // 2. Fetch Assigned 3D Requests (Tickets)
            const { data: requestsData, error: reqError } = await supabase
                .from('project_requests')
                .select('*')
                .eq('assigned_vendor_email', user?.email)
                .order('created_at', { ascending: false });

            if (reqError) throw reqError;
            setRequests(requestsData || []);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-950 text-orange-500 font-semibold">
                Loading Workspace...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
            {/* Header */}
            <header className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10 w-full">
                <div className="flex items-center gap-3">
                    {(selectedProject || selectedRequest) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedProject(null); setSelectedRequest(null); }}
                            className="mr-2 text-zinc-400 hover:text-white"
                        >
                            <ArrowLeft size={20} />
                        </Button>
                    )}
                    <h1 className="font-bold text-lg bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">
                        dwp.Partner Portal
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                        {user?.picture && <img src={user.picture} alt="Avatar" className="w-8 h-8 rounded-full border border-zinc-700" />}
                        <span className="hidden sm:inline">{user?.name}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={logout} className="border-zinc-700 hover:bg-zinc-800">
                        <LogOut size={16} className="mr-2" /> Logout
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
                {(!selectedProject && !selectedRequest) ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                        <div className="flex bg-zinc-900 border border-zinc-800 p-1 w-fit rounded-lg mb-8">
                            <button
                                onClick={() => setMainTab('requests')}
                                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${mainTab === 'requests' ? 'bg-orange-500 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                My 3D Requests
                            </button>
                            <button
                                onClick={() => setMainTab('projects')}
                                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${mainTab === 'projects' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                My Projects
                            </button>
                        </div>

                        {mainTab === 'projects' && (
                            <>
                                <div className="mb-6">
                                    <h2 className="text-3xl font-bold mb-2">My Projects</h2>
                                    <p className="text-zinc-400">Full project access to view resources and submit your work.</p>
                                </div>
                                {projects.length === 0 ? (
                                    <div className="h-64 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                                        <Folder size={48} className="text-zinc-600 mb-4" />
                                        <h3 className="text-xl font-medium text-zinc-300">No Projects Assigned</h3>
                                        <p className="text-zinc-500 text-sm mt-2">You currently don't have access to any full projects.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {projects.map((project) => (
                                            <div
                                                key={project.id}
                                                onClick={() => setSelectedProject(project)}
                                                className="group cursor-pointer border border-zinc-800 bg-zinc-900 rounded-2xl p-6 hover:border-orange-500/50 hover:bg-zinc-800/80 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-orange-500/10"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4 group-hover:bg-orange-500/20 transition-colors">
                                                    <Folder className="text-orange-500" size={24} />
                                                </div>
                                                <h3 className="text-xl font-bold text-white mb-2">{project.name}</h3>
                                                <div className="flex items-center text-sm text-zinc-500 mt-4">
                                                    <span>Click to open workspace</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {mainTab === 'requests' && (
                            <>
                                <div className="mb-6">
                                    <h2 className="text-3xl font-bold mb-2">My 3D Requests</h2>
                                    <p className="text-zinc-400">Direct visualization tickets and tasks assigned to you.</p>
                                </div>
                                {requests.length === 0 ? (
                                    <div className="h-64 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                                        <Folder size={48} className="text-zinc-600 mb-4" />
                                        <h3 className="text-xl font-medium text-zinc-300">No Pending Requests</h3>
                                        <p className="text-zinc-500 text-sm mt-2">You have no active 3D tickets right now.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {requests.map((req) => (
                                            <div
                                                key={req.id}
                                                onClick={() => setSelectedRequest(req)}
                                                className="group cursor-pointer border border-zinc-800 bg-zinc-900 rounded-2xl p-6 hover:border-orange-500/50 hover:bg-zinc-800/80 transition-all duration-300 shadow-lg hover:shadow-orange-500/10 flex flex-col md:flex-row justify-between md:items-center gap-4"
                                            >
                                                <div>
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className="text-xs font-mono px-2 py-1 bg-zinc-800 rounded text-zinc-400">{req.id}</span>
                                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${req.status === 'Submitted' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                                                            {req.status}
                                                        </span>
                                                        {new Date(req.deadline) < new Date() && <span className="text-xs px-2 py-1 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">Overdue</span>}
                                                    </div>
                                                    <h3 className="text-xl font-bold text-white mb-1">{req.request_name} {req.project_name ? `(${req.project_name})` : ''}</h3>
                                                    <p className="text-sm text-zinc-400">Requested by: {req.requester}</p>
                                                </div>
                                                <div className="text-left md:text-right border-t border-zinc-800 md:border-0 pt-4 md:pt-0">
                                                    <div className="text-sm text-zinc-500 mb-1">Deadline</div>
                                                    <div className={`font-medium ${new Date(req.deadline) < new Date() ? 'text-red-500' : 'text-orange-400'}`}>
                                                        {new Date(req.deadline).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div className="text-xs text-zinc-500 mt-2">{req.number_of_renderings} Renderings</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : selectedProject ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-8rem)]">
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-3xl font-bold mb-1">{selectedProject.name}</h2>
                                <p className="text-zinc-400">Project Workspace</p>
                            </div>
                        </div>

                        <Tabs defaultValue="resources" className="h-full flex flex-col">
                            <TabsList className="bg-zinc-900 border border-zinc-800 p-1 w-fit rounded-lg mb-6">
                                <TabsTrigger value="resources" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white rounded-md px-6 py-2">
                                    <Folder size={16} className="mr-2 inline" /> Resources
                                </TabsTrigger>
                                <TabsTrigger value="submit" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-md px-6 py-2">
                                    <UploadCloud size={16} className="mr-2 inline" /> Submit Portal
                                </TabsTrigger>
                            </TabsList>

                            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative">
                                <TabsContent value="resources" className="m-0 h-full p-8 p-0">
                                    <ResourceViewer folderId={selectedProject.resource_folder_id} />
                                </TabsContent>

                                <TabsContent value="submit" className="m-0 h-full p-8 p-0">
                                    <DriveUploader folderId={selectedProject.outsource_folder_id}
                                        title="Upload Submission"
                                        description="Drag and drop your deliverable files here to upload directly to the project's submission drive." />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                ) : selectedRequest ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col md:flex-row gap-6">
                        {/* Request Details Sidebar */}
                        <div className="w-full md:w-1/3 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-fit shrink-0">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-mono px-2 py-1 bg-zinc-800 rounded text-zinc-400">{selectedRequest.id}</span>
                                <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">{selectedRequest.status}</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-6">{selectedRequest.request_name}</h2>

                            <div className="space-y-4">
                                <div>
                                    <div className="text-xs text-zinc-500 mb-1">Project</div>
                                    <div className="font-medium text-zinc-200">{selectedRequest.project_name || 'N/A'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-zinc-500 mb-1">Deadline</div>
                                    <div className={`font-bold ${new Date(selectedRequest.deadline) < new Date() ? 'text-red-500' : 'text-orange-400'}`}>
                                        {new Date(selectedRequest.deadline).toLocaleDateString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-zinc-500 mb-1">Requested By</div>
                                    <div className="text-zinc-200">{selectedRequest.requester}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-zinc-500 mb-1">Deliverables</div>
                                    <div className="text-zinc-200">{selectedRequest.number_of_renderings} Views</div>
                                </div>

                                <div className="pt-4 border-t border-zinc-800">
                                    <div className="text-xs text-zinc-500 mb-2">Description / Notes</div>
                                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{selectedRequest.description || 'No description provided.'}</p>
                                </div>

                                {selectedRequest.areas && selectedRequest.areas.length > 0 && selectedRequest.areas[0].scope !== '' && (
                                    <div className="pt-4 border-t border-zinc-800">
                                        <div className="text-xs text-zinc-500 mb-2">Specific Areas</div>
                                        <div className="space-y-2">
                                            {selectedRequest.areas.map((a, i) => a.scope ? (
                                                <div key={i} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                                    <div className="font-medium text-sm text-zinc-200">{a.scope}</div>
                                                    {a.description && <div className="text-xs text-zinc-400 mt-1">{a.description}</div>}
                                                </div>
                                            ) : null)}
                                        </div>
                                    </div>
                                )}

                                {selectedRequest.provided_files && selectedRequest.provided_files.length > 0 && selectedRequest.provided_files[0] !== '' && (
                                    <div className="pt-4 border-t border-zinc-800">
                                        <div className="text-xs text-zinc-500 mb-2">Reference Links</div>
                                        <div className="flex flex-col gap-2">
                                            {selectedRequest.provided_files.map((link, i) => link.trim() ? (
                                                <a key={i} href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noreferrer" className="text-sm text-orange-400 hover:underline truncate">
                                                    {link}
                                                </a>
                                            ) : null)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submission Area */}
                        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col h-[calc(100vh-8rem)]">
                            <div className="p-6 border-b border-zinc-800">
                                <h3 className="text-xl font-bold flex items-center gap-2"><UploadCloud className="text-orange-500" /> Submit Portal</h3>
                                <p className="text-sm text-zinc-400 mt-1">Upload your finished deliverables directly to the requester's drive.</p>
                            </div>
                            <div className="p-6 flex-1 flex flex-col">
                                {selectedRequest.drive_folder_id ? (
                                    <DriveUploader folderId={selectedRequest.drive_folder_id}
                                        title="Upload Submission"
                                        description="Drag and drop your deliverable files here to upload directly to the project's submission drive." />
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-red-500/20 rounded-xl bg-red-500/5 p-8 text-center">
                                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                                            <span className="text-red-500 font-bold text-xl">!</span>
                                        </div>
                                        <h3 className="text-lg font-medium text-red-400 mb-2">Submission Folder Error</h3>
                                        <p className="text-red-400/70 text-sm max-w-sm">The requester did not assign a valid Google Drive folder for this ticket. Please contact them directly to submit your work.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </main>
        </div>
    );
};


