"use client";

import React, { useState } from 'react';
import { ProjectRequest } from '../../types';
import { DrivePicker } from './DrivePicker';
import { Upload, X, CheckCircle2, FileText, Loader2, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { googleDriveService } from '../../services/googleDriveService';

interface SubmissionPortalProps {
    request: ProjectRequest;
    onClose: () => void;
}

type SubmissionStep = 'SELECT_FOLDER' | 'UPLOAD_FILES' | 'SUCCESS';

export const SubmissionPortal: React.FC<SubmissionPortalProps> = ({ request, onClose }) => {
    const { accessToken } = useAuth();

    // Auto-select folder if provided in request
    const hasPreselectedFolder = !!(request.driveFolderId && request.driveFolderName);

    const [step, setStep] = useState<SubmissionStep>(hasPreselectedFolder ? 'UPLOAD_FILES' : 'SELECT_FOLDER');
    const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(
        hasPreselectedFolder
            ? { id: request.driveFolderId!, name: request.driveFolderName! }
            : null
    );

    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [folderError, setFolderError] = useState<string | null>(null);
    const [verifyingAccess, setVerifyingAccess] = useState(false);

    // Verify access to pre-selected folder
    React.useEffect(() => {
        const verifyAccess = async () => {
            if (hasPreselectedFolder && accessToken && request.driveFolderId) {
                setVerifyingAccess(true);
                setFolderError(null);
                try {
                    const result = await googleDriveService.verifyFolderAccess(accessToken, request.driveFolderId);
                    if (!result.canAccess) {
                        setFolderError("You do not have permission to upload to the designated project folder.");
                        // Allow manual selection as fallback
                        setStep('SELECT_FOLDER');
                        setSelectedFolder(null);
                    } else {
                        // Confirm name might have changed or just to be sure
                        if (result.name && result.name !== request.driveFolderName) {
                            setSelectedFolder({ id: request.driveFolderId, name: result.name });
                        }
                    }
                } catch (e) {
                    setFolderError("Could not verify folder access. Please select a folder manually.");
                    setStep('SELECT_FOLDER');
                    setSelectedFolder(null);
                } finally {
                    setVerifyingAccess(false);
                }
            }
        };

        if (step === 'UPLOAD_FILES' && hasPreselectedFolder) {
            verifyAccess();
        }
    }, [hasPreselectedFolder, accessToken, request.driveFolderId, step]);

    const handleFolderSelect = (folderId: string, folderName: string) => {
        setFolderError(null); // Clear previous errors on manual select
        setSelectedFolder({ id: folderId, name: folderName });
        setStep('UPLOAD_FILES');
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files) {
            setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
        }
    };

    const handleFileUpload = async () => {
        if (!files.length || !accessToken || !selectedFolder) return;

        setUploading(true);
        setUploadProgress(0);

        try {
            // 1. Determine Target Folder (YYMMDD subfolder)
            const today = new Date();
            const yy = today.getFullYear().toString().slice(-2);
            const mm = (today.getMonth() + 1).toString().padStart(2, '0');
            const dd = today.getDate().toString().padStart(2, '0');
            const dateFolderName = `${yy}${mm}${dd}`;

            let targetFolderId = selectedFolder.id;

            // Check if date folder exists, if not create it
            // We only do this if we are in the "Project Folder" context (pre-selected)
            // If user manually selected a folder, we might still want this behavior? 
            // The user asked "create a folder in that drive", implying the selected project drive/folder.
            // Let's apply this logic always for consistency in this portal.

            try {
                const existingDateFolderId = await googleDriveService.findFolder(accessToken, selectedFolder.id, dateFolderName);
                if (existingDateFolderId) {
                    targetFolderId = existingDateFolderId;
                } else {
                    targetFolderId = await googleDriveService.createFolder(accessToken, selectedFolder.id, dateFolderName);
                }
            } catch (err) {
                console.error("Failed to ensure date subfolder, uploading to root of selected folder", err);
                // Fallback to uploading to the selected folder directly if subfolder creation fails
            }

            // 2. Upload Files to Target Folder
            const totalFiles = files.length;
            let completed = 0;

            for (const file of files) {
                await googleDriveService.uploadFile(accessToken, targetFolderId, file, undefined, (progress) => {
                    // Calculate individual file progress contribution? 
                    // For simplicity, we'll just track completed files for now or rough progress
                });
                completed++;
                setUploadProgress((completed / totalFiles) * 100);
            }

            setStep('SUCCESS');
            setFiles([]);
        } catch (error) {
            console.error('Upload failed:', error);
            if ((error as Error).message === 'Unauthorized') {
                setFolderError("Session expired. Please sign in again.");
                // Optionally clear session here? or let user do it via UI
            } else {
                alert('Failed to upload files. Please try again.');
            }
        } finally {
            setUploading(false);
        }
    };

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-950">
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Upload className="text-purple-500" size={24} />
                            Submit Work
                        </h2>
                        <p className="text-sm text-zinc-500">
                            Submitting for <span className="font-semibold text-zinc-800 dark:text-zinc-200">{request.requestName}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black/50 p-6">

                    {step === 'SELECT_FOLDER' && (
                        <div className="h-full flex flex-col gap-4">
                            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-4 rounded-xl flex gap-3 text-sm text-blue-800 dark:text-blue-200">
                                <LinkIcon size={18} className="shrink-0 mt-0.5" />
                                <p>Please select the project folder in Google Drive where the final assets should be uploaded.</p>
                            </div>
                            <DrivePicker
                                onSelect={handleFolderSelect}
                                onCancel={onClose}
                            />
                        </div>
                    )}

                    {step === 'UPLOAD_FILES' && selectedFolder && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-zinc-900 dark:text-white">Upload Files</h3>
                                <div className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded border border-blue-100 dark:border-blue-800">
                                    Destination: {selectedFolder.name}
                                </div>
                            </div>

                            {/* Dropzone */}
                            {folderError && (
                                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 p-4 rounded-xl flex gap-3 text-sm text-red-600 dark:text-red-400 mb-4 animate-in slide-in-from-top-2">
                                    <div className="shrink-0">⚠️</div>
                                    <div>
                                        <p className="font-semibold">Permission Error</p>
                                        <p>{folderError}</p>
                                    </div>
                                    <button
                                        onClick={() => setStep('SELECT_FOLDER')}
                                        className="ml-auto text-xs underline hover:no-underline"
                                    >
                                        Change Folder
                                    </button>
                                </div>
                            )}

                            {verifyingAccess ? (
                                <div className="h-64 flex flex-col items-center justify-center text-zinc-400 gap-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                                    <Loader2 className="animate-spin text-purple-500" size={32} />
                                    <p className="text-sm">Verifying folder access...</p>
                                </div>
                            ) : (
                                <div
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={handleFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl p-10 flex flex-col items-center justify-center text-center hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all cursor-pointer bg-white dark:bg-zinc-900"
                                >
                                    <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400">
                                        <Upload size={32} />
                                    </div>
                                    <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">Drag and drop files here</h4>
                                    <p className="text-sm text-zinc-500">or click to browse from your computer</p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={e => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files)])}
                                    />
                                </div>
                            )}
                            {/* File List */}
                            {files.length > 0 && (
                                <div className="space-y-3">
                                    {files.map((file, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <FileText size={20} className="text-purple-500" />
                                                <div>
                                                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate max-w-[200px]">{file.name}</p>
                                                    <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                                                className="text-zinc-400 hover:text-red-500"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Progress Bar (if uploading) */}
                            {uploading && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-semibold text-zinc-500 uppercase">
                                        <span>Uploading...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-purple-600 transition-all duration-300 ease-out"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                {!hasPreselectedFolder && (
                                    <button
                                        onClick={() => setStep('SELECT_FOLDER')}
                                        disabled={uploading}
                                        className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-sm font-medium"
                                    >
                                        Back
                                    </button>
                                )}
                                <button
                                    onClick={handleFileUpload}
                                    disabled={files.length === 0 || uploading}
                                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-lg shadow-purple-900/20 flex items-center gap-2"
                                >
                                    {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                    {uploading ? 'Uploading...' : 'Submit Files'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'SUCCESS' && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-10">
                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
                                <CheckCircle2 size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Submission Successful!</h3>
                            <p className="text-zinc-500 max-w-sm mx-auto mb-8">
                                Your files have been uploaded to <strong>{selectedFolder?.name}</strong>. The project status will be updated automatically.
                            </p>
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:scale-105 transition-transform"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
