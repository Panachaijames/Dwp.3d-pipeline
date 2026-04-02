"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../services/supabaseClient';
import { KeyRound, FileBox, Image as ImageIcon } from 'lucide-react';
import { FileBrowser } from '../../viewers/FileBrowser';

const ModelViewer = dynamic(() => import('../../viewers/ModelViewer'), { ssr: false });

const SUPPORTED_LOCAL = ['.gltf', '.glb', '.fbx', '.obj', '.3ds'];
const DRIVE_FOLDER_ID = '12DiRer4UBvZcpsGZKd-ONAUIVahnMYEJ';

// ── Types ─────────────────────────────────────────────────────────────

interface LocalModel {
    id: string;
    name: string;
    url: string;
    size: number;
    ext: string;
}

type ViewMode = 'drive' | 'local';

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
    const [libraryTab, setLibraryTab] = useState<'upload' | 'browse'>('upload');

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

    const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');


    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const [isDraggingModel, setIsDraggingModel] = useState(false);

    const modelInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

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
            // Helper to upload single file
            const uploadFileToDrive = async (file: File, stepName: string) => {
                setUploadProgress(`Uploading ${stepName}…`);
                const ext = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
                const finalName = `${baseName}${ext ? '.' + ext : ''}`;
                const renamedFile = new File([file], finalName, { type: file.type });
                
                const fd = new FormData();
                fd.append('file', renamedFile);
                fd.append('folderId', DRIVE_FOLDER_ID);

                const res = await fetch('/api/drive/upload', { 
                    method: 'POST', 
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd 
                });
                
                if (!res.ok) {
                    if (res.status === 401) setIsAuthError(true);
                    const errData = await res.json();
                    throw new Error(errData.error || `Failed to upload ${stepName}`);
                }
                return await res.json();
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
                    {libraryTab === 'browse' && (
                        <div style={{ flex: 1, minHeight: 0, padding: '0 20px 40px' }}>
                            <FileBrowser
                                initialFolderId={DRIVE_FOLDER_ID}
                                accessToken={accessToken}
                                rootName="3D Library"
                            />
                        </div>
                    )}
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
