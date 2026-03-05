"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, CheckCircle2, FileText, Loader2, FolderPlus, Image as ImageIcon, Box, ChevronRight, Search, Settings, Download, ExternalLink, Folder } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { googleDriveService, DriveFile } from '../services/googleDriveService';
import { DrivePicker } from './SubmissionPortal/DrivePicker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';


import { FileBrowser } from './FileBrowser';

interface LibraryPortalProps {
}

type Step = 'MODEL' | 'PREVIEW' | 'DETAILS' | 'SUCCESS';

export const LibraryPortal: React.FC<LibraryPortalProps> = () => {
    const { accessToken } = useAuth();
    const DEFAULT_ROOT_ID = '1XFyxsqCrpDfE4YAUXz8enma-Ivja7Nlx';
    const [step, setStep] = useState<Step>('MODEL');

    // Data State
    const [modelFiles, setModelFiles] = useState<File[]>([]);
    const [previewFiles, setPreviewFiles] = useState<File[]>([]);
    const [metadata, setMetadata] = useState({
        brand: '',
        series: '',
        remarks: '',
        targetFolderId: '', // Selected Drive Folder ID
        targetFolderName: '' // Selected Drive Folder Name
    });

    // Drive State
    const [driveFolders, setDriveFolders] = useState<DriveFile[]>([]);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [searchFolderTerm, setSearchFolderTerm] = useState('');

    // Root Folder Configuration
    const [libraryRootId, setLibraryRootId] = useState(DEFAULT_ROOT_ID);
    const [rootFolderError, setRootFolderError] = useState<string | null>(null);
    const [showRootPicker, setShowRootPicker] = useState(false);

    // Upload State
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Refs
    const modelInputRef = useRef<HTMLInputElement>(null);
    const previewInputRef = useRef<HTMLInputElement>(null);

    // Load Folders on Mount (or when entering Details step)
    useEffect(() => {
        if (step === 'DETAILS' && accessToken) {
            loadFolders();
        }
    }, [step, accessToken, libraryRootId]);

    const loadFolders = async () => {
        if (!accessToken) return;
        setLoadingFolders(true);
        setRootFolderError(null);
        try {
            const folders = await googleDriveService.listFolders(accessToken, libraryRootId);
            setDriveFolders(folders);
        } catch (err) {
            console.error("Failed to load folders", err);
            setRootFolderError("Could not access the configured Library Root folder.");
        } finally {
            setLoadingFolders(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!accessToken || !newFolderName.trim()) return;
        setIsCreatingFolder(true);
        try {
            const newId = await googleDriveService.createFolder(accessToken, libraryRootId, newFolderName);
            // Refresh list and select new folder
            await loadFolders();
            setMetadata(prev => ({ ...prev, targetFolderId: newId, targetFolderName: newFolderName }));
            setNewFolderName('');
            alert(`Folder "${newFolderName}" created successfully!`);
        } catch (err) {
            console.error("Failed to create folder", err);
            alert("Failed to create folder");
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleFileUpload = async () => {
        // ... (keep existing implementation)
        if (!accessToken || !metadata.targetFolderId) {
            alert("Please select a destination folder.");
            return;
        }
        if (modelFiles.length === 0) {
            alert("Please upload at least one 3D model.");
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            const folderName = metadata.targetFolderName || "Asset";
            let baseName = "";

            if (metadata.brand && metadata.series) {
                baseName = `${folderName}-${metadata.brand}-${metadata.series}`;
            } else {
                baseName = `${folderName}-X01`;
            }

            const metadataContent = `Brand: ${metadata.brand}\nSeries: ${metadata.series}\nInternal Remarks: ${metadata.remarks}\nDate Uploaded: ${new Date().toISOString()}`;
            const metadataFile = new File([metadataContent], "asset_info.txt", { type: "text/plain" });

            const allFiles = [...modelFiles, ...previewFiles, metadataFile];
            const total = allFiles.length;
            let completed = 0;

            for (const file of allFiles) {
                let customName = file.name;

                // Rename logic
                if (file === metadataFile) {
                    customName = "asset_info.txt";
                } else if (modelFiles.includes(file)) {
                    const ext = file.name.split('.').pop();
                    customName = `${baseName}.${ext}`;
                } else if (previewFiles.includes(file)) {
                    const index = previewFiles.indexOf(file) + 1;
                    const ext = file.name.split('.').pop();
                    customName = `${baseName}_preview_${index}.${ext}`;
                }

                await googleDriveService.uploadFile(accessToken, metadata.targetFolderId, file, customName);
                completed++;
                setUploadProgress((completed / total) * 100);
            }

            setStep('SUCCESS');
        } catch (error) {
            console.error("Upload failed", error);
            alert("Upload failed. Please check console.");
        } finally {
            setUploading(false);
        }
    };

    // Helper for filtered folders
    const filteredFolders = driveFolders.filter(f =>
        f.name.toLowerCase().includes(searchFolderTerm.toLowerCase())
    );

    const renderFilePreview = (file: File, onRemove: () => void) => (
        <div key={file.name} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <div className="flex items-center gap-3 overflow-hidden">
                <FileText size={18} className="text-purple-500 shrink-0" />
                <span className="text-sm font-medium truncate">{file.name}</span>
                <span className="text-xs text-zinc-400 shrink-0">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            </div>
            <button onClick={onRemove} className="text-zinc-400 hover:text-red-500 transition-colors">
                <X size={16} />
            </button>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in">
            {/* Header */}
            <div className="mb-8 flex flex-col items-center text-center">
                <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Digital Archive</h1>
                <p className="text-zinc-500">Upload and manage 3D assets for the organization</p>
            </div>

            <Tabs defaultValue="upload" className="w-full">
                <div className="flex justify-center mb-8">
                    <TabsList className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl">
                        <TabsTrigger value="upload" className="px-6 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm">
                            <Upload size={16} className="mr-2" />
                            Upload Asset
                        </TabsTrigger>
                        <TabsTrigger value="browse" className="px-6 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm">
                            <Search size={16} className="mr-2" />
                            Browse Library
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="browse">
                    <FileBrowser initialFolderId={DEFAULT_ROOT_ID} accessToken={accessToken} rootName="Library Root" />
                </TabsContent>

                <TabsContent value="upload">
                    {/* Stepper */}
                    <div className="flex items-center justify-center gap-4 mb-8">
                        {[
                            { id: 'MODEL', label: 'Select Model', icon: Box },
                            { id: 'PREVIEW', label: 'Add Previews', icon: ImageIcon },
                            { id: 'DETAILS', label: 'Indexing Details', icon: FileText },
                        ].map((s, idx) => {
                            const isActive = step === s.id;
                            const isCompleted = ['MODEL', 'PREVIEW', 'DETAILS', 'SUCCESS'].indexOf(step) > idx;
                            const Icon = s.icon;
                            return (
                                <div key={s.id} className="flex items-center gap-3">
                                    <div className={`
                                flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all
                                ${isActive ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' :
                                            isCompleted ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' :
                                                'border-zinc-200 dark:border-zinc-800 text-zinc-400'
                                        }
                            `}>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isActive || isCompleted ? 'bg-current text-white dark:text-black' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                                            {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
                                        </div>
                                        <span className="font-semibold text-sm hidden sm:inline">{s.label}</span>
                                    </div>
                                    {idx < 2 && <div className="w-8 h-px bg-zinc-200 dark:bg-zinc-800" />}
                                </div>
                            );
                        })}
                    </div>

                    {/* Step Content */}
                    <div className="bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-xl shadow-zinc-200/50 dark:shadow-none min-h-[400px]">

                        {/* STEP 1: MODEL */}
                        {step === 'MODEL' && (
                            <div className="flex flex-col h-full">
                                <div
                                    className="flex-1 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 hover:border-purple-500 dark:hover:border-purple-500 transition-colors flex flex-col items-center justify-center gap-4 p-10 cursor-pointer group"
                                    onClick={() => modelInputRef.current?.click()}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => {
                                        e.preventDefault();
                                        if (e.dataTransfer.files) setModelFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                                    }}
                                >
                                    <div className="w-20 h-20 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <Box size={40} className="text-zinc-400 group-hover:text-purple-500 transition-colors" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">3D Model Asset</h3>
                                        <p className="text-zinc-500 text-sm font-medium uppercase tracking-wide">Drag, Click, or Paste (Ctrl+V)</p>
                                        <div className="mt-4 flex gap-2 justify-center flex-wrap">
                                            {['MAX', '3DS', 'DWG', 'OBJ', 'ZIP', 'RAR', '7Z'].map(ext => (
                                                <span key={ext} className="px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-semibold text-zinc-500">{ext}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <input ref={modelInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && setModelFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                                </div>

                                {modelFiles.length > 0 && (
                                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {modelFiles.map((file, i) => renderFilePreview(file, () => setModelFiles(files => files.filter((_, idx) => idx !== i))))}
                                    </div>
                                )}

                                <div className="mt-8 flex justify-end">
                                    <button
                                        onClick={() => setStep('PREVIEW')}
                                        disabled={modelFiles.length === 0}
                                        className="px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        Next Step <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: PREVIEWS */}
                        {step === 'PREVIEW' && (
                            <div className="flex flex-col h-full">
                                <div
                                    className="flex-1 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 hover:border-purple-500 dark:hover:border-purple-500 transition-colors flex flex-col items-center justify-center gap-4 p-10 cursor-pointer group"
                                    onClick={() => previewInputRef.current?.click()}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => {
                                        e.preventDefault();
                                        if (e.dataTransfer.files) setPreviewFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                                    }}
                                >
                                    <div className="w-20 h-20 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <ImageIcon size={40} className="text-zinc-400 group-hover:text-purple-500 transition-colors" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Gallery Images</h3>
                                        <p className="text-zinc-500 text-sm font-medium uppercase tracking-wide">Drag, Click, or Paste (Ctrl+V)</p>
                                        <div className="mt-4 flex gap-2 justify-center flex-wrap">
                                            {['JPG', 'PNG', 'JPEG'].map(ext => (
                                                <span key={ext} className="px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-semibold text-zinc-500">{ext}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <input ref={previewInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && setPreviewFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                                </div>

                                {previewFiles.length > 0 && (
                                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {previewFiles.map((file, i) => renderFilePreview(file, () => setPreviewFiles(files => files.filter((_, idx) => idx !== i))))}
                                    </div>
                                )}

                                <div className="mt-8 flex justify-between">
                                    <button onClick={() => setStep('MODEL')} className="px-6 py-3 text-zinc-500 font-medium hover:text-zinc-900 dark:hover:text-zinc-300">Back</button>
                                    <button
                                        onClick={() => setStep('DETAILS')}
                                        className="px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:opacity-90 flex items-center gap-2"
                                    >
                                        Next Step <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: DETAILS */}
                        {step === 'DETAILS' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Indexing Information</h3>
                                        <div className="space-y-4">
                                            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-xl">
                                                <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">Manufacturer / Brand</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-white placeholder-zinc-400"
                                                    placeholder="e.g. Knoll Studio"
                                                    value={metadata.brand}
                                                    onChange={e => setMetadata(prev => ({ ...prev, brand: e.target.value }))}
                                                />
                                            </div>
                                            <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-4 rounded-xl">
                                                <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Model Collection / Series</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500/20 text-zinc-900 dark:text-white placeholder-zinc-400"
                                                    placeholder="e.g. Barcelona Collection"
                                                    value={metadata.series}
                                                    onChange={e => setMetadata(prev => ({ ...prev, series: e.target.value }))}
                                                />
                                            </div>
                                            <div className="bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl">
                                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Internal Remarks</label>
                                                <textarea
                                                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-500/20 text-zinc-900 dark:text-white placeholder-zinc-400 min-h-[100px] resize-none"
                                                    placeholder="Mesh detail, textures, setup notes..."
                                                    value={metadata.remarks}
                                                    onChange={e => setMetadata(prev => ({ ...prev, remarks: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Destination</h3>
                                    <div className="bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-6 rounded-2xl h-full flex flex-col relative">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <label className="block text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Asset Folder (Google Drive)</label>
                                                <div className="text-[10px] text-zinc-400">Root: {libraryRootId === DEFAULT_ROOT_ID ? 'Default Archive' : 'Custom Folder'}</div>
                                            </div>
                                            <button
                                                onClick={() => setShowRootPicker(true)}
                                                className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400 transition-colors"
                                                title="Change Library Root Folder"
                                            >
                                                <Settings size={16} />
                                            </button>
                                        </div>

                                        <div className="flex gap-2 mb-4">
                                            <div className="relative flex-1">
                                                <Search size={16} className="absolute left-3 top-3.5 text-zinc-400" />
                                                <input
                                                    type="text"
                                                    className="w-full pl-9 pr-4 py-3 bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 rounded-xl outline-none focus:ring-2 focus:ring-green-500/20 text-zinc-900 dark:text-white placeholder-zinc-400"
                                                    placeholder="Search existing folders..."
                                                    value={searchFolderTerm}
                                                    onChange={e => setSearchFolderTerm(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex-1 min-h-[200px] max-h-[300px] overflow-y-auto bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 rounded-xl p-2 mb-4 custom-scrollbar">
                                            {loadingFolders ? (
                                                <div className="flex items-center justify-center h-full text-zinc-400 gap-2">
                                                    <Loader2 className="animate-spin" size={20} /> Loading folders...
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    {filteredFolders.map(folder => (
                                                        <button
                                                            key={folder.id}
                                                            onClick={() => setMetadata(prev => ({ ...prev, targetFolderId: folder.id, targetFolderName: folder.name }))}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${metadata.targetFolderId === folder.id
                                                                ? 'bg-green-600 text-white'
                                                                : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-zinc-700 dark:text-zinc-300'
                                                                }`}
                                                        >
                                                            <div className={`w-2 h-2 rounded-full ${metadata.targetFolderId === folder.id ? 'bg-white' : 'bg-green-500/50'}`} />
                                                            <span className="truncate">{folder.name}</span>
                                                        </button>
                                                    ))}
                                                    {filteredFolders.length === 0 && !rootFolderError && (
                                                        <div className="text-center py-8 text-zinc-400 text-sm">No folders found</div>
                                                    )}
                                                    {rootFolderError && (
                                                        <div className="text-center py-8 px-4">
                                                            <div className="text-red-500 text-sm font-semibold mb-2">{rootFolderError}</div>
                                                            <button
                                                                onClick={() => setShowRootPicker(true)}
                                                                className="text-xs bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
                                                            >
                                                                Select different root
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 mt-auto">
                                            <input
                                                type="text"
                                                className="flex-1 px-4 py-3 bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 rounded-xl outline-none focus:ring-2 focus:ring-green-500/20 text-sm text-zinc-900 dark:text-white placeholder-zinc-400"
                                                placeholder="Or create new folder..."
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                            />
                                            <button
                                                onClick={handleCreateFolder}
                                                disabled={isCreatingFolder || !newFolderName.trim()}
                                                className="px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl"
                                            >
                                                {isCreatingFolder ? <Loader2 className="animate-spin" /> : <FolderPlus />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="col-span-1 lg:col-span-2 flex justify-between pt-6 border-t border-zinc-200 dark:border-zinc-800">
                                    <button onClick={() => setStep('PREVIEW')} className="px-6 py-3 text-zinc-500 font-medium hover:text-zinc-900 dark:hover:text-zinc-300">Back</button>
                                    <button
                                        onClick={handleFileUpload}
                                        disabled={uploading || !metadata.targetFolderId}
                                        className="px-10 py-4 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100 shadow-xl shadow-zinc-500/10 flex items-center gap-2"
                                    >
                                        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                                        {uploading ? `Uploading... ${uploadProgress}%` : 'Finalize Upload'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 4: SUCCESS */}
                        {step === 'SUCCESS' && (
                            <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                <div className="w-24 h-24 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
                                    <CheckCircle2 size={48} />
                                </div>
                                <h3 className="text-3xl font-bold text-zinc-900 dark:text-white mb-4">Asset Indexed Successfully</h3>
                                <p className="text-zinc-500 max-w-md mx-auto mb-10 text-lg">
                                    The 3D model and its previews have been secured in the archive folder.
                                </p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => {
                                            setStep('MODEL');
                                            setModelFiles([]);
                                            setPreviewFiles([]);
                                            setMetadata({ brand: '', series: '', remarks: '', targetFolderId: '', targetFolderName: '' });
                                        }}
                                        className="px-8 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                    >
                                        Upload Another
                                    </button>
                                    <button
                                        onClick={() => window.open(metadata.targetFolderId ? `https://drive.google.com/drive/folders/${metadata.targetFolderId}` : 'https://drive.google.com', '_blank')}
                                        className="px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:scale-105 transition-transform"
                                    >
                                        View in Drive
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats / Info Footer */}
                    <div className="mt-8 flex justify-end">
                        <div className="bg-white dark:bg-zinc-900 rounded-full px-6 py-2 shadow-lg border border-zinc-100 dark:border-zinc-800 flex items-center gap-4 text-sm text-zinc-500">
                            <div className="flex -space-x-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold">?</div>
                                ))}
                            </div>
                            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
                            <div className="flex flex-col leading-none">
                                <span className="font-bold text-zinc-900 dark:text-white text-base">0</span>
                                <span className="text-[10px] uppercase tracking-wider font-semibold">Total Indexed</span>
                            </div>
                        </div>
                    </div>

                    {/* Root Folder Picker Modal */}
                    {showRootPicker && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                            <div className="w-full max-w-2xl">
                                <DrivePicker
                                    onSelect={(id, name) => {
                                        setLibraryRootId(id);
                                        setShowRootPicker(false);
                                        // We need to trigger a reload of folders now that ID changed.
                                        // Since loadFolders uses libraryRootId state, checking it in useEffect:
                                    }}
                                    onCancel={() => setShowRootPicker(false)}
                                />
                            </div>
                        </div>
                    )}

                </TabsContent>


            </Tabs>
        </div >
    );

};
