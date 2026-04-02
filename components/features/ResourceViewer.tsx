import React, { useState, useEffect } from 'react';
import { Folder, KeyRound, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../contexts/AuthContext';

export const ResourceViewer = ({ folderId }: { folderId: string | null }) => {
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthError, setIsAuthError] = useState(false);
    const { requestDriveAccess, accessToken } = useAuth();

    // Re-fetch files when accessToken changes (e.g. after user connects Drive)
    useEffect(() => {
        if (folderId && accessToken) {
            fetchFiles();
        }
    }, [accessToken]);

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
            setIsAuthError(false);
            const res = await fetch(`/api/drive/list?folderId=${folderId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                }
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 401) {
                    setIsAuthError(true);
                }
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

    const handleDownload = (e: React.MouseEvent, file: any) => {
        e.preventDefault();
        e.stopPropagation();

        if (file.webContentLink) {
            // Direct download for binary files
            window.open(file.webContentLink, '_blank');
        } else {
            // For Google Docs/Sheets/Slides native files, open in Drive (no webContentLink available)
            window.open(file.webViewLink, '_blank');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-zinc-500 animate-pulse">Loading resources...</div>;
    }

    if (error) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-center h-full">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <span className="text-red-500 font-bold">!</span>
                </div>
                <p className="text-red-400 mb-6 text-sm max-w-md">{error}</p>
                {isAuthError ? (
                    <Button variant="default" onClick={() => requestDriveAccess(true)} className="flex items-center gap-2 bg-white text-zinc-900 hover:bg-zinc-200">
                        <KeyRound size={16} /> Connect Google Drive
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" onClick={fetchFiles}>Retry</Button>
                )}
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className="p-8 flex flex-col items-center justify-center h-full text-center">
                <Folder size={48} className="text-zinc-600 mb-4" />
                <h3 className="text-xl font-medium text-zinc-300">Folder is Empty</h3>
                <p className="text-zinc-500 text-sm mt-2">There are no files uploaded to this drive yet.</p>
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

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 gap-3 content-start">
                {files.map(file => {
                    const modifiedDate = file.modifiedTime ? new Date(file.modifiedTime) : null;
                    const dateStr = modifiedDate ? modifiedDate.toLocaleDateString() : '';
                    const timeStr = modifiedDate ? modifiedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    
                    return (
                        <div
                            key={file.id}
                            className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all group"
                        >
                            <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 flex-1 min-w-0"
                            >
                                <img src={file.iconLink} alt="" className="w-8 h-8 opacity-80 group-hover:opacity-100" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{file.name}</p>
                                    {modifiedDate && (
                                        <p className="text-xs text-zinc-500 mt-0.5">
                                            Uploaded: {dateStr} at {timeStr}
                                        </p>
                                    )}
                                </div>
                            </a>
                            <button
                                onClick={(e) => handleDownload(e, file)}
                                className="shrink-0 p-2 rounded-lg text-zinc-500 hover:text-orange-400 hover:bg-zinc-700/50 transition-all opacity-0 group-hover:opacity-100"
                                title={file.webContentLink ? "Download file" : "Open in Google Drive"}
                            >
                                <Download size={18} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
