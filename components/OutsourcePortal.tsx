"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { Folder, UploadCloud, LogOut, ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";

interface Project {
    id: string;
    name: string;
    resource_folder_id: string | null;
    outsource_folder_id: string | null;
}

export const OutsourcePortal: React.FC = () => {
    const { user, logout } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);

    useEffect(() => {
        if (user?.email) {
            fetchAssignedProjects();
        }
    }, [user]);

    const fetchAssignedProjects = async () => {
        try {
            setLoading(true);
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
        } catch (error) {
            console.error("Error fetching projects:", error);
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
                    {selectedProject && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedProject(null)}
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
                {!selectedProject ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mb-8">
                            <h2 className="text-3xl font-bold mb-2">My Projects</h2>
                            <p className="text-zinc-400">Select a project to view resources and submit your work.</p>
                        </div>

                        {projects.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                                <Folder size={48} className="text-zinc-600 mb-4" />
                                <h3 className="text-xl font-medium text-zinc-300">No Projects Assigned</h3>
                                <p className="text-zinc-500 text-sm mt-2">You currently don't have access to any projects.</p>
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
                    </div>
                ) : (
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
                                    <SubmitDropzone folderId={selectedProject.outsource_folder_id} />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                )}
            </main>
        </div>
    );
};

// Component for handling Drag & Drop uploads
const SubmitDropzone = ({ folderId }: { folderId: string | null }) => {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const onDrop = async (acceptedFiles: File[]) => {
        if (!folderId) {
            setErrorMessage("No submission folder assigned for this project.");
            return;
        }

        if (acceptedFiles.length === 0) return;

        setUploading(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        setUploadProgress(10); // Start progress

        try {
            const formData = new FormData();
            formData.append('file', acceptedFiles[0]); // Handle one file for now
            formData.append('folderId', folderId);

            const res = await fetch('/api/drive/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                },
                body: formData
            });

            setUploadProgress(100);

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to upload');
            }

            setSuccessMessage(`Successfully uploaded ${acceptedFiles[0].name}`);

        } catch (error: any) {
            console.error('Upload Error:', error);
            setErrorMessage(error.message);
        } finally {
            setUploading(false);
            // reset progress after a bit
            setTimeout(() => setUploadProgress(0), 3000);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = require('react-dropzone').useDropzone({ onDrop });

    return (
        <div className="flex flex-col h-full bg-zinc-900 border-2 border-dashed border-zinc-800 rounded-xl mt-4 m-8 transition-colors p-8">
            <h3 className="text-xl font-medium text-white mb-2">Upload Submission</h3>
            <p className="text-zinc-400 text-sm mb-6">Drag and drop your deliverable files here to upload directly to the project's submission drive.</p>

            <div
                {...getRootProps()}
                className={`flex-1 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer bg-zinc-950/50 
                ${isDragActive ? 'border-orange-500 bg-orange-500/5 hover:border-orange-500' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/20'}`}
            >
                <input {...getInputProps()} />
                <UploadCloud size={48} className={`mb-4 transition-colors ${isDragActive ? 'text-orange-500' : 'text-zinc-600'}`} />
                {isDragActive ? (
                    <p className="text-orange-500 font-medium">Drop the files here ...</p>
                ) : (
                    <p className="text-zinc-500 font-medium text-center">
                        Drag 'n' drop some files here, <br /> or click to select files
                    </p>
                )}
            </div>

            {/* Status Messages */}
            <div className="mt-4 min-h-[40px]">
                {uploading && (
                    <div className="flex items-center gap-3">
                        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-orange-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <span className="text-orange-500 text-sm font-medium animate-pulse">Uploading...</span>
                    </div>
                )}
                {!uploading && successMessage && (
                    <p className="text-green-500 text-sm font-medium p-2 bg-green-500/10 rounded-md text-center">{successMessage}</p>
                )}
                {!uploading && errorMessage && (
                    <p className="text-red-500 text-sm font-medium p-2 bg-red-500/10 rounded-md text-center">{errorMessage}</p>
                )}
            </div>
            {folderId && <p className="text-xs text-zinc-600 mt-2 text-center">Dest: {folderId}</p>}
        </div>
    );
};

// Component for viewing Resource Drive files
const ResourceViewer = ({ folderId }: { folderId: string | null }) => {
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (folderId) {
            fetchFiles();
        } else {
            setLoading(false);
            setError("No resource folder assigned for this project.");
        }
    }, [folderId]);

    const fetchFiles = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/drive/list?folderId=${folderId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                }
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch files');
            }

            setFiles(data.files);
        } catch (err: any) {
            console.error('Error fetching resources:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-zinc-500 animate-pulse">Loading resources...</div>;
    }

    if (error) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <span className="text-red-500 font-bold">!</span>
                </div>
                <p className="text-red-400 mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={fetchFiles} className="mt-4">Retry</Button>
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className="p-8 flex flex-col items-center justify-center h-full text-center">
                <Folder size={48} className="text-zinc-600 mb-4" />
                <h3 className="text-xl font-medium text-zinc-300">Folder is Empty</h3>
                <p className="text-zinc-500 text-sm mt-2">There are no files uploaded to this project's resource drive yet.</p>
                <Button variant="outline" size="sm" onClick={fetchFiles} className="mt-6 text-zinc-400">Refresh</Button>
            </div>
        );
    }

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-medium text-white">Project Resources</h3>
                <Button variant="ghost" size="sm" onClick={fetchFiles} className="text-zinc-400 hover:text-white">Refresh</Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max">
                {files.map(file => (
                    <a
                        key={file.id}
                        href={file.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all group"
                    >
                        <img src={file.iconLink} alt="" className="w-6 h-6 opacity-80 group-hover:opacity-100" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{file.name}</p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
};
