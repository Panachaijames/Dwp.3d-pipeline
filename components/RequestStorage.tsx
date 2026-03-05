"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ProjectRequest } from '../types';
import { Clock, CheckCircle2, AlertCircle, FileText, Calendar, Layout, Info, Upload, Folder, ExternalLink } from 'lucide-react';
import { SubmissionPortal } from './SubmissionPortal/SubmissionPortal';
import { FileBrowser } from './FileBrowser';

export const RequestStorage: React.FC = () => {
    const { user, accessToken } = useAuth();
    const [requests, setRequests] = useState<ProjectRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<ProjectRequest | null>(null);
    const [showSubmission, setShowSubmission] = useState(false);

    useEffect(() => {
        if (user) fetchRequests();

        // Subscribe to realtime changes
        const channel = supabase
            .channel('storage_project_requests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'project_requests' }, (payload) => {
                console.log('Change received!', payload);
                fetchRequests();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            // Fetch requests submitted by the current user (using email as identifier)
            // Ideally we filter by submitter, but since we don't have perfect auth mapping yet,
            // we will fetch all and filter in memory or show all for visibility during dev.
            const { data, error } = await supabase
                .from('project_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Client-side mapping & filtering
            const mapped = (data || []).map((r: any) => ({
                id: r.id,
                studioFullName: r.studio_full_name,
                projectNumber: r.project_number,
                requestName: r.request_name,
                projectName: r.project_name,
                department: r.department,
                requester: r.requester,
                numberOfRenderings: r.number_of_renderings,
                sharedPresentationLink: r.shared_presentation_link,
                designReviewBooking: r.design_review_booking,
                providedFiles: r.provided_files,
                description: r.description,
                deadline: r.deadline,
                areas: r.areas,
                status: r.status,
                currentPhase: r.current_phase,
                progress: r.progress,
                priority: r.priority,
                submittedBy: r.submitted_by,
                timestamp: r.timestamp,
                preferredTool: r.preferred_tool, // Assuming checking for this column or mapped from JSON
                driveFolderId: r.drive_folder_id,
                driveFolderName: r.drive_folder_name
            }));

            setRequests(mapped);

        } catch (err) {
            console.error('Error loading requests:', err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Completed': return 'text-green-500 bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20';
            case 'In Progress': return 'text-purple-500 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20';
            default: return 'text-amber-500 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20';
        }
    };

    return (
        <div className="animate-in fade-in space-y-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">Requests</h2>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">History of project requests submitted to the pipeline.</p>
                </div>
                <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-full text-zinc-600 dark:text-zinc-400 text-sm font-mono font-medium">
                    {requests.length} Requests
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-zinc-400 animate-pulse">Loading requests...</div>
            ) : requests.length === 0 ? (
                <div className="text-center py-24 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 border-dashed">
                    <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white">No requests found</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-2 mb-8">
                        Submit a new project request to see it tracked here.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {requests.map((req) => (
                        <div key={req.id} onClick={() => setSelectedRequest(req)} className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 hover:border-purple-500/50 dark:hover:border-purple-500/50 transition-all shadow-sm hover:shadow-lg hover:shadow-purple-500/5 cursor-pointer">
                            <div className="flex flex-col lg:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-4 flex-1">
                                    <div className="flex items-start justify-between md:justify-start gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/10 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-lg shrink-0">
                                            {req.studioFullName.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-white text-lg leading-tight mb-1">{req.requestName}</h3>
                                            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                                <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">{req.projectNumber}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1"><Layout size={12} /> {req.studioFullName}</span>
                                                <span>•</span>
                                                <span>{req.department}</span>
                                            </div>
                                        </div>
                                        <span className={`lg:hidden ml-auto px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(req.status)}`}>
                                            {req.status}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-500 dark:text-zinc-400 lg:justify-end min-w-fit">
                                    <div className="hidden lg:block">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(req.status)}`}>
                                            {req.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2" title="Deadline">
                                        <Calendar size={16} className="text-zinc-400" />
                                        <span className={!req.deadline ? 'italic opacity-50' : 'font-medium'}>
                                            {req.deadline ? new Date(req.deadline).toLocaleDateString() : 'No deadline'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2" title="Total Views">
                                        <Layout size={16} className="text-zinc-400" />
                                        <span className="font-medium">{req.numberOfRenderings} Views</span>
                                    </div>
                                    {req.preferredTool && (
                                        <div className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-bold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                            {req.preferredTool}
                                        </div>
                                    )}
                                    {req.driveFolderId && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(`https://drive.google.com/drive/folders/${req.driveFolderId}`, '_blank');
                                            }}
                                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-blue-500 transition-colors"
                                            title="Open Project Folder"
                                        >
                                            <Folder size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {/* Request Detail Modal */}
            {selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto transform transition-all animate-in slide-in-from-bottom-4">
                        <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
                            <div>
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{selectedRequest.requestName}</h3>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">{selectedRequest.id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedRequest(null)}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <AlertCircle className="w-6 h-6 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rotate-45" />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            {/* Actions Bar */}
                            <div className="flex justify-end gap-3">
                                {selectedRequest.driveFolderId && (
                                    <button
                                        onClick={() => window.open(`https://drive.google.com/drive/folders/${selectedRequest.driveFolderId}`, '_blank')}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg font-medium transition-all"
                                    >
                                        <ExternalLink size={18} />
                                        Open Drive Folder
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowSubmission(true)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-lg shadow-purple-900/20 transition-all hover:-translate-y-0.5"
                                >
                                    <Upload size={18} />
                                    Submit Work
                                </button>
                            </div>

                            {/* Project Details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Project Info</h4>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                            <span className="text-zinc-500">Studio</span>
                                            <span className="font-medium text-zinc-900 dark:text-white">{selectedRequest.studioFullName}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                            <span className="text-zinc-500">Project Name</span>
                                            <span className="font-medium text-zinc-900 dark:text-white">{selectedRequest.projectName}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                            <span className="text-zinc-500">Project Number</span>
                                            <span className="font-medium text-zinc-900 dark:text-white font-mono">{selectedRequest.projectNumber}</span>
                                        </div>
                                        <div className="flex justify-between pt-1">
                                            <span className="text-zinc-500">Department</span>
                                            <span className="font-medium text-zinc-900 dark:text-white">{selectedRequest.department}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Request Info</h4>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                            <span className="text-zinc-500">Requester</span>
                                            <span className="font-medium text-zinc-900 dark:text-white">{selectedRequest.requester}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                            <span className="text-zinc-500">Date</span>
                                            <span className="font-medium text-zinc-900 dark:text-white">
                                                {new Date(selectedRequest.timestamp || '').toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                            <span className="text-zinc-500">Deadline</span>
                                            <span className="font-bold text-purple-600 dark:text-purple-400">
                                                {new Date(selectedRequest.deadline).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between pt-1">
                                            <span className="text-zinc-500">Status</span>
                                            <span className={`font-bold px-2 py-0.5 rounded text-xs ${getStatusColor(selectedRequest.status)}`}>
                                                {selectedRequest.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Preferred Tool & Renderings */}
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-zinc-400 uppercase block mb-1">Preferred Tool</span>
                                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{selectedRequest.preferredTool || 'Not Specified'}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-bold text-zinc-400 uppercase block mb-1">Renderings</span>
                                    <span className="text-lg font-bold text-zinc-900 dark:text-white">{selectedRequest.numberOfRenderings}</span>
                                </div>
                            </div>

                            {/* Project Files Browser */}
                            {selectedRequest.driveFolderId && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Project Files</h4>
                                        <button
                                            onClick={() => window.open(`https://drive.google.com/drive/folders/${selectedRequest.driveFolderId}`, '_blank')}
                                            className="text-xs flex items-center gap-1 text-blue-500 hover:underline"
                                        >
                                            <ExternalLink size={12} />
                                            Open in Drive
                                        </button>
                                    </div>
                                    <FileBrowser
                                        initialFolderId={selectedRequest.driveFolderId}
                                        accessToken={accessToken}
                                        rootName="Project Folder"
                                    />
                                </div>
                            )}

                            {/* Areas / Scope */}
                            {selectedRequest.areas && selectedRequest.areas.some(a => a.scope) && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Areas & Scope</h4>
                                    <div className="grid gap-3">
                                        {selectedRequest.areas.map((area, idx) => area.scope && (
                                            <div key={idx} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-bold text-zinc-900 dark:text-white">{area.scope}</span>
                                                    <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-zinc-500">Area {idx + 1}</span>
                                                </div>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{area.description || 'No description provided.'}</p>
                                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                                    {area.designer && <span className="flex items-center gap-1"><Info size={12} /> {area.designer}</span>}
                                                    {area.targetDate && <span className="flex items-center gap-1"><Calendar size={12} /> {area.targetDate}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Description & Links */}
                            <div className="space-y-6">
                                {selectedRequest.description && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Description</h4>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-900/30 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                            {selectedRequest.description}
                                        </p>
                                    </div>
                                )}

                                {selectedRequest.providedFiles && selectedRequest.providedFiles.length > 0 && selectedRequest.providedFiles[0] !== '' && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Attached Files</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedRequest.providedFiles.map((file, i) => (
                                                <a
                                                    key={i}
                                                    href={file}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors text-sm font-medium border border-purple-100 dark:border-purple-500/20"
                                                >
                                                    <Layout size={14} />
                                                    View File {i + 1}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {
                showSubmission && selectedRequest && (
                    <SubmissionPortal
                        request={selectedRequest}
                        onClose={() => setShowSubmission(false)}
                    />
                )
            }
        </div >
    );
};
