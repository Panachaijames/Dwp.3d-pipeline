"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { UploadCloud, KeyRound, FileText, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface DriveUploaderProps {
    folderId: string | null;
    title?: string;
    description?: string;
}

interface UploadedFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    iconLink: string;
    modifiedTime: string;
}

export const DriveUploader = ({ folderId, title = "Upload Files", description = "Drag and drop your files here to upload directly to the drive." }: DriveUploaderProps) => {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isAuthError, setIsAuthError] = useState(false);
    const { requestDriveAccess, accessToken } = useAuth();

    // Uploaded files state
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [filesLoading, setFilesLoading] = useState(false);

    const fetchUploadedFiles = useCallback(async () => {
        if (!folderId) return;
        try {
            setFilesLoading(true);
            const res = await fetch(`/api/drive/list?folderId=${folderId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                }
            });
            const data = await res.json();
            if (res.ok && data.files) {
                setUploadedFiles(data.files);
            }
        } catch (err) {
            console.error('Error fetching uploaded files:', err);
        } finally {
            setFilesLoading(false);
        }
    }, [folderId]);

    // Fetch files on mount and when accessToken changes
    useEffect(() => {
        if (folderId) {
            fetchUploadedFiles();
        }
    }, [folderId, accessToken, fetchUploadedFiles]);

    const onDrop = async (acceptedFiles: File[]) => {
        if (!folderId) {
            setErrorMessage("No target folder assigned for this upload.");
            return;
        }

        if (acceptedFiles.length === 0) return;

        setUploading(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        setIsAuthError(false);
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
                if (res.status === 401) {
                    setIsAuthError(true);
                }
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to upload');
            }

            setSuccessMessage(`Successfully uploaded ${acceptedFiles[0].name}`);

            // Refresh the file list after successful upload
            await fetchUploadedFiles();

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
        <div className="flex flex-col h-full bg-zinc-900 rounded-xl transition-colors p-8 gap-6">
            {/* Upload Area */}
            <div className="flex flex-col">
                <h3 className="text-xl font-medium text-white mb-2">{title}</h3>
                <p className="text-zinc-400 text-sm mb-4">{description}</p>

                <div
                    {...getRootProps()}
                    className={`flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer bg-zinc-950/50 border-2 border-dashed py-10
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
                        <div className="flex flex-col items-center gap-3 mt-2">
                            <p className="text-red-500 text-sm font-medium p-2 bg-red-500/10 rounded-md text-center">{errorMessage}</p>
                            {isAuthError && (
                                <button
                                    onClick={() => requestDriveAccess(true)}
                                    className="flex items-center gap-2 bg-white text-zinc-900 hover:bg-zinc-200 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    <KeyRound size={16} /> Connect Google Drive
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Uploaded Files List */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Uploaded Files</h4>
                    <span className="text-xs text-zinc-600">{uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}</span>
                </div>

                {filesLoading && uploadedFiles.length === 0 ? (
                    <div className="text-zinc-500 text-sm text-center py-6 animate-pulse">Loading files...</div>
                ) : uploadedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                        <FileText size={32} className="text-zinc-700 mb-2" />
                        <p className="text-zinc-600 text-sm">No files uploaded yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        {uploadedFiles.map(file => {
                            const modifiedDate = file.modifiedTime ? new Date(file.modifiedTime) : null;
                            const dateStr = modifiedDate ? modifiedDate.toLocaleDateString() : '';
                            const timeStr = modifiedDate ? modifiedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                            return (
                                <a
                                    key={file.id}
                                    href={file.webViewLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all group"
                                >
                                    {file.iconLink ? (
                                        <img src={file.iconLink} alt="" className="w-6 h-6 opacity-70 group-hover:opacity-100" />
                                    ) : (
                                        <FileText size={20} className="text-zinc-500 group-hover:text-zinc-300" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white">{file.name}</p>
                                        {modifiedDate && (
                                            <p className="text-xs text-zinc-600 mt-0.5">
                                                {dateStr} at {timeStr}
                                            </p>
                                        )}
                                    </div>
                                    <ExternalLink size={14} className="text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
