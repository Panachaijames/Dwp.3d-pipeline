"use client";
// Material Board studio — standalone board generation without Prompt Gen.
// Flow: upload a reference image → Gemini derives a Material Inventory →
// (editable) → generate the 5 style boards via /api/imagen, optionally
// compositing the uploaded image's chair/plant in the two-pass nano-banana flow.
//
// Mounted per-project via a `key` in BoardsApp, so `sessionKey` is stable for
// the life of an instance and a project switch remounts (aborting in-flight
// work). Kept mounted across tab switches so a running generation is not lost;
// `active` gates the window paste listener so only the visible studio consumes.

import React, { useEffect, useRef, useState } from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { VizProject } from '../VizWorkflow/constants';
import {
    MBBoardEntry,
    MBTargetModel,
    compressImage,
    deriveInventoryFromImage,
    generateMaterialBoards,
} from './materialBoardCore';
import TaggableImage from './TaggableImage';

interface Props {
    proj: VizProject | null;
    active?: boolean;
    onCanvasEdit: (src: string, title: string) => void;
    onFullscreen: (src: string) => void;
}

interface SavedSession {
    sourceImage: string | null;
    sourceName: string | null;
    inventory: string;
    boards: MBBoardEntry[];
}

export default function MaterialBoardStudio({ proj, active = true, onCanvasEdit, onFullscreen }: Props) {
    const projKey = proj?.id || 'standalone';
    const sessionKey = `dwp_boards_mb_${projKey}`;

    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [sourceName, setSourceName] = useState<string | null>(null);
    const [deriving, setDeriving] = useState(false);
    const [deriveError, setDeriveError] = useState<string | null>(null);
    const [inventory, setInventory] = useState('');
    const [useReference, setUseReference] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [boards, setBoards] = useState<MBBoardEntry[]>([]);
    const [boardsError, setBoardsError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const loadedForKeyRef = useRef<string | null>(null);
    // Monotonic guard so only the most recent derivation may write inventory —
    // out-of-order or superseded derives are ignored.
    const deriveSeqRef = useRef(0);

    // Restore the last session for this project
    useEffect(() => {
        let alive = true;
        loadedForKeyRef.current = null;
        deriveSeqRef.current++; // cancel any derive still in flight from a prior key
        idbGet(sessionKey).then((saved: SavedSession | undefined) => {
            if (!alive) return;
            setSourceImage(saved?.sourceImage ?? null);
            setSourceName(saved?.sourceName ?? null);
            setInventory(saved?.inventory ?? '');
            setBoards(Array.isArray(saved?.boards) ? saved!.boards : []);
            loadedForKeyRef.current = sessionKey;
        }).catch(() => {
            // On a failed restore, present an empty session (never leave the
            // previous project's state on screen to be persisted under this key).
            if (!alive) return;
            setSourceImage(null);
            setSourceName(null);
            setInventory('');
            setBoards([]);
            loadedForKeyRef.current = sessionKey;
        });
        return () => { alive = false; };
    }, [sessionKey]);

    // Persist the session, debounced (skip until the restore for this key has
    // finished so we never write empty/stale state over a saved session).
    useEffect(() => {
        if (loadedForKeyRef.current !== sessionKey) return;
        const t = setTimeout(() => {
            const session: SavedSession = { sourceImage, sourceName, inventory, boards };
            void idbSet(sessionKey, session).catch((e) => console.warn('[Boards] session save failed:', e));
        }, 500);
        return () => clearTimeout(t);
    }, [sessionKey, sourceImage, sourceName, inventory, boards]);

    const acceptImage = async (dataUrl: string, name: string) => {
        const seq = ++deriveSeqRef.current;
        const compressed = await compressImage(dataUrl);
        if (seq !== deriveSeqRef.current) return; // superseded by a newer image
        setSourceImage(compressed);
        setSourceName(name);
        setDeriveError(null);
        setDeriving(true);
        // Auto-derive the inventory from the new image
        try {
            const inv = await deriveInventoryFromImage(compressed);
            if (seq !== deriveSeqRef.current) return;
            setInventory(inv);
        } catch (err: any) {
            if (seq !== deriveSeqRef.current) return;
            setDeriveError(err?.message || 'Material analysis failed');
        }
        if (seq === deriveSeqRef.current) setDeriving(false);
    };

    const handleFile = (file: File | null | undefined) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = ev => { void acceptImage(String(ev.target?.result), file.name); };
        reader.readAsDataURL(file);
    };

    // Paste support — only the active (visible) studio consumes the paste
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (!active) return;
            // Never hijack Ctrl+V while the fullscreen tag editor is open — pasting
            // there duplicates tags; accepting the clipboard image here would even
            // replace the source image and re-derive the inventory.
            if (document.querySelector('.bs-tagx')) return;
            const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
            if (item) handleFile(item.getAsFile());
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const reDerive = async () => {
        if (!sourceImage || deriving) return;
        const seq = ++deriveSeqRef.current;
        setDeriving(true);
        setDeriveError(null);
        try {
            const inv = await deriveInventoryFromImage(sourceImage);
            if (seq !== deriveSeqRef.current) return;
            setInventory(inv);
        } catch (err: any) {
            if (seq !== deriveSeqRef.current) return;
            setDeriveError(err?.message || 'Material analysis failed');
        }
        if (seq === deriveSeqRef.current) setDeriving(false);
    };

    const generate = async (targetModel: MBTargetModel) => {
        if (generating || !inventory.trim()) return;
        setGenerating(true);
        setBoardsError(null);
        // Keep the previous boards (and their persisted session) until this run
        // produces at least one real image, so a failed/interrupted regeneration
        // never destroys the saved boards.
        try {
            const result = await generateMaterialBoards({
                projectName: proj?.name || 'Boards Studio',
                inventory,
                targetModel,
                referenceImage: useReference && targetModel === 'nano-banana' ? sourceImage : null,
                onProgress: (current, total) => setProgress({ current, total }),
                onBoard: (all) => { if (all.some(b => b.src)) setBoards(all); },
            });
            if (result.boards.some(b => b.src)) setBoards(result.boards);
            if (result.error) setBoardsError(result.error);
        } catch (err: any) {
            setBoardsError(err?.message || 'Board generation failed');
        }
        setGenerating(false);
        setProgress(null);
    };

    const clearAll = () => {
        deriveSeqRef.current++; // ignore any derive still in flight
        setSourceImage(null);
        setSourceName(null);
        setInventory('');
        setBoards([]);
        setDeriveError(null);
        setBoardsError(null);
        setDeriving(false);
    };

    return (
        <div className="bs-split">
            {/* LEFT — input */}
            <div className="bs-input">
                <div className="bs-sec-title">Reference image</div>
                <div
                    className="bs-drop"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                >
                    {sourceImage ? (
                        <img src={sourceImage} alt={sourceName || 'Reference'} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6, display: 'block', margin: '0 auto' }} />
                    ) : (
                        <div className="bs-drop-hint">
                            <div style={{ fontSize: 22 }}>▦</div>
                            <div>Click, drag, or paste an interior render / mood image / material board</div>
                            <div style={{ fontSize: 9, color: 'var(--tx3)' }}>Gemini reads the materials out of it — no prompt needed</div>
                        </div>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
                {sourceName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--tx3)' }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceName}</span>
                        <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={reDerive} disabled={deriving}>↻ Re-analyze</button>
                        <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={clearAll}>✕ Clear</button>
                    </div>
                )}

                <div className="bs-sec-title" style={{ marginTop: 14 }}>
                    Material inventory
                    {deriving && <span style={{ marginLeft: 8, color: 'var(--or)', fontWeight: 600 }}>analysing…</span>}
                </div>
                {deriveError && <div className="bs-err">{deriveError}</div>}
                <textarea
                    className="vw-fi bs-inventory"
                    placeholder={'Materials for the board — derived automatically from the image, or paste/type your own. One material per line:\n- FLUTED GOLDEN TEAK — reeded; warm honey tone; wood\n- WHITE MACAUBAS QUARTZITE — honed; cool white with grey veining; stone'}
                    value={inventory}
                    onChange={e => setInventory(e.target.value)}
                    disabled={deriving}
                />

                <label className="bs-check" title="Nano Banana only: lift the chair + plant out of your uploaded image and composite them onto the Classic Flat-Lay board">
                    <input type="checkbox" checked={useReference} onChange={e => setUseReference(e.target.checked)} disabled={!sourceImage} />
                    Use uploaded image as furniture reference (chair + plant composite)
                </label>

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="vw-btn vw-btn-p" onClick={() => generate('nano-banana')} disabled={generating || deriving || !inventory.trim()}>
                        {generating ? `Generating ${progress ? `${progress.current}/${progress.total}` : '…'}` : '▦ Generate 5 Boards · Nano Banana'}
                    </button>
                    <button className="vw-btn" onClick={() => generate('imagen-4')} disabled={generating || deriving || !inventory.trim()}>
                        {generating ? '…' : 'Imagen 4'}
                    </button>
                </div>
                {boardsError && <div className="bs-err" style={{ marginTop: 8 }}>{boardsError}</div>}
            </div>

            {/* RIGHT — boards */}
            <div className="bs-output">
                {boards.length === 0 && !generating ? (
                    <div className="bs-empty">
                        <div style={{ fontSize: 26 }}>▦</div>
                        <div>Generated material boards appear here</div>
                        <div style={{ fontSize: 10, color: 'var(--tx3)', maxWidth: 360, textAlign: 'center' }}>
                            5 style variations per run — Classic Flat-Lay, Dark Moody, Industrial Refined, Minimalist Nordic, Terrazzo Eclectic. Tag, upscale, export, or split any board in the canvas editor.
                        </div>
                    </div>
                ) : (
                    <div className="bs-grid">
                        {boards.map((entry, i) => (
                            <div key={`${entry.styleName}-${entry.src?.slice(-40) ?? i}`} className="bs-card">
                                <div className="bs-card-hd">
                                    <span>{entry.styleName}</span>
                                    {entry.status === 'empty-fallback' && <span className="bs-warn" title={entry.warning}>empty board fallback</span>}
                                    {entry.status === 'failed' && <span className="bs-fail" title={entry.warning}>failed</span>}
                                </div>
                                {entry.src ? (
                                    <TaggableImage
                                        src={entry.src}
                                        altText={`Material Board — ${entry.styleName}`}
                                        downloadName={`Boards-MaterialBoard-${entry.styleName.replace(/\s+/g, '')}`}
                                        tagMode="materialBoard"
                                        projectName={proj?.name}
                                        allowUpscale
                                        allowSheetExport
                                        onCanvasEdit={onCanvasEdit}
                                        onFullscreen={onFullscreen}
                                    />
                                ) : (
                                    <div className="bs-card-failed">{entry.warning || 'Generation failed'}</div>
                                )}
                            </div>
                        ))}
                        {generating && progress && (
                            <div className="bs-card bs-card-loading">
                                <div style={{ fontSize: 20, color: 'var(--or)' }}>▦</div>
                                <div style={{ fontSize: 11, fontWeight: 600 }}>Generating style {progress.current} of {progress.total}…</div>
                                <div style={{ fontSize: 9, color: 'var(--tx3)' }}>~20–40s per board</div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
