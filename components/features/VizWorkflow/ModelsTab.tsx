"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../services/supabaseClient';
import { googleDriveService, DriveFile } from '../../../services/googleDriveService';
import { AlertCircle, Archive, CheckCircle2, FolderOpen, KeyRound, FileBox, Image as ImageIcon, UploadCloud } from 'lucide-react';
import { FileBrowser } from '../../viewers/FileBrowser';

const ModelViewer = dynamic(() => import('../../viewers/ModelViewer'), { ssr: false });

const SUPPORTED_LOCAL = ['.gltf', '.glb', '.fbx', '.obj', '.3ds'];
const DRIVE_FOLDER_ID = '12DiRer4UBvZcpsGZKd-ONAUIVahnMYEJ';
const BACKUP_RESOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.tga', '.vrmesh', '.ies', '.hdr', '.tx', '.exr']);

// ── Types ─────────────────────────────────────────────────────────────

interface LocalModel {
    id: string;
    name: string;
    url: string;
    size: number;
    ext: string;
}

type ViewMode = 'drive' | 'local';
type LibraryTab = 'upload' | 'backup' | 'browse';

interface BackupPlan {
    sourceName: string;
    maxFiles: File[];
    resourceFiles: File[];
    skippedCount: number;
    totalBytes: number;
}

// ── Component ─────────────────────────────────────────────────────────

export default function ModelsTab() {
    // View mode
    const [mode, setMode] = useState<ViewMode>('drive');

    // Auth
    const { requestDriveAccess, accessToken } = useAuth();
    
    // Drive state
    const [driveLoading, setDriveLoading] = useState(false);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [isAuthError, setIsAuthError] = useState(false);

    // Local state
    const [localModels, setLocalModels] = useState<LocalModel[]>([]);
    const [activeLocal, setActiveLocal] = useState<LocalModel | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Digital Archive tab + multi-step upload
    const [libraryTab, setLibraryTab] = useState<LibraryTab>('upload');

    // Upload Form State
    const [uploadCategory, setUploadCategory] = useState('');
    const [uploadBrand, setUploadBrand] = useState('');
    const [uploadSerie, setUploadSerie] = useState('');
    const [uploadDate, setUploadDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [uploadSuffix, setUploadSuffix] = useState('');
    
    const [uploadModelFile, setUploadModelFile] = useState<File | null>(null);
    const [uploadImageFile, setUploadImageFile] = useState<File | null>(null);
    
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    // Smart Backup state
    const [backupName, setBackupName] = useState('New_Backup_Task');
    const [backupPlan, setBackupPlan] = useState<BackupPlan | null>(null);
    const [backupUploading, setBackupUploading] = useState(false);
    const [backupProgress, setBackupProgress] = useState<string | null>(null);
    const [backupError, setBackupError] = useState<string | null>(null);
    const [backupSuccess, setBackupSuccess] = useState(false);
    const [backupTargetPath, setBackupTargetPath] = useState<{ id: string; name: string }[]>([
        { id: DRIVE_FOLDER_ID, name: '3D Library' },
    ]);
    const [backupPickerOpen, setBackupPickerOpen] = useState(false);
    const [backupPickerFolders, setBackupPickerFolders] = useState<DriveFile[]>([]);
    const [backupPickerLoading, setBackupPickerLoading] = useState(false);
    const [backupPickerError, setBackupPickerError] = useState<string | null>(null);

    // Backup picker search + create-folder enhancements
    const [backupFolderSearch, setBackupFolderSearch] = useState('');
    const [creatingBackupFolder, setCreatingBackupFolder] = useState(false);
    const [newBackupFolderName, setNewBackupFolderName] = useState('');
    const [backupFolderCreating, setBackupFolderCreating] = useState(false);

    const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');


    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const [isDraggingModel, setIsDraggingModel] = useState(false);

    const modelInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const backupFolderInputRef = useRef<HTMLInputElement | null>(null);

    // ── Load Categories ──────────────────────────────────
    useEffect(() => {
        const loadCategories = async () => {
            const { data, error } = await supabase.from('threed_asset_categories').select('*').order('name');
            if (data && !error) {
                setCategories(data);
            }
        };
        loadCategories();
    }, []);

    useEffect(() => {
        const loadBackupPickerFolders = async () => {
            if (!backupPickerOpen) return;

            const token = accessToken || localStorage.getItem('dwp_access_token');
            if (!token) {
                setIsAuthError(true);
                setBackupPickerError('Google Drive access token missing. Please connect your account first.');
                return;
            }

            const current = backupTargetPath[backupTargetPath.length - 1];
            setBackupPickerLoading(true);
            setBackupPickerError(null);
            try {
                const folders = await googleDriveService.listFolders(token, current.id);
                setBackupPickerFolders(folders);
            } catch (err: any) {
                if (err?.message === 'Unauthorized') setIsAuthError(true);
                setBackupPickerError(err?.message || 'Failed to load folders.');
            } finally {
                setBackupPickerLoading(false);
            }
        };

        loadBackupPickerFolders();
    }, [backupPickerOpen, backupTargetPath, accessToken]);

    const handleAddCategory = async () => {
        const trimmed = newCategoryName.trim();
        if (!trimmed) return;

        const exists = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) {
            setUploadCategory(exists.name);
            setIsAddingCategory(false);
            return;
        }

        const { data, error } = await supabase.from('threed_asset_categories').insert({ name: trimmed }).select().single();
        if (data && !error) {
            setCategories(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
            setUploadCategory(data.name);
            setIsAddingCategory(false);
        } else {
            console.error('Failed to add category:', error);
            setUploadError("Failed to add category.");
        }
    };



    // ── Upload ───────────────────────────────────────────────
    
    // Build combined name dynamically
    const getCombinedName = () => {
        const parts = [uploadCategory, uploadBrand, uploadSerie, uploadDate, uploadSuffix]
            .map(p => p.trim())
            .filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : 'Untitled Model';
    };

    const confirmUpload = async () => {
        if (!uploadModelFile && !uploadImageFile) {
            setUploadError("Please provide at least a 3D model or an image preview.");
            return;
        }

        const token = localStorage.getItem('dwp_access_token');
        if (!token) {
            setIsAuthError(true);
            setUploadError('Google Drive access token missing. Please connect your account first.');
            return;
        }

        setUploading(true);
        setUploadError(null);
        setUploadSuccess(false);

        const baseName = getCombinedName();

        try {
            // Upload directly browser → Drive so large model files aren't buffered through the server.
            const uploadFileToDrive = async (file: File, stepName: string) => {
                const ext = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
                const finalName = `${baseName}${ext ? '.' + ext : ''}`;
                try {
                    return await googleDriveService.uploadFile(
                        token,
                        DRIVE_FOLDER_ID,
                        file,
                        finalName,
                        (pct) => setUploadProgress(`Uploading ${stepName}… ${pct}%`),
                    );
                } catch (err: any) {
                    if (err?.message === 'Unauthorized') setIsAuthError(true);
                    throw new Error(err?.message || `Failed to upload ${stepName}`);
                }
            };

            if (uploadImageFile) {
                await uploadFileToDrive(uploadImageFile, 'Preview Image');
            }

            if (uploadModelFile) {
                await uploadFileToDrive(uploadModelFile, '3D Model');
            }



            setUploadSuccess(true);
            
            // reset form out of courtesy
            setUploadCategory('');
            setUploadBrand('');
            setUploadSerie('');
            setUploadSuffix('');
            setUploadModelFile(null);
            setUploadImageFile(null);
            if (modelInputRef.current) modelInputRef.current.value = '';
            if (imageInputRef.current) imageInputRef.current.value = '';

        } catch (err: any) {
            setUploadError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            setUploadProgress(null);
        }
    };

    // ── Local file handling ─────────────────────────────────────────
    // Smart Backup: mirrors the 3ds Max batch script criteria in the browser.
    const getFileExtension = (fileName: string) => {
        const dot = fileName.lastIndexOf('.');
        return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
    };

    const getBaseName = (fileName: string) => {
        const dot = fileName.lastIndexOf('.');
        return dot === -1 ? fileName : fileName.slice(0, dot);
    };

    const getRelativePathParts = (file: File) => {
        const webkitPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = webkitPath.split('/').filter(Boolean);
        return parts.length > 1 ? parts.slice(1) : parts;
    };

    const getSourceFolderName = (files: File[]) => {
        const firstFile = files[0] as (File & { webkitRelativePath?: string }) | undefined;
        return firstFile?.webkitRelativePath?.split('/').filter(Boolean)[0] || 'Selected folder';
    };

    const getLocalDateKey = (timestamp: number) => {
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const buildBackupPlan = (files: File[]): BackupPlan => {
        const latestMaxByGroup = new Map<string, File>();
        const resourceFiles: File[] = [];

        files.forEach(file => {
            const ext = getFileExtension(file.name);
            if (ext === '.max') {
                const groupBase = getBaseName(file.name).replace(/[0-9]+$/, '');
                const groupKey = `${groupBase}|${getLocalDateKey(file.lastModified)}`;
                const current = latestMaxByGroup.get(groupKey);
                if (!current || file.lastModified > current.lastModified) {
                    latestMaxByGroup.set(groupKey, file);
                }
                return;
            }

            if (BACKUP_RESOURCE_EXTENSIONS.has(ext)) {
                resourceFiles.push(file);
            }
        });

        const maxFiles = Array.from(latestMaxByGroup.values()).sort((a, b) => a.name.localeCompare(b.name));
        const sortedResources = resourceFiles.sort((a, b) => getRelativePathParts(a).join('/').localeCompare(getRelativePathParts(b).join('/')));
        const selectedFiles = [...maxFiles, ...sortedResources];

        return {
            sourceName: getSourceFolderName(files),
            maxFiles,
            resourceFiles: sortedResources,
            skippedCount: files.length - selectedFiles.length,
            totalBytes: selectedFiles.reduce((sum, file) => sum + file.size, 0),
        };
    };

    const handleBackupFolderSelect = (files: FileList | null) => {
        const arr = files ? Array.from(files) : [];
        setBackupError(null);
        setBackupSuccess(false);
        if (!arr.length) {
            setBackupPlan(null);
            return;
        }

        const plan = buildBackupPlan(arr);
        setBackupPlan(plan);
        if (!backupName.trim() || backupName === 'New_Backup_Task') {
            setBackupName(`${plan.sourceName}_backup`);
        }
        if (backupFolderInputRef.current) backupFolderInputRef.current.value = '';
    };

    const sanitizeDriveFolderName = (name: string) => {
        return name.trim().replace(/[\\/]+/g, '-').replace(/\s+/g, ' ') || 'New_Backup_Task';
    };

    const ensureDrivePath = async (
        token: string,
        rootFolderId: string,
        pathParts: string[],
        folderCache: Map<string, string>,
    ) => {
        let currentFolderId = rootFolderId;
        let currentPath = '';

        for (const rawPart of pathParts) {
            const folderName = sanitizeDriveFolderName(rawPart);
            currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            const cached = folderCache.get(currentPath);
            if (cached) {
                currentFolderId = cached;
                continue;
            }

            const createdId = await googleDriveService.createFolder(token, currentFolderId, folderName);
            folderCache.set(currentPath, createdId);
            currentFolderId = createdId;
        }

        return currentFolderId;
    };

    const getBackupTargetLabel = () => backupTargetPath.map(part => part.name).join(' / ');

    const navigateBackupPicker = (folder: DriveFile) => {
        setBackupFolderSearch('');
        setCreatingBackupFolder(false);
        setNewBackupFolderName('');
        setBackupTargetPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    };

    const jumpBackupPicker = (index: number) => {
        setBackupFolderSearch('');
        setCreatingBackupFolder(false);
        setNewBackupFolderName('');
        setBackupTargetPath(prev => prev.slice(0, index + 1));
    };

    const handleCreateBackupFolder = async () => {
        if (!newBackupFolderName.trim()) {
            setBackupPickerError('Please enter a folder name.');
            return;
        }
        const cleaned = sanitizeDriveFolderName(newBackupFolderName);

        const token = accessToken || localStorage.getItem('dwp_access_token');
        if (!token) {
            setIsAuthError(true);
            setBackupPickerError('Google Drive access token missing. Please connect your account first.');
            return;
        }

        const current = backupTargetPath[backupTargetPath.length - 1];
        setBackupFolderCreating(true);
        setBackupPickerError(null);
        try {
            const createdId = await googleDriveService.createFolder(token, current.id, cleaned);
            setCreatingBackupFolder(false);
            setNewBackupFolderName('');
            setBackupFolderSearch('');
            setBackupTargetPath(prev => [...prev, { id: createdId, name: cleaned }]);
        } catch (err: any) {
            if (err?.message === 'Unauthorized') setIsAuthError(true);
            setBackupPickerError(err?.message || 'Failed to create folder.');
        } finally {
            setBackupFolderCreating(false);
        }
    };

    const confirmBackupUpload = async () => {
        if (!backupPlan || backupPlan.maxFiles.length + backupPlan.resourceFiles.length === 0) {
            setBackupError("No .max or resource files matched the backup criteria.");
            return;
        }

        const token = accessToken || localStorage.getItem('dwp_access_token');
        if (!token) {
            setIsAuthError(true);
            setBackupError('Google Drive access token missing. Please connect your account first.');
            return;
        }

        setBackupUploading(true);
        setBackupError(null);
        setBackupSuccess(false);

        const folderCache = new Map<string, string>();

        try {
            const rootBackupName = sanitizeDriveFolderName(backupName);
            setBackupProgress(`Creating ${rootBackupName}...`);
            const selectedTarget = backupTargetPath[backupTargetPath.length - 1];
            const backupFolderId = await googleDriveService.createFolder(token, selectedTarget.id, rootBackupName);
            setBackupProgress('Creating resource folder...');
            const resourceFolderId = await googleDriveService.createFolder(token, backupFolderId, 'resource');

            for (let i = 0; i < backupPlan.maxFiles.length; i++) {
                const file = backupPlan.maxFiles[i];
                await googleDriveService.uploadFile(
                    token,
                    backupFolderId,
                    file,
                    file.name,
                    pct => setBackupProgress(`Uploading MAX ${i + 1}/${backupPlan.maxFiles.length}: ${file.name} ${pct}%`),
                );
            }

            for (let i = 0; i < backupPlan.resourceFiles.length; i++) {
                const file = backupPlan.resourceFiles[i];
                const relativeParts = getRelativePathParts(file);
                const targetFolderId = await ensureDrivePath(token, resourceFolderId, relativeParts.slice(0, -1), folderCache);
                await googleDriveService.uploadFile(
                    token,
                    targetFolderId,
                    file,
                    file.name,
                    pct => setBackupProgress(`Uploading resource ${i + 1}/${backupPlan.resourceFiles.length}: ${file.name} ${pct}%`),
                );
            }

            setBackupSuccess(true);
            setLibraryTab('browse');
        } catch (err: any) {
            if (err?.message === 'Unauthorized') setIsAuthError(true);
            setBackupError(err?.message || 'Backup upload failed');
        } finally {
            setBackupUploading(false);
            setBackupProgress(null);
        }
    };

    const addLocalFiles = useCallback((files: FileList | File[]) => {
        const arr = Array.from(files).filter(f => {
            const ext = '.' + f.name.split('.').pop()!.toLowerCase();
            return SUPPORTED_LOCAL.includes(ext);
        });
        if (!arr.length) return;
        const entries: LocalModel[] = arr.map(f => ({
            id: crypto.randomUUID(),
            name: f.name,
            url: URL.createObjectURL(f),
            size: f.size,
            ext: f.name.split('.').pop()!.toLowerCase(),
        }));
        setLocalModels(prev => [...entries, ...prev]);
        if (!activeLocal) setActiveLocal(entries[0]);
    }, [activeLocal]);

    const removeLocal = (id: string) => {
        setLocalModels(prev => {
            const m = prev.find(x => x.id === id);
            if (m) URL.revokeObjectURL(m.url);
            return prev.filter(x => x.id !== id);
        });
        if (activeLocal?.id === id) setActiveLocal(null);
    };

    // ── Helpers ─────────────────────────────────────────────────────
    const formatSize = (b: number | null) => {
        if (!b) return '—';
        return b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB';
    };

    // ── Main render ─────────────────────────────────────────────────
    return (
        <div className="vw-pnl" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="vw-ph" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="vw-ph-t">3D Models Library</div>
                    <div className="vw-ph-s">
                        {mode === 'drive' ? 'Google Drive Asset Library' : `${localModels.length} local model${localModels.length !== 1 ? 's' : ''}`}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`vw-btn ${mode === 'drive' ? 'vw-btn-p' : 'vw-btn-g'} vw-btn-sm`} onClick={() => setMode('drive')}>3D Library (Drive)</button>
                    <button className={`vw-btn ${mode === 'local' ? 'vw-btn-p' : 'vw-btn-g'} vw-btn-sm`} onClick={() => setMode('local')}>Local Preview</button>
                    
                    {isAuthError && (
                        <button
                            onClick={() => requestDriveAccess(true)}
                            className="vw-btn vw-btn-sm"
                            style={{ background: '#eab308', color: '#000', border: 'none' }}
                        >
                            <KeyRound size={12} style={{ marginRight: 4 }} /> Connect Drive
                        </button>
                    )}
                </div>
            </div>

            {/* ── Drive Mode ──────────────────────────────────────────── */}
            {mode === 'drive' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>

                    {/* ── Header ── */}
                    <div style={{ textAlign: 'center', marginBottom: 18, paddingTop: 4 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx1)', letterSpacing: -0.5 }}>Digital Archive</div>
                        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Upload and manage 3D assets via Google Drive</div>
                    </div>

                    {/* ── Tab switcher ── */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 12, padding: 4, gap: 4, border: '1px solid var(--bdr)' }}>
                            {([
                                { id: 'upload', label: '↑ Upload Asset' },
                                { id: 'backup', label: 'Backup' },
                                { id: 'browse', label: '⊞ Browse Library' },
                            ] as const).map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setLibraryTab(tab.id)}
                                    style={{
                                        padding: '7px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
                                        fontSize: 11, fontWeight: 600, transition: 'all .15s',
                                        background: libraryTab === tab.id ? 'var(--bg1)' : 'transparent',
                                        color: libraryTab === tab.id ? 'var(--tx1)' : 'var(--tx3)',
                                        boxShadow: libraryTab === tab.id ? '0 1px 6px rgba(0,0,0,.18)' : 'none',
                                    }}
                                >{tab.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* ════════════════════════════════════════════════════
                        UPLOAD ASSET TAB
                    ════════════════════════════════════════════════════ */}
                    {libraryTab === 'upload' && (
                        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '0 16px', paddingBottom: 40 }}>
                            <div style={{
                                background: 'var(--bg2)', border: '1px solid var(--bdr)',
                                borderRadius: 16, padding: 28, minHeight: 400,
                                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                            }}>
                                
                                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--tx1)' }}>Upload New 3D Asset</div>
                                
                                {uploadSuccess && (
                                    <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', color: '#22c55e', padding: '12px', borderRadius: 8, fontSize: 12, marginBottom: 20, textAlign: 'center' }}>
                                        ✅ Successfully uploaded to Google Drive. <br/><br/>
                                        <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => { setUploadSuccess(false); setLibraryTab('browse'); }}>Browse Library →</button>
                                    </div>
                                )}

                                {uploadError && (
                                    <div style={{ background: 'rgba(220,50,50,.1)', border: '1px solid rgba(220,50,50,.3)', color: '#e55', padding: '10px', borderRadius: 8, fontSize: 11, marginBottom: 20 }}>
                                        ⚠ {uploadError}
                                        {isAuthError && (
                                             <button onClick={() => requestDriveAccess(true)} style={{ marginLeft: 10, background: '#fff', color: '#000', border: 'none', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}>Connect</button>
                                        )}
                                    </div>
                                )}

                                {/* Naming Form */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Category *</label>
                                        {isAddingCategory ? (
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input 
                                                    className="vw-fi" 
                                                    style={{ flex: 1, boxSizing: 'border-box', minWidth: 0 }} 
                                                    placeholder="New category..." 
                                                    value={newCategoryName} 
                                                    onChange={e => setNewCategoryName(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={handleAddCategory}
                                                    disabled={!newCategoryName.trim()}
                                                    className="vw-btn vw-btn-p vw-btn-sm"
                                                    style={{ padding: '0 12px' }}
                                                >
                                                    Add
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }}
                                                    className="vw-btn vw-btn-g vw-btn-sm"
                                                    style={{ padding: '0 12px' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <select 
                                                className="vw-fi" 
                                                style={{ width: '100%', boxSizing: 'border-box', appearance: 'auto', background: 'var(--bg2)', cursor: 'pointer' }}
                                                value={uploadCategory}
                                                onChange={e => {
                                                    if (e.target.value === 'ADD_NEW') {
                                                        setIsAddingCategory(true);
                                                        setNewCategoryName('');
                                                    } else {
                                                        setUploadCategory(e.target.value);
                                                    }
                                                }}
                                            >
                                                <option value="" disabled>Select a category...</option>
                                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                <option value="ADD_NEW">+ Add new category...</option>
                                            </select>
                                        )}
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Date / Year</label>
                                        <input type="date" className="vw-fi" style={{ width: '100%', boxSizing: 'border-box' }} value={uploadDate} onChange={e => setUploadDate(e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Brand (Optional)</label>
                                        <input className="vw-fi" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Minotti" value={uploadBrand} onChange={e => setUploadBrand(e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Serie (Optional)</label>
                                        <input className="vw-fi" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Creed" value={uploadSerie} onChange={e => setUploadSerie(e.target.value)} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Custom Suffix (Optional)</label>
                                        <input className="vw-fi" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. xx 001 - whatever 3D guy wants to put last" value={uploadSuffix} onChange={e => setUploadSuffix(e.target.value)} />
                                    </div>
                                </div>

                                {/* Preview Output */}
                                <div style={{ marginBottom: 24, padding: '10px 14px', background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8 }}>
                                    <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 4 }}>File Name Preview:</div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)', fontFamily: 'monospace' }}>
                                        {getCombinedName() || 'Untitled Model'} <span style={{ opacity: 0.5 }}>.obj / .jpg</span>
                                    </div>
                                </div>

                                {/* File Attachments */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                                    
                                    {/* Picture Upload */}
                                    <div 
                                        onClick={() => imageInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true); }}
                                        onDragLeave={() => setIsDraggingImage(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDraggingImage(false);
                                            if (e.dataTransfer.files?.[0]) setUploadImageFile(e.dataTransfer.files[0]);
                                        }}
                                        style={{ border: uploadImageFile || isDraggingImage ? '2px solid var(--or)' : '2px dashed var(--bdr)', borderRadius: 12, background: isDraggingImage ? 'var(--bg2)' : 'var(--bg1)', padding: 20, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
                                    >
                                        <input ref={imageInputRef} type="file" style={{ display: 'none' }} accept="image/*" onChange={e => { if (e.target.files?.[0]) setUploadImageFile(e.target.files[0]) }} />
                                        <ImageIcon size={28} className="mx-auto mb-2 text-zinc-500" style={{ color: uploadImageFile || isDraggingImage ? 'var(--or)' : 'inherit' }} />
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)' }}>Preview Icon</div>
                                        <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{uploadImageFile ? uploadImageFile.name : isDraggingImage ? 'Drop image here' : 'JPG, PNG, WebP'}</div>
                                    </div>

                                    {/* Model Upload */}
                                    <div 
                                        onClick={() => modelInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); setIsDraggingModel(true); }}
                                        onDragLeave={() => setIsDraggingModel(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDraggingModel(false);
                                            if (e.dataTransfer.files?.[0]) setUploadModelFile(e.dataTransfer.files[0]);
                                        }}
                                        style={{ border: uploadModelFile || isDraggingModel ? '2px solid var(--or)' : '2px dashed var(--bdr)', borderRadius: 12, background: isDraggingModel ? 'var(--bg2)' : 'var(--bg1)', padding: 20, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        <input ref={modelInputRef} type="file" style={{ display: 'none' }} accept=".rvt,.ifc,.dwg,.nwd,.nwc,.fbx,.obj,.glb,.gltf,.3ds,.zip,.max" onChange={e => { if (e.target.files?.[0]) setUploadModelFile(e.target.files[0]) }} />
                                        <FileBox size={28} className="mx-auto mb-2 text-zinc-500" style={{ color: uploadModelFile || isDraggingModel ? 'var(--or)' : 'inherit' }} />
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)' }}>3D Model File</div>
                                        <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{uploadModelFile ? uploadModelFile.name : isDraggingModel ? 'Drop model here' : 'OBJ, FBX, ZIP, etc.'}</div>
                                    </div>

                                </div>

                                {uploading && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: 12, background: 'rgba(50,150,255,.05)', borderRadius: 8 }}>
                                        <div style={{ fontSize: 20, animation: 'spin 1s linear infinite', display: 'inline-block', color: 'var(--or)' }}>◎</div>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)' }}>{uploadProgress}</span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--bdr)', paddingTop: 20 }}>
                                    <button
                                        className="vw-btn vw-btn-p"
                                        disabled={uploading || (!uploadImageFile && !uploadModelFile) || !uploadCategory.trim()}
                                        onClick={confirmUpload}
                                        style={{ padding: '10px 24px', opacity: (uploading || (!uploadImageFile && !uploadModelFile) || !uploadCategory.trim()) ? 0.5 : 1 }}
                                    >
                                        {uploading ? 'Uploading...' : 'Save & Upload to Drive'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════
                        BROWSE LIBRARY TAB
                    ════════════════════════════════════════════════════ */}
                    {libraryTab === 'backup' && (
                        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', padding: '0 16px 40px' }}>
                            <input
                                ref={(el) => {
                                    backupFolderInputRef.current = el;
                                    if (el) {
                                        el.setAttribute('webkitdirectory', '');
                                        el.setAttribute('directory', '');
                                    }
                                }}
                                type="file"
                                multiple
                                style={{ display: 'none' }}
                                onChange={e => handleBackupFolderSelect(e.target.files)}
                            />
                            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 16, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Archive size={18} /> Smart Backup
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>Latest daily .max files go to the backup root. Resources go under resource with folders preserved.</div>
                                    </div>
                                    <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => backupFolderInputRef.current?.click()} disabled={backupUploading} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                        <FolderOpen size={14} /> Select Folder
                                    </button>
                                </div>

                                {backupError && (
                                    <div style={{ background: 'rgba(220,50,50,.1)', border: '1px solid rgba(220,50,50,.3)', color: '#e55', padding: '10px 12px', borderRadius: 8, fontSize: 11, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <AlertCircle size={14} /> {backupError}
                                        {isAuthError && <button onClick={() => requestDriveAccess(true)} style={{ marginLeft: 'auto', background: '#fff', color: '#000', border: 'none', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}>Connect</button>}
                                    </div>
                                )}

                                {backupSuccess && (
                                    <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', color: '#22c55e', padding: '10px 12px', borderRadius: 8, fontSize: 11, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <CheckCircle2 size={14} /> Backup uploaded to the 3D Library.
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Backup Folder Name</label>
                                        <input className="vw-fi" style={{ width: '100%', boxSizing: 'border-box' }} value={backupName} onChange={e => setBackupName(e.target.value)} disabled={backupUploading} />
                                    </div>
                                    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 4 }}>Drive Target</div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getBackupTargetLabel()} / {sanitizeDriveFolderName(backupName)} / resource</div>
                                        </div>
                                        <button
                                            type="button"
                                            className="vw-btn vw-btn-g vw-btn-sm"
                                            onClick={() => setBackupPickerOpen(true)}
                                            disabled={backupUploading}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                                        >
                                            <FolderOpen size={13} /> Choose
                                        </button>
                                    </div>
                                </div>

                                <div onClick={() => !backupUploading && backupFolderInputRef.current?.click()} style={{ border: backupPlan ? '2px solid var(--or)' : '2px dashed var(--bdr)', borderRadius: 12, background: backupPlan ? 'rgba(232,115,26,.06)' : 'var(--bg1)', padding: 24, textAlign: 'center', cursor: backupUploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', marginBottom: 18 }}>
                                    <UploadCloud size={30} className="mx-auto mb-2" style={{ color: backupPlan ? 'var(--or)' : 'var(--tx3)' }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx1)' }}>{backupPlan ? backupPlan.sourceName : 'Choose a full project folder'}</div>
                                    <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>{backupPlan ? `${backupPlan.maxFiles.length + backupPlan.resourceFiles.length} matched files selected` : '.max plus jpg, png, tif, tga, vrmesh, ies, hdr, tx, exr resources'}</div>
                                </div>

                                {backupPlan && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                                        {[
                                            ['MAX', backupPlan.maxFiles.length],
                                            ['Resources', backupPlan.resourceFiles.length],
                                            ['Skipped', backupPlan.skippedCount],
                                            ['Size', formatSize(backupPlan.totalBytes)],
                                        ].map(([label, value]) => (
                                            <div key={label} style={{ background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8, padding: 12 }}>
                                                <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase' }}>{label}</div>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx1)' }}>{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {backupPlan && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                                        <div style={{ border: '1px solid var(--bdr)', borderRadius: 8, overflow: 'hidden' }}>
                                            <div style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: 'var(--tx2)', background: 'var(--bg1)' }}>Latest .max files</div>
                                            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                                                {backupPlan.maxFiles.length ? backupPlan.maxFiles.map(file => (
                                                    <div key={`${file.name}-${file.lastModified}`} style={{ padding: '6px 10px', borderTop: '1px solid var(--bdr)', fontSize: 10, color: 'var(--tx2)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                        <span style={{ color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{formatSize(file.size)}</span>
                                                    </div>
                                                )) : <div style={{ padding: 10, fontSize: 10, color: 'var(--tx3)' }}>No .max files matched.</div>}
                                            </div>
                                        </div>
                                        <div style={{ border: '1px solid var(--bdr)', borderRadius: 8, overflow: 'hidden' }}>
                                            <div style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: 'var(--tx2)', background: 'var(--bg1)' }}>Resource files</div>
                                            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                                                {backupPlan.resourceFiles.length ? backupPlan.resourceFiles.slice(0, 80).map(file => (
                                                    <div key={`${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}-${file.lastModified}`} style={{ padding: '6px 10px', borderTop: '1px solid var(--bdr)', fontSize: 10, color: 'var(--tx2)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getRelativePathParts(file).join('/')}</span>
                                                        <span style={{ color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{formatSize(file.size)}</span>
                                                    </div>
                                                )) : <div style={{ padding: 10, fontSize: 10, color: 'var(--tx3)' }}>No resource files matched.</div>}
                                                {backupPlan.resourceFiles.length > 80 && <div style={{ padding: '6px 10px', borderTop: '1px solid var(--bdr)', fontSize: 10, color: 'var(--tx3)' }}>+ {backupPlan.resourceFiles.length - 80} more</div>}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {backupUploading && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: 12, background: 'rgba(50,150,255,.05)', borderRadius: 8 }}>
                                        <div style={{ fontSize: 20, animation: 'spin 1s linear infinite', display: 'inline-block', color: 'var(--or)' }}>â—Ž</div>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)' }}>{backupProgress}</span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--bdr)', paddingTop: 20 }}>
                                    <button className="vw-btn vw-btn-g" onClick={() => { setBackupPlan(null); setBackupError(null); setBackupSuccess(false); }} disabled={backupUploading || !backupPlan} style={{ opacity: backupUploading || !backupPlan ? 0.5 : 1 }}>Clear</button>
                                    <button className="vw-btn vw-btn-p" disabled={backupUploading || !backupPlan || backupPlan.maxFiles.length + backupPlan.resourceFiles.length === 0 || !backupName.trim()} onClick={confirmBackupUpload} style={{ padding: '10px 24px', opacity: (backupUploading || !backupPlan || backupPlan.maxFiles.length + backupPlan.resourceFiles.length === 0 || !backupName.trim()) ? 0.5 : 1 }}>
                                        {backupUploading ? 'Uploading Backup...' : 'Upload Backup to Drive'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {libraryTab === 'browse' && (
                        <div style={{ flex: 1, minHeight: 0, padding: '0 20px 40px' }}>
                            {backupSuccess && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#22c55e' }}>
                                    <CheckCircle2 size={14} />
                                    <span>Backup uploaded. Refresh or open the new folder below if it is not visible yet.</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: 'var(--tx2)' }}>
                                <span style={{ fontSize: 14 }}>💡</span>
                                <span>Not seeing your files? <strong>Sign out and sign back in</strong> to refresh your Google Drive connection.</span>
                            </div>
                            <FileBrowser
                                initialFolderId={DRIVE_FOLDER_ID}
                                accessToken={accessToken}
                                rootName="3D Library"
                            />
                        </div>
                    )}

                    {backupPickerOpen && (() => {
                        const filteredBackupFolders = backupFolderSearch.trim()
                            ? backupPickerFolders.filter(f => f.name.toLowerCase().includes(backupFolderSearch.toLowerCase()))
                            : backupPickerFolders;
                        return (
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                            onClick={() => setBackupPickerOpen(false)}
                        >
                            <div
                                style={{ width: 620, maxWidth: '92vw', maxHeight: '82vh', background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <FolderOpen size={16} /> Choose Backup Location
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>Pick where the new backup folder will be created inside the 3D Library.</div>
                                    </div>
                                    <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setBackupPickerOpen(false)}>Close</button>
                                </div>

                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        className="vw-fi"
                                        placeholder="Search folders…"
                                        value={backupFolderSearch}
                                        onChange={e => setBackupFolderSearch(e.target.value)}
                                        style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}
                                    />
                                    <button
                                        type="button"
                                        className="vw-btn vw-btn-p vw-btn-sm"
                                        onClick={() => { setCreatingBackupFolder(c => !c); setNewBackupFolderName(''); setBackupPickerError(null); }}
                                        disabled={backupFolderCreating}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                                    >
                                        <span style={{ fontSize: 13, fontWeight: 800 }}>+</span> Add Folder
                                    </button>
                                </div>

                                {creatingBackupFolder && (
                                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input
                                            className="vw-fi"
                                            placeholder={`New folder inside "${backupTargetPath[backupTargetPath.length - 1].name}"…`}
                                            value={newBackupFolderName}
                                            onChange={e => setNewBackupFolderName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBackupFolder(); } if (e.key === 'Escape') { setCreatingBackupFolder(false); setNewBackupFolderName(''); } }}
                                            disabled={backupFolderCreating}
                                            autoFocus
                                            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}
                                        />
                                        <button
                                            type="button"
                                            className="vw-btn vw-btn-p vw-btn-sm"
                                            onClick={handleCreateBackupFolder}
                                            disabled={backupFolderCreating || !newBackupFolderName.trim()}
                                            style={{ padding: '0 12px' }}
                                        >
                                            {backupFolderCreating ? 'Creating…' : 'Create'}
                                        </button>
                                        <button
                                            type="button"
                                            className="vw-btn vw-btn-g vw-btn-sm"
                                            onClick={() => { setCreatingBackupFolder(false); setNewBackupFolderName(''); }}
                                            disabled={backupFolderCreating}
                                            style={{ padding: '0 12px' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}

                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
                                    {backupTargetPath.map((part, index) => (
                                        <React.Fragment key={part.id}>
                                            {index > 0 && <span style={{ color: 'var(--tx3)', fontSize: 12 }}>/</span>}
                                            <button
                                                type="button"
                                                onClick={() => jumpBackupPicker(index)}
                                                style={{ border: 'none', background: index === backupTargetPath.length - 1 ? 'var(--bg3)' : 'transparent', color: index === backupTargetPath.length - 1 ? 'var(--tx1)' : 'var(--tx3)', borderRadius: 5, padding: '3px 7px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                            >
                                                {part.name}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', minHeight: 260, padding: 10 }}>
                                    {backupPickerLoading ? (
                                        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 12 }}>Loading folders...</div>
                                    ) : backupPickerError ? (
                                        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e55', fontSize: 12, textAlign: 'center', padding: 20 }}>
                                            <div>
                                                {backupPickerError}
                                                {isAuthError && (
                                                    <div style={{ marginTop: 10 }}>
                                                        <button onClick={() => requestDriveAccess(true)} style={{ background: '#fff', color: '#000', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}>Connect</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : filteredBackupFolders.length === 0 ? (
                                        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 12 }}>
                                            {backupFolderSearch.trim() ? 'No folders match your search.' : 'No subfolders here.'}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
                                            {filteredBackupFolders.map(folder => (
                                                <button
                                                    key={folder.id}
                                                    type="button"
                                                    onClick={() => navigateBackupPicker(folder)}
                                                    style={{ border: '1px solid var(--bdr)', background: 'var(--bg2)', color: 'var(--tx1)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                                                        <FolderOpen size={15} style={{ color: 'var(--or)', flexShrink: 0 }} />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>{folder.name}</span>
                                                    </span>
                                                    <span style={{ color: 'var(--tx3)', fontSize: 15 }}>›</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div style={{ padding: 14, borderTop: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg2)' }}>
                                    <div style={{ fontSize: 10, color: 'var(--tx3)', minWidth: 0 }}>
                                        Current target: <strong style={{ color: 'var(--tx1)' }}>{getBackupTargetLabel()}</strong>
                                    </div>
                                    <button className="vw-btn vw-btn-p" onClick={() => setBackupPickerOpen(false)}>Use This Folder</button>
                                </div>
                            </div>
                        </div>
                        );
                    })()}
                </div>
            )}

            {/* ── Local Mode ────────────────────────────────────────── */}
            {mode === 'local' && (
                <>
                    <input ref={inputRef} type="file" multiple accept={SUPPORTED_LOCAL.join(',')} style={{ display: 'none' }} onChange={e => { if (e.target.files) addLocalFiles(e.target.files); e.target.value = ''; }} />

                    {localModels.length === 0 ? (
                        <div
                            style={{
                                flex: 1, border: '2px dashed var(--bdr)', borderRadius: 'var(--r)', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'border-color .2s, background .2s',
                                ...(dragOver ? { borderColor: 'var(--or)', background: 'rgba(232,115,26,.06)' } : {}),
                            }}
                            onClick={() => inputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addLocalFiles(e.dataTransfer.files); }}
                        >
                            <div style={{ fontSize: 32, opacity: .15 }}>△</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx2)' }}>Drop 3D Models Here</div>
                            <div style={{ fontSize: 10, color: 'var(--tx3)' }}>GLTF, GLB, FBX, OBJ, 3DS</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
                            <div style={{ width: 220, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {localModels.map(m => (
                                    <div key={m.id} onClick={() => setActiveLocal(m)} style={{
                                        padding: '8px 10px', borderRadius: 'var(--r)', cursor: 'pointer',
                                        border: '1px solid', borderColor: activeLocal?.id === m.id ? 'var(--or)' : 'var(--bdr)',
                                        background: activeLocal?.id === m.id ? 'rgba(232,115,26,.08)' : 'var(--bg2)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}>
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                                            <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>{m.ext.toUpperCase()} · {formatSize(m.size)}</div>
                                        </div>
                                        <button onClick={e => { e.stopPropagation(); removeLocal(m.id); }} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 14 }}>×</button>
                                    </div>
                                ))}
                                <button className="vw-btn vw-btn-g vw-btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => inputRef.current?.click()}>+ Add More</button>
                            </div>
                            <div style={{ flex: 1, minHeight: 0, borderRadius: 'var(--r)', overflow: 'hidden', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {activeLocal ? (
                                    <ModelViewer url={activeLocal.url} fileName={activeLocal.name} width="100%" height="100%" autoFrame enableManualRotation enableManualZoom enableMouseParallax={false} enableHoverRotation={false} autoRotate autoRotateSpeed={0.25} environmentPreset="studio" showScreenshotButton fadeIn />
                                ) : (
                                    <div style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, marginBottom: 6, opacity: .3 }}>△</div>
                                        Select a model from the list
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            <style jsx>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
