"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ModelViewer = dynamic(() => import('../ModelViewer'), { ssr: false });
const APSViewer = dynamic(() => import('../APSViewer'), { ssr: false });

const SUPPORTED_LOCAL = ['.gltf', '.glb', '.fbx', '.obj', '.3ds'];
const DEFAULT_HUB_ID = 'b.dbf84af6-297d-4992-8b91-60bec6e01757';

// ── Types ─────────────────────────────────────────────────────────────

interface AccItem {
    id: string;
    type: 'folder' | 'file';
    name: string;
    createTime: string;
    lastModifiedTime: string;
    size: number | null;
    fileType: string | null;
    versionUrn: string | null;
}

interface LocalModel {
    id: string;
    name: string;
    url: string;
    size: number;
    ext: string;
}

type ViewMode = 'acc' | 'local';
type TranslationStatus = 'unknown' | 'pending' | 'inprogress' | 'success' | 'failed';

// ── Component ─────────────────────────────────────────────────────────

export default function ModelsTab() {
    // View mode
    const [mode, setMode] = useState<ViewMode>('acc');

    // ACC state
    const [accItems, setAccItems] = useState<AccItem[]>([]);
    const [accLoading, setAccLoading] = useState(false);
    const [accError, setAccError] = useState<string | null>(null);
    const [accFolderId, setAccFolderId] = useState<string | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
    const [selectedUrn, setSelectedUrn] = useState<string | null>(null);
    const [translationStatus, setTranslationStatus] = useState<TranslationStatus>('unknown');
    const [translating, setTranslating] = useState(false);

    // ACC config — will be auto-discovered or set via setup
    const [hubId, setHubId] = useState<string>(DEFAULT_HUB_ID);
    const [projectId, setProjectId] = useState<string>('');
    const [setupMode, setSetupMode] = useState(false);
    const [hubs, setHubs] = useState<any[]>([]);
    const [hubsLoading, setHubsLoading] = useState(false);
    const [accSheetsInfo, setAccSheetsInfo] = useState<any>(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [hasUserToken, setHasUserToken] = useState<boolean | null>(null);

    // Local state
    const [localModels, setLocalModels] = useState<LocalModel[]>([]);
    const [activeLocal, setActiveLocal] = useState<LocalModel | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Upload-to-ACC state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    // Digital Archive tab + multi-step upload
    const [libraryTab, setLibraryTab] = useState<'upload' | 'browse'>('upload');
    const [uploadStep, setUploadStep] = useState<'DETAILS' | 'UPLOADING' | 'SUCCESS' | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadDisplayName, setUploadDisplayName] = useState('');
    const [uploadDescription, setUploadDescription] = useState('');

    // ── Load persistent ACC config ──────────────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem('dwp-acc-config');
            if (saved) {
                const cfg = JSON.parse(saved);
                if (cfg.hubId) setHubId(cfg.hubId);
                if (cfg.projectId) setProjectId(cfg.projectId);
            } else {
                // If no config, auto-discover
                setSetupMode(true);
                discoverHubs();
            }
        } catch {
            setSetupMode(true);
            discoverHubs();
        }
    }, []);

    useEffect(() => {
        if (hubId && projectId) {
            localStorage.setItem('dwp-acc-config', JSON.stringify({ hubId, projectId }));
        }
    }, [hubId, projectId]);

    // ── Auto-load ACC folder when config ready ──────────────────────
    useEffect(() => {
        if (hubId && projectId && mode === 'acc' && !accFolderId) {
            loadAccFolder();
        }
    }, [hubId, projectId, mode]);

    // ── ACC folder loading ──────────────────────────────────────────
    const loadAccFolder = async (folderId?: string, folderName?: string) => {
        setAccLoading(true);
        setAccError(null);
        try {
            let url: string;
            if (folderId) {
                url = `/api/aps/folders?projectId=${projectId}&folderId=${folderId}`;
            } else {
                // Try the known path first
                url = `/api/aps/folders?hubId=${hubId}&projectId=${projectId}&path=Project Files/3DModelAssets`;
            }
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                // Fallback to top-level folders if path not found
                if (!folderId) {
                    const topRes = await fetch(`/api/aps/folders?hubId=${hubId}&projectId=${projectId}`);
                    const topData = await topRes.json();
                    if (topRes.ok) {
                        setAccItems(topData.items || []);
                        setBreadcrumbs([{ id: 'root', name: 'Project Root' }]);
                        if (topData.folderId) setAccFolderId(topData.folderId);
                    } else {
                        throw new Error(topData.error || 'Failed to load folders');
                    }
                } else {
                    throw new Error(data.error || 'Failed to load folder');
                }
            } else {
                setAccItems(data.items || []);
                if (folderId && folderName) {
                    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
                } else if (data.folderId) {
                    setAccFolderId(data.folderId);
                    setBreadcrumbs([{ id: 'root', name: 'Project Root' }, { id: data.folderId, name: '3DModelAssets' }]);
                }
            }
        } catch (err: any) {
            setAccError(err.message || 'Unknown error');
        } finally {
            setAccLoading(false);
        }
    };

    const navigateToFolder = (item: AccItem) => {
        if (item.type !== 'folder') return;
        setAccFolderId(item.id);
        loadAccFolder(item.id, item.name);
    };

    const navigateBreadcrumb = (idx: number) => {
        const crumb = breadcrumbs[idx];
        setBreadcrumbs(prev => prev.slice(0, idx + 1));
        if (idx === 0) {
            setAccFolderId(null);
            loadAccFolder();
        } else {
            setAccFolderId(crumb.id);
            loadAccFolder(crumb.id);
        }
    };

    // ── Translation / Viewing ───────────────────────────────────────
    const viewFile = async (item: AccItem) => {
        if (!item.versionUrn) {
            setAccError('No version URN available for this file');
            return;
        }

        const base64Urn = btoa(item.versionUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

        // Check translation status first
        setTranslating(true);
        setTranslationStatus('unknown');
        try {
            const checkRes = await fetch(`/api/aps/translate?urn=${base64Urn}`);
            const checkData = await checkRes.json();

            if (checkRes.ok && checkData.status === 'success') {
                setSelectedUrn(base64Urn);
                setTranslationStatus('success');
                setTranslating(false);
                return;
            }

            // Start translation if not done
            if (!checkRes.ok || checkData.status !== 'inprogress') {
                const startRes = await fetch('/api/aps/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urn: item.versionUrn }),
                });
                if (!startRes.ok) {
                    const err = await startRes.json();
                    throw new Error(err.error || 'Translation start failed');
                }
            }

            // Poll for completion
            setTranslationStatus('inprogress');
            setSelectedUrn(base64Urn);
            pollTranslation(base64Urn);
        } catch (err: any) {
            setAccError(err.message);
            setTranslationStatus('failed');
            setTranslating(false);
        }
    };

    const pollTranslation = async (urn: string) => {
        const poll = async () => {
            try {
                const res = await fetch(`/api/aps/translate?urn=${urn}`);
                const data = await res.json();
                if (data.status === 'success') {
                    setTranslationStatus('success');
                    setTranslating(false);
                } else if (data.status === 'failed') {
                    setTranslationStatus('failed');
                    setTranslating(false);
                    setAccError('Model translation failed');
                } else {
                    setTranslationStatus('inprogress');
                    setTimeout(poll, 5000);
                }
            } catch {
                setTranslationStatus('failed');
                setTranslating(false);
            }
        };
        poll();
    };

    // ── Hub/project discovery ───────────────────────────────────────
    const [needsLogin, setNeedsLogin] = useState(false);

    const discoverHubs = async () => {
        setHubsLoading(true);
        setNeedsLogin(false);
        try {
            const res = await fetch('/api/aps/hubs');
            const data = await res.json();

            // Track token presence independently so the debug display works
            // even when subsequent calls fail.
            setHasUserToken(data.debug?.hasUserToken ?? false);

            if (data.needsLogin) {
                setNeedsLogin(true);
                return;
            }
            if (data.error) throw new Error(data.error);
            const items = data.hubs || [];

            // If no hubs returned but token IS present → Developer Hub account.
            // Fall back to listing projects directly for the known hub ID.
            if (items.length === 0 && data.debug?.hasUserToken) {
                await discoverProjectsForHub(DEFAULT_HUB_ID);
                return;
            }

            setHubs(items);
        } catch (err: any) {
            setAccError(err.message);
        } finally {
            setHubsLoading(false);
        }
    };

    const discoverProjectsForHub = async (hId: string) => {
        try {
            const res = await fetch(`/api/aps/projects?hubId=${encodeURIComponent(hId)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const projects: { id: string; name: string }[] = data.projects || [];
            // Synthesise a hub entry so the existing UI can render it
            const syntheticHub = { id: hId, name: 'DWP ACC Hub', projects };
            setHubs([syntheticHub]);
        } catch (err: any) {
            // Give a friendlier message for the common BIM360 403 case
            const raw = err.message || '';
            const isBim360Forbidden = raw.includes('403') && raw.includes('BIM360DM_ERROR');
            const friendlyMsg = isBim360Forbidden
                ? 'Access denied (403). The APS app must be added as a Custom Integration in the BIM360/ACC Admin Console (Account Admin → Apps → Custom Integrations). After adding it, log out and reconnect your Autodesk account.'
                : `Could not load projects for hub: ${raw}`;
            setAccError(friendlyMsg);
        } finally {
            setHubsLoading(false);
        }
    };

    // ── Upload to ACC ───────────────────────────────────────────────
    // Step 1: open the naming modal
    const openUploadModal = (files: FileList | File[]) => {
        const file = Array.from(files)[0];
        if (!file) return;
        if (!accFolderId) { setUploadError('Navigate into a folder first before uploading.'); return; }
        const ext = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
        const nameWithoutExt = ext ? file.name.slice(0, -(ext.length + 1)) : file.name;
        setUploadFile(file);
        setUploadDisplayName(nameWithoutExt);
        setUploadDescription('');
        setUploadStep('DETAILS');
        setUploadError(null);
    };

    // Step 2: actually upload (called from modal)
    const confirmUpload = async () => {
        if (!uploadFile || !projectId || !accFolderId) return;
        const ext = uploadFile.name.includes('.') ? uploadFile.name.split('.').pop() || '' : '';
        const finalName = uploadDisplayName.trim()
            ? `${uploadDisplayName.trim()}${ext ? '.' + ext : ''}`
            : uploadFile.name;

        setUploadStep('UPLOADING');
        setUploading(true);
        setUploadError(null);
        setUploadProgress(`Uploading ${finalName}…`);

        try {
            const renamedFile = new File([uploadFile], finalName, { type: uploadFile.type });
            const fd = new FormData();
            fd.append('file', renamedFile);
            fd.append('projectId', projectId);
            fd.append('folderId', accFolderId);

            const res = await fetch('/api/aps/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');

            setUploadProgress('Refreshing folder…');
            await loadAccFolder(accFolderId);

            if (data.versionUrn) {
                setUploadProgress('Starting translation…');
                const base64Urn = btoa(data.versionUrn)
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
                await fetch('/api/aps/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urn: data.versionUrn }),
                }).catch(() => null);
                setSelectedUrn(base64Urn);
                setTranslationStatus('inprogress');
                setTranslating(true);
                pollTranslation(base64Urn);
            }

            setUploadProgress(null);
            setUploadStep('SUCCESS');
        } catch (err: any) {
            setUploadError(err.message || 'Upload failed');
            setUploadStep('DETAILS');
            setUploadProgress(null);
        } finally {
            setUploading(false);
            if (uploadInputRef.current) uploadInputRef.current.value = '';
        }
    };

    const syncToAcc = async () => {
        if (!projectId) return;
        setSyncLoading(true);
        try {
            const res = await fetch(`/api/aps/acc-sheets?projectId=${encodeURIComponent(projectId)}`);
            const data = await res.json();
            setAccSheetsInfo(data);
        } catch (err: any) {
            setAccSheetsInfo({ status: 'error', reason: err.message, fetchedAt: new Date().toISOString() });
        } finally {
            setSyncLoading(false);
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

    const formatDate = (d: string | null) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    const getToken = async () => {
        const res = await fetch('/api/aps/token');
        const data = await res.json();
        return data.access_token;
    };

    // ── No config setup screen ──────────────────────────────────────
    const renderSetup = () => (
        <div className="vw-pnl">
            <div className="vw-ph">
                <div className="vw-ph-t">Connect to ACC</div>
                <div className="vw-ph-s">Link your Autodesk Construction Cloud project</div>
            </div>
            <div className="vw-cd" style={{ padding: 18, maxWidth: 500 }}>
                {needsLogin ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--tx2)' }}>
                            To access a <b>Developer Hub</b> or <b>Trial Account</b>, you must log in with your Autodesk ID.
                        </div>
                        <button
                            className="vw-btn vw-btn-p"
                            onClick={() => window.location.href = '/api/aps/auth/login'}
                        >
                            Connect Autodesk Account
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: 12 }}>
                            <button
                                className="vw-btn vw-btn-p vw-btn-sm"
                                onClick={() => { discoverHubs(); setSetupMode(true); }}
                                disabled={hubsLoading}
                            >
                                {hubsLoading ? 'Discovering...' : 'Discover Hubs & Projects'}
                            </button>
                        </div>

                        {setupMode && hubs.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {hubs.map(hub => (
                                    <div key={hub.id} className="vw-cd" style={{ padding: 10 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{hub.name}</div>
                                        <div className="vw-mono" style={{ fontSize: 8, color: 'var(--tx3)', marginBottom: 6 }}>{hub.id}</div>
                                        {hub.projects?.map((p: any) => (
                                            <div
                                                key={p.id}
                                                onClick={() => { setHubId(hub.id); setProjectId(p.id); setSetupMode(false); }}
                                                style={{
                                                    padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer',
                                                    border: '1px solid var(--bdr)', marginBottom: 3, fontSize: 10,
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                }}
                                                className="vw-ri"
                                            >
                                                <span>{p.name}</span>
                                                <span className="vw-mono" style={{ fontSize: 8, color: 'var(--tx3)' }}>Select →</span>
                                            </div>
                                        ))}
                                        {hub.error && <div style={{ fontSize: 9, color: 'var(--rd)' }}>{hub.error}</div>}
                                    </div>
                                ))}
                            </div>
                        )}

                        {setupMode && hubs.length === 0 && !hubsLoading && (
                            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: 10 }}>
                                <div style={{ marginBottom: 8 }}>No hubs found via default connection.</div>
                                <button
                                    className="vw-btn vw-btn-p vw-btn-sm"
                                    onClick={() => window.location.href = '/api/aps/auth/login'}
                                >
                                    Connect Autodesk Account (3-Legged)
                                </button>
                                <div style={{ marginTop: 6, fontSize: 9, opacity: 0.7 }}>
                                    Required for Developer Hubs and Trial Accounts
                                </div>
                                {(accError || hubs.length === 0) && (
                                    <div style={{ marginTop: 10, padding: 5, background: '#333', borderRadius: 4, fontFamily: 'monospace', fontSize: 8, color: '#aaa' }}>
                                        Debug: {accError || 'No hubs returned'} <br />
                                        Token: {hasUserToken === null ? 'Unknown' : hasUserToken ? '✅ Present' : '❌ Missing'}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ marginTop: 16, borderTop: '1px solid var(--bdr)', paddingTop: 12 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 6 }}>Or enter manually:</div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                <input className="vw-fi" placeholder="Hub ID (b.xxx...)" value={hubId} onChange={e => setHubId(e.target.value)} style={{ flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input className="vw-fi" placeholder="Project ID (b.xxx...)" value={projectId} onChange={e => setProjectId(e.target.value)} style={{ flex: 1 }} />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    // ── Main render ─────────────────────────────────────────────────
    return (
        <div className="vw-pnl" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="vw-ph" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="vw-ph-t">3D Models</div>
                    <div className="vw-ph-s">
                        {mode === 'acc' ? 'ACC: 99-0100 Visualization' : `${localModels.length} local model${localModels.length !== 1 ? 's' : ''}`}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button className={`vw-btn ${mode === 'acc' ? 'vw-btn-p' : 'vw-btn-g'} vw-btn-sm`} onClick={() => setMode('acc')}>ACC Library</button>
                    <button className={`vw-btn ${mode === 'local' ? 'vw-btn-p' : 'vw-btn-g'} vw-btn-sm`} onClick={() => setMode('local')}>Local Upload</button>
                    {mode === 'acc' && hubId && projectId && (
                        <button className="vw-btn vw-btn-g vw-btn-sm" onClick={syncToAcc} disabled={syncLoading} title="Sync with ACC Sheets">
                            {syncLoading ? '…' : '↻'} Sync
                        </button>
                    )}
                    {mode === 'acc' && accSheetsInfo?.openUrl && (
                        <a href={accSheetsInfo.openUrl} target="_blank" rel="noopener noreferrer" className="vw-btn vw-btn-g vw-btn-sm" style={{ textDecoration: 'none' }}>Sheets ↗</a>
                    )}
                    {mode === 'acc' && hubId && projectId && accFolderId && (
                        <button
                            className="vw-btn vw-btn-p vw-btn-sm"
                            onClick={() => uploadInputRef.current?.click()}
                            disabled={uploading}
                            title="Upload 3D model to this ACC folder"
                        >
                            {uploading ? '⏳' : '↑'} Upload
                        </button>
                    )}
                    {mode === 'acc' && <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => { setHubId(DEFAULT_HUB_ID); setProjectId(''); setAccFolderId(null); setAccItems([]); setBreadcrumbs([]); setAccSheetsInfo(null); }} title="Reconfigure ACC">⚙</button>}
                </div>
            </div>

            {accError && (
                <div style={{ background: 'rgba(200,50,50,.1)', border: '1px solid rgba(200,50,50,.3)', color: '#c33', padding: '6px 10px', borderRadius: 'var(--r)', fontSize: 10, marginBottom: 8 }}>
                    {accError}
                    <button onClick={() => setAccError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#c33', fontWeight: 700 }}>×</button>
                </div>
            )}

            {/* Upload error */}
            {uploadError && (
                <div style={{ background: 'rgba(200,50,50,.1)', border: '1px solid rgba(200,50,50,.3)', color: '#c33', padding: '6px 10px', borderRadius: 'var(--r)', fontSize: 10, marginBottom: 8 }}>
                    ↑ Upload error: {uploadError}
                    <button onClick={() => setUploadError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#c33', fontWeight: 700 }}>×</button>
                </div>
            )}

            {/* Upload progress */}
            {uploadProgress && (
                <div style={{ background: 'rgba(50,150,255,.08)', border: '1px solid rgba(50,150,255,.25)', color: 'var(--tx2)', padding: '6px 10px', borderRadius: 'var(--r)', fontSize: 10, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◎</span>
                    {uploadProgress}
                </div>
            )}

            {accSheetsInfo && mode === 'acc' && (
                <div style={{
                    padding: '6px 10px',
                    background: accSheetsInfo.status === 'ok' ? 'rgba(50,180,50,.08)' : 'rgba(200,100,50,.08)',
                    border: `1px solid ${accSheetsInfo.status === 'ok' ? 'rgba(50,180,50,.25)' : 'rgba(200,100,50,.25)'}`,
                    borderRadius: 'var(--r)', fontSize: 10, marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    {accSheetsInfo.status === 'ok' ? (
                        <>
                            <span>📋 Latest: <b>{accSheetsInfo.latest?.name}</b>
                                {accSheetsInfo.latest?.publishedAt && (
                                    <span style={{ color: 'var(--tx3)', marginLeft: 6 }}>
                                        {new Date(accSheetsInfo.latest.publishedAt).toLocaleDateString('en-GB')}
                                    </span>
                                )}
                            </span>
                            <span style={{ color: 'var(--tx3)', fontSize: 9 }}>Synced {new Date(accSheetsInfo.fetchedAt).toLocaleTimeString()}</span>
                        </>
                    ) : (
                        <span style={{ color: 'var(--tx3)' }}>ACC Sheets: {accSheetsInfo.reason || accSheetsInfo.status}</span>
                    )}
                </div>
            )}


            {/* ── ACC Mode ──────────────────────────────────────────── */}
            {mode === 'acc' && (!hubId || !projectId) && renderSetup()}

            {mode === 'acc' && hubId && projectId && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>

                    {/* ── Header ── */}
                    <div style={{ textAlign: 'center', marginBottom: 18, paddingTop: 4 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx1)', letterSpacing: -0.5 }}>Digital Archive</div>
                        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Upload and manage 3D assets for the organization</div>
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
                        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '0 16px' }}>

                            {/* Stepper */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
                                {([
                                    { label: 'Select Model' },
                                    { label: 'Name & Details' },
                                    { label: 'Upload' },
                                ] as const).map((s, idx) => {
                                    const stepOrder = [null, 'DETAILS', 'UPLOADING', 'SUCCESS'] as const;
                                    const ci = stepOrder.indexOf(uploadStep as any);
                                    const done = uploadStep === 'SUCCESS' ? idx < 3 : ci > idx;
                                    const active = uploadStep === 'SUCCESS' ? idx === 2 : ci === idx;
                                    return (
                                        <React.Fragment key={idx}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 14px', borderRadius: 999, border: '2px solid',
                                                borderColor: done ? '#22c55e' : active ? 'var(--or)' : 'var(--bdr)',
                                                background: done ? 'rgba(34,197,94,.08)' : active ? 'rgba(232,115,26,.08)' : 'transparent',
                                                transition: 'all .2s',
                                            }}>
                                                <div style={{
                                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                    background: done ? '#22c55e' : active ? 'var(--or)' : 'var(--bg3)',
                                                    color: done || active ? '#fff' : 'var(--tx3)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 10, fontWeight: 700,
                                                }}>{done ? '✓' : idx + 1}</div>
                                                <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? 'var(--tx1)' : 'var(--tx3)' }}>{s.label}</span>
                                            </div>
                                            {idx < 2 && <div style={{ width: 28, height: 1, background: 'var(--bdr)' }} />}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* Step content card */}
                            <div style={{
                                background: 'var(--bg2)', border: '1px solid var(--bdr)',
                                borderRadius: 16, padding: 28, minHeight: 300,
                                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                            }}>

                                {/* ── Step 1: Select Model ── */}
                                {!uploadStep && (
                                    <div>
                                        <div
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) openUploadModal(e.dataTransfer.files); }}
                                            onClick={() => uploadInputRef.current?.click()}
                                            style={{
                                                border: '2px dashed var(--bdr)', borderRadius: 12,
                                                background: 'var(--bg1)', display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center', gap: 12,
                                                padding: 40, cursor: 'pointer', transition: 'all .2s', minHeight: 220,
                                            }}
                                        >
                                            <div style={{
                                                width: 72, height: 72, borderRadius: '50%',
                                                background: 'var(--bg2)', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', fontSize: 32, border: '1px solid var(--bdr)',
                                            }}>⬡</div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx1)', marginBottom: 4 }}>3D Model Asset</div>
                                                <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1 }}>Drag, Click, or Drop</div>
                                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                                                    {['RVT', 'IFC', 'DWG', 'NWD', 'OBJ', 'FBX', 'ZIP'].map(ext => (
                                                        <span key={ext} style={{
                                                            padding: '2px 7px', background: 'var(--bg2)', border: '1px solid var(--bdr)',
                                                            borderRadius: 4, fontSize: 9, fontWeight: 700, color: 'var(--tx3)',
                                                        }}>{ext}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <input
                                            ref={uploadInputRef}
                                            type="file"
                                            style={{ display: 'none' }}
                                            accept=".rvt,.ifc,.dwg,.nwd,.nwc,.fbx,.obj,.glb,.gltf,.3ds,.zip"
                                            onChange={e => { if (e.target.files?.length) openUploadModal(e.target.files); }}
                                        />
                                        {!accFolderId && (
                                            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--tx3)', textAlign: 'center' }}>
                                                ⚠ Go to <b>Browse Library</b> and navigate into a folder first
                                            </div>
                                        )}
                                        {uploadError && (
                                            <div style={{ marginTop: 10, fontSize: 10, color: '#e55', background: 'rgba(220,50,50,.08)', border: '1px solid rgba(220,50,50,.2)', borderRadius: 8, padding: '7px 12px' }}>
                                                ⚠ {uploadError}
                                            </div>
                                        )}
                                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                className="vw-btn vw-btn-p"
                                                style={{ opacity: .5, cursor: 'default' }}
                                                disabled
                                            >Next Step →</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Step 2: Name & Details ── */}
                                {uploadStep === 'DETAILS' && (
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--tx1)' }}>Name your model</div>
                                        {uploadFile && (
                                            <div style={{
                                                fontSize: 10, color: 'var(--tx3)', marginBottom: 14,
                                                padding: '7px 12px', background: 'var(--bg1)',
                                                borderRadius: 8, border: '1px solid var(--bdr)',
                                                display: 'flex', alignItems: 'center', gap: 8,
                                            }}>
                                                <span style={{ fontSize: 18 }}>📄</span>
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadFile.name}</span>
                                                <span style={{ flexShrink: 0, fontWeight: 600 }}>{formatSize(uploadFile.size)}</span>
                                            </div>
                                        )}
                                        {uploadError && (
                                            <div style={{ fontSize: 10, color: '#e55', background: 'rgba(220,50,50,.08)', border: '1px solid rgba(220,50,50,.2)', borderRadius: 8, padding: '7px 12px', marginBottom: 12 }}>
                                                ⚠ {uploadError}
                                            </div>
                                        )}
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>Display Name *</label>
                                        <input
                                            className="vw-fi"
                                            style={{ width: '100%', marginBottom: 14, boxSizing: 'border-box', fontSize: 13 }}
                                            value={uploadDisplayName}
                                            onChange={e => setUploadDisplayName(e.target.value)}
                                            placeholder="e.g. Level 3 Structural Model"
                                            autoFocus
                                            onKeyDown={e => { if (e.key === 'Enter' && uploadDisplayName.trim()) confirmUpload(); }}
                                        />
                                        <label style={{ fontSize: 10, color: 'var(--tx3)', display: 'block', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>Description (optional)</label>
                                        <textarea
                                            className="vw-fi"
                                            style={{ width: '100%', minHeight: 72, resize: 'vertical', marginBottom: 20, boxSizing: 'border-box' }}
                                            value={uploadDescription}
                                            onChange={e => setUploadDescription(e.target.value)}
                                            placeholder="e.g. Revit model for structural review, Level 3"
                                        />
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                                            <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setUploadStep(null)}>← Back</button>
                                            <button
                                                className="vw-btn vw-btn-p"
                                                disabled={!uploadDisplayName.trim()}
                                                onClick={confirmUpload}
                                                style={{ opacity: uploadDisplayName.trim() ? 1 : .4 }}
                                            >↑ Upload to ACC</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Step 3: Uploading ── */}
                                {uploadStep === 'UPLOADING' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: 12 }}>
                                        <div style={{ fontSize: 44, animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>◎</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)' }}>{uploadProgress || 'Uploading…'}</div>
                                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Please wait — do not close this window</div>
                                    </div>
                                )}

                                {/* ── Step 4: Success ── */}
                                {uploadStep === 'SUCCESS' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: 12, textAlign: 'center' }}>
                                        <div style={{ fontSize: 52 }}>✅</div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx1)' }}>Upload Complete!</div>
                                        <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6, maxWidth: 320 }}>
                                            <b>{uploadDisplayName}</b> has been uploaded to ACC.<br />Translation has started — the viewer will load automatically.
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button className="vw-btn vw-btn-g vw-btn-sm" onClick={() => setUploadStep(null)}>Upload Another</button>
                                            <button className="vw-btn vw-btn-p vw-btn-sm" onClick={() => { setUploadStep(null); setLibraryTab('browse'); }}>Browse Library →</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════
                        BROWSE LIBRARY TAB
                    ════════════════════════════════════════════════════ */}
                    {libraryTab === 'browse' && (
                        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
                            {/* File list */}
                            <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                                {/* Breadcrumbs */}
                                {breadcrumbs.length > 0 && (
                                    <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                                        {breadcrumbs.map((bc, i) => (
                                            <React.Fragment key={bc.id}>
                                                <span
                                                    onClick={() => navigateBreadcrumb(i)}
                                                    style={{ fontSize: 9, color: i === breadcrumbs.length - 1 ? 'var(--tx1)' : 'var(--or)', cursor: 'pointer', fontWeight: i === breadcrumbs.length - 1 ? 600 : 400 }}
                                                >{bc.name}</span>
                                                {i < breadcrumbs.length - 1 && <span style={{ fontSize: 8, color: 'var(--tx3)' }}>/</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}

                                {accLoading && <div style={{ padding: 20, textAlign: 'center', fontSize: 10, color: 'var(--tx3)' }}>Loading…</div>}
                                {!accLoading && accItems.length === 0 && (
                                    <div style={{ padding: 20, textAlign: 'center', fontSize: 10, color: 'var(--tx3)' }}>No items in this folder</div>
                                )}

                                {!accLoading && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, paddingBottom: 4 }}>
                                        {accItems.map(item => {
                                            const isSelected = !!(selectedUrn && item.versionUrn &&
                                                btoa(item.versionUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') === selectedUrn);
                                            const ext = (item.fileType || item.name.split('.').pop() || '').toUpperCase();
                                            const isFolder = item.type === 'folder';
                                            return (
                                                <div
                                                    key={item.id}
                                                    onClick={() => isFolder ? navigateToFolder(item) : viewFile(item)}
                                                    style={{
                                                        borderRadius: 'var(--r)',
                                                        border: `1px solid ${isSelected ? 'var(--or)' : 'var(--bdr)'}`,
                                                        background: isSelected ? 'rgba(232,115,26,.08)' : 'var(--bg2)',
                                                        cursor: 'pointer', transition: 'all .15s',
                                                        overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                                    }}
                                                >
                                                    <div style={{
                                                        height: 72,
                                                        background: isFolder
                                                            ? 'linear-gradient(135deg,rgba(232,115,26,.12),rgba(232,115,26,.04))'
                                                            : 'linear-gradient(135deg,rgba(60,120,220,.1),rgba(60,120,220,.03))',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 28, position: 'relative',
                                                    }}>
                                                        <span style={{ opacity: .7 }}>{isFolder ? '📁' : '⬡'}</span>
                                                        {!isFolder && ext && (
                                                            <span style={{
                                                                position: 'absolute', bottom: 4, right: 4,
                                                                fontSize: 7, fontWeight: 700,
                                                                background: isSelected ? 'var(--or)' : 'rgba(60,120,220,.7)',
                                                                color: '#fff', padding: '1px 4px', borderRadius: 3, letterSpacing: .5,
                                                            }}>{ext}</span>
                                                        )}
                                                    </div>
                                                    <div style={{ padding: '5px 7px' }}>
                                                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.name}
                                                        </div>
                                                        <div style={{ fontSize: 8, color: 'var(--tx3)', marginTop: 1 }}>
                                                            {isFolder ? 'Folder' : formatSize(item.size)} · {formatDate(item.lastModifiedTime)}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <button className="vw-btn vw-btn-g vw-btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => { setAccItems([]); loadAccFolder(accFolderId || undefined); }}>↻ Refresh</button>
                            </div>

                            {/* Viewer area */}
                            <div style={{ flex: 1, minHeight: 0, borderRadius: 'var(--r)', overflow: 'hidden', background: '#f5f5f5', position: 'relative' }}>
                                {selectedUrn && translationStatus === 'success' ? (
                                    <APSViewer urn={selectedUrn} getToken={getToken} />
                                ) : selectedUrn && (translationStatus === 'inprogress' || translating) ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                                        <div style={{ fontSize: 28, opacity: .2, animation: 'spin 2s linear infinite' }}>◎</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Translating Model…</div>
                                        <div style={{ fontSize: 10, color: '#999' }}>This can take 1–5 minutes for large files. The viewer will load automatically.</div>
                                    </div>
                                ) : selectedUrn && translationStatus === 'failed' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                                        <div style={{ fontSize: 28, opacity: .3 }}>⚠</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#c33' }}>Translation Failed</div>
                                        <div style={{ fontSize: 10, color: '#999' }}>The model could not be converted for web viewing.</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 12 }}>
                                        <div style={{ fontSize: 28, marginBottom: 6, opacity: .2 }}>△</div>
                                        Select a file to preview in 3D
                                    </div>
                                )}
                            </div>
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
