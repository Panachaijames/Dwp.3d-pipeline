"use client";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { segmentBoardPieces, sampleBackgroundColor, BoardPiece, DetectedItem } from './boardCanvasSam';
import { completePiece, materializePhoto, objectizePhoto, swapPieceMaterial } from './boardCanvasComplete';
import './boardCanvasEditor.css';

interface Props {
    src: string;
    title?: string;
    onClose: () => void;
}

type EditorPiece = BoardPiece & {
    rotation: number;
    /** geometry at segmentation time — the anchor for AI completion */
    orig: { x: number; y: number; width: number; height: number };
    /** AI completion state (undefined = raw SAM cutout / raw upload) */
    aiStatus?: 'completing' | 'done' | 'failed';
    /** where the piece came from — uploads use the photo→swatch pipeline instead of board-context completion */
    source?: 'board' | 'upload';
};

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error(`Could not read ${file.name}`));
        r.readAsDataURL(file);
    });
}

// ---- session persistence (IndexedDB via idb-keyval) ----
// The whole editor session — pieces, uploads, background, layout — is autosaved keyed
// by a hash of the board image, so closing/reopening (or reloading) restores instead of
// re-running the segmentation + completion pipeline.

type SavedPiece = {
    id: string; label: string; src: string;
    x: number; y: number; width: number; height: number; rotation: number;
    lowConfidence: boolean;
    orig: { x: number; y: number; width: number; height: number };
    aiStatus?: 'done' | 'failed';
    source?: 'board' | 'upload';
    /** conversion source when it differs from the displayed src */
    origSrc?: string;
};

type BoardCanvasDoc = {
    version: 1;
    savedAt: number;
    natural: { w: number; h: number };
    bgColor: string;
    bgImageSrc: string | null;
    useBgImage: boolean;
    shadows: boolean;
    pieces: SavedPiece[];
};

const DOC_META_KEY = 'bce-doc-meta';
const MAX_SAVED_DOCS = 30;

function hashSrc(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return `bce-doc-${(h >>> 0).toString(36)}-${s.length.toString(36)}`;
}

async function pruneOldDocs(currentKey: string): Promise<void> {
    try {
        const meta: Record<string, number> = (await idbGet(DOC_META_KEY)) || {};
        meta[currentKey] = Date.now();
        const entries = Object.entries(meta).sort((a, b) => b[1] - a[1]);
        for (const [key] of entries.slice(MAX_SAVED_DOCS)) {
            delete meta[key];
            void idbDel(key);
        }
        await idbSet(DOC_META_KEY, meta);
    } catch { /* pruning is best-effort */ }
}

/** fraction of rect a covered by rect b */
function overlapFrac(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return (ix * iy) / Math.max(1, a.width * a.height);
}

type Status = 'detecting' | 'segmenting' | 'ready' | 'error';

const AI_BG_PROMPT = `Remove ALL material samples, swatches, boards and styling props from this image. Output ONLY the empty background surface — keep the exact same surface material, texture, color tone and soft lighting, extended naturally to fill the areas the samples occupied. Do not add any new objects, text or watermarks.`;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image failed to load'));
        img.src = src;
    });
}

export default function BoardCanvasEditor({ src, title, onClose }: Props) {
    const [status, setStatus] = useState<Status>('detecting');
    const [progressText, setProgressText] = useState('Detecting materials…');
    const [error, setError] = useState<string | null>(null);
    const [pieces, setPieces] = useState<EditorPiece[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [shadows, setShadows] = useState(true);
    const [natural, setNatural] = useState({ w: 1, h: 1 });
    const [bgColor, setBgColor] = useState('#e8e4dc');
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [useBgImage, setUseBgImage] = useState(false);
    const [aiBgLoading, setAiBgLoading] = useState(false);
    const [fit, setFit] = useState(1);
    const [swapText, setSwapText] = useState('');
    const [wasRestored, setWasRestored] = useState(false);

    useEffect(() => { setSwapText(''); }, [selectedId]);

    const elsRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const origElsRef = useRef<Map<string, HTMLImageElement>>(new Map()); // pristine SAM cutouts — the AI-completion source
    const nodeRefs = useRef<Map<string, Konva.Image>>(new Map());
    const piecesRef = useRef<EditorPiece[]>([]);
    const stageRef = useRef<Konva.Stage | null>(null);
    const transformerRef = useRef<Konva.Transformer | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const boardElRef = useRef<HTMLImageElement | null>(null); // original board — completion context

    useEffect(() => { piecesRef.current = pieces; }, [pieces]);

    // ---- shared: place a generated result back into a piece ----
    const applyPieceResult = useCallback(async (
        id: string,
        done: { src: string; width: number; height: number },
        signal?: AbortSignal,
        newLabel?: string
    ) => {
        const el = await loadImage(done.src);
        if (signal?.aborted) return;
        // don't swap geometry under an active drag/resize of this very piece
        for (let waited = 0; waited < 15_000; waited += 200) {
            const node = nodeRefs.current.get(id);
            const tr = transformerRef.current;
            const gestureActive = !!node && (node.isDragging() || (!!tr && tr.isTransforming() && tr.nodes().includes(node)));
            if (!gestureActive) break;
            await new Promise(r => setTimeout(r, 200));
            if (signal?.aborted) return;
        }
        if (!piecesRef.current.some(p => p.id === id)) return; // deleted while generating
        elsRef.current.set(id, el);
        // a swapped piece IS the new material now — future ops start from it
        if (newLabel) origElsRef.current.set(id, el);
        setPieces(prev => prev.map(p => {
            if (p.id !== id) return p;
            // fit the generated object inside the piece's current rect, keeping the
            // visual center fixed — the offset must be rotated into the piece's basis
            // because Konva rotates around the (x, y) origin
            const scale = Math.min(p.width / done.width, p.height / done.height);
            const w = done.width * scale, h = done.height * scale;
            const rad = (p.rotation * Math.PI) / 180;
            const ox = (p.width - w) / 2, oy = (p.height - h) / 2;
            return {
                ...p,
                src: done.src,
                x: p.x + ox * Math.cos(rad) - oy * Math.sin(rad),
                y: p.y + ox * Math.sin(rad) + oy * Math.cos(rad),
                width: w,
                height: h,
                aiStatus: 'done' as const,
                lowConfidence: false,
                ...(newLabel ? { label: newLabel } : {}),
            };
        }));
    }, []);

    // ---- AI completion: re-generate a cutout as a complete undamaged object ----
    const completeOne = useCallback(async (id: string, signal?: AbortSignal) => {
        const piece = piecesRef.current.find(p => p.id === id);
        const cutout = origElsRef.current.get(id);
        const board = boardElRef.current;
        if (!piece || !cutout || piece.aiStatus === 'completing') return;
        if (piece.source !== 'upload' && !board) return;
        setPieces(prev => prev.map(p => (p.id === id ? { ...p, aiStatus: 'completing' as const } : p)));
        try {
            const done = piece.source === 'upload'
                ? await materializePhoto(cutout, piece.label, signal)
                : await completePiece(cutout, piece.label, board!, piece.orig, signal);
            await applyPieceResult(id, done, signal);
        } catch (err: any) {
            if (signal?.aborted || err?.name === 'AbortError') return;
            console.warn('[BoardCanvasEditor] piece completion failed:', err);
            setPieces(prev => prev.map(p => (p.id === id ? { ...p, aiStatus: 'failed' as const } : p)));
        }
    }, [applyPieceResult]);

    // ---- object cutout for uploads: keep the object as-is, remove the background ----
    const cutoutOne = useCallback(async (id: string, signal?: AbortSignal) => {
        const piece = piecesRef.current.find(p => p.id === id);
        const photo = origElsRef.current.get(id);
        if (!piece || !photo || piece.aiStatus === 'completing') return;
        setPieces(prev => prev.map(p => (p.id === id ? { ...p, aiStatus: 'completing' as const } : p)));
        try {
            const done = await objectizePhoto(photo, piece.label, signal);
            await applyPieceResult(id, done, signal);
        } catch (err: any) {
            if (signal?.aborted || err?.name === 'AbortError') return;
            console.warn('[BoardCanvasEditor] object cutout failed:', err);
            setPieces(prev => prev.map(p => (p.id === id ? { ...p, aiStatus: 'failed' as const } : p)));
        }
    }, [applyPieceResult]);

    // ---- material swap: same shape, different material (template workflows) ----
    const swapOne = useCallback(async (id: string, toLabel: string, signal?: AbortSignal) => {
        const piece = piecesRef.current.find(p => p.id === id);
        const el = elsRef.current.get(id) || origElsRef.current.get(id);
        const to = toLabel.trim();
        if (!piece || !el || !to || piece.aiStatus === 'completing') return;
        setPieces(prev => prev.map(p => (p.id === id ? { ...p, aiStatus: 'completing' as const } : p)));
        try {
            const done = await swapPieceMaterial(el, piece.label, to, signal);
            await applyPieceResult(id, done, signal, to);
        } catch (err: any) {
            if (signal?.aborted || err?.name === 'AbortError') return;
            console.warn('[BoardCanvasEditor] material swap failed:', err);
            setPieces(prev => prev.map(p => (p.id === id ? { ...p, aiStatus: 'failed' as const } : p)));
        }
    }, [applyPieceResult]);

    const completeMany = useCallback(async (
        ids: string[],
        signal?: AbortSignal,
        runner: (id: string, signal?: AbortSignal) => Promise<void> = completeOne
    ) => {
        const queue = [...ids];
        await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
            while (queue.length && !signal?.aborted) {
                await runner(queue.shift()!, signal);
            }
        }));
    }, [completeOne]);

    const completeAll = () => {
        // board pieces only (uploads are converted per-piece, by explicit choice);
        // includes already-'done' pieces: re-running is how a user fixes a bad pass
        const ids = piecesRef.current
            .filter(p => p.aiStatus !== 'completing' && p.source !== 'upload')
            .map(p => p.id);
        if (ids.length) void completeMany(ids, abortRef.current?.signal);
    };

    // ---- user uploads: materials, objects, backgrounds ----
    type UploadMode = 'asis' | 'swatch' | 'cutout';
    const matInputRef = useRef<HTMLInputElement | null>(null);
    const bgInputRef = useRef<HTMLInputElement | null>(null);
    const uploadModeRef = useRef<UploadMode>('asis');

    const pickUpload = (mode: UploadMode) => {
        uploadModeRef.current = mode;
        matInputRef.current?.click();
    };

    const addMaterialFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const mode = uploadModeRef.current;
        const newIds: string[] = [];
        let i = 0;
        for (const file of Array.from(files).slice(0, 10)) {
            try {
                const el = await loadImage(await readFileAsDataUrl(file));
                const id = Math.random().toString(36).substring(2, 11);
                // drop it near the center at ~28% board width, cascading per file
                const w = natural.w * 0.28;
                const h = el.naturalHeight * (w / el.naturalWidth);
                const x = natural.w / 2 - w / 2 + i * 30;
                const y = natural.h / 2 - h / 2 + i * 30;
                elsRef.current.set(id, el);
                origElsRef.current.set(id, el); // the raw photo is the conversion source
                const piece: EditorPiece = {
                    id,
                    label: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'uploaded item',
                    src: el.src,
                    x, y, width: w, height: h,
                    rotation: 0,
                    lowConfidence: false,
                    orig: { x, y, width: w, height: h },
                    source: 'upload',
                };
                piecesRef.current = [...piecesRef.current, piece];
                setPieces(prev => [...prev, piece]);
                setSelectedId(id);
                newIds.push(id);
                i++;
            } catch (err) {
                console.warn('[BoardCanvasEditor] upload failed:', err);
            }
        }
        // 'asis' places the raw photo untouched; the other modes convert per choice
        if (newIds.length && mode === 'swatch') void completeMany(newIds, abortRef.current?.signal);
        if (newIds.length && mode === 'cutout') void completeMany(newIds, abortRef.current?.signal, cutoutOne);
    };

    const uploadBackground = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        try {
            const el = await loadImage(await readFileAsDataUrl(files[0]));
            setBgImage(el);
            setUseBgImage(true);
        } catch (err: any) {
            alert(`Background upload failed: ${err?.message || 'unknown error'}`);
        }
    };

    // ---- pipeline: detect boxes -> SAM cutouts ----
    const runPipeline = useCallback(async () => {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setWasRestored(false);
        setStatus('detecting');
        setError(null);
        setPieces([]);
        setSelectedId(null);
        elsRef.current.clear();
        origElsRef.current.clear();
        nodeRefs.current.clear();
        try {
            const img = await loadImage(src);
            boardElRef.current = img;
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            setBgColor(sampleBackgroundColor(img));

            setProgressText('Detecting materials…');
            const res = await fetch('/api/segment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageData: src }),
                signal: ac.signal,
            });
            if (!res.ok) {
                let msg = `Detection failed (${res.status})`;
                try { msg = (await res.json()).error || msg; } catch { /* non-JSON body (proxy/timeout page) */ }
                throw new Error(msg);
            }
            const data = await res.json();
            const items: DetectedItem[] = data.items;

            setStatus('segmenting');
            setProgressText(`Cutting ${items.length} pieces…`);
            const result = await segmentBoardPieces(src, items, (p) => {
                if (p.stage === 'loading-model') setProgressText('Loading segmentation model (first time ~40 MB)…');
                else if (p.stage === 'embedding') setProgressText('Analyzing board…');
                else setProgressText(`Cutting pieces… ${p.done}/${p.total}`);
            }, ac.signal);

            const els = await Promise.all(result.pieces.map(p => loadImage(p.src)));
            if (ac.signal.aborted) return;
            result.pieces.forEach((p, i) => {
                elsRef.current.set(p.id, els[i]);
                origElsRef.current.set(p.id, els[i]);
            });
            const list: EditorPiece[] = result.pieces.map(p => ({
                ...p,
                rotation: 0,
                orig: { x: p.x, y: p.y, width: p.width, height: p.height },
                source: 'board' as const,
            }));
            piecesRef.current = list; // sync now — auto-completion below reads it before the effect runs
            setPieces(list);
            setStatus('ready');

            // pieces that overlap a neighbour are almost certainly damaged where they
            // intersect — auto-regenerate those as complete objects (the rest stay
            // instant SAM cutouts; "Complete all" covers them on demand)
            const occluded = list
                .filter(p => list.some(q => q.id !== p.id && overlapFrac(p.orig, q.orig) > 0.12))
                .map(p => p.id);
            if (occluded.length) void completeMany(occluded, ac.signal);
        } catch (err: any) {
            if (err?.name === 'AbortError' || ac.signal.aborted) return; // editor closed or re-run started
            console.error('[BoardCanvasEditor] pipeline failed:', err);
            setError(err?.message || 'Segmentation failed');
            setStatus('error');
        }
    }, [src, completeMany]);

    // ---- session save / restore ----
    const docKey = useMemo(() => hashSrc(src), [src]);

    const saveDoc = useCallback(async () => {
        const list = piecesRef.current;
        if (!list.length) return;
        const doc: BoardCanvasDoc = {
            version: 1,
            savedAt: Date.now(),
            natural: { w: naturalRef.current.w, h: naturalRef.current.h },
            bgColor: bgStateRef.current.color,
            bgImageSrc: bgStateRef.current.image?.src || null,
            useBgImage: bgStateRef.current.useImage,
            shadows: bgStateRef.current.shadows,
            pieces: list.map(p => {
                const origEl = origElsRef.current.get(p.id);
                return {
                    id: p.id, label: p.label, src: p.src,
                    x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation,
                    lowConfidence: p.lowConfidence,
                    orig: p.orig,
                    aiStatus: p.aiStatus === 'done' || p.aiStatus === 'failed' ? p.aiStatus : undefined,
                    source: p.source,
                    ...(origEl && origEl.src !== p.src ? { origSrc: origEl.src } : {}),
                };
            }),
        };
        try {
            await idbSet(docKey, doc);
            void pruneOldDocs(docKey);
        } catch (err) {
            console.warn('[BoardCanvasEditor] session save failed:', err);
        }
    }, [docKey]);

    // mirrors for saveDoc (it runs from timers/unmount and must not capture stale state)
    const naturalRef = useRef(natural);
    useEffect(() => { naturalRef.current = natural; }, [natural]);
    const bgStateRef = useRef({ color: bgColor, image: bgImage, useImage: useBgImage, shadows });
    useEffect(() => { bgStateRef.current = { color: bgColor, image: bgImage, useImage: useBgImage, shadows }; }, [bgColor, bgImage, useBgImage, shadows]);

    const restoreDoc = useCallback(async (signal: AbortSignal): Promise<boolean> => {
        try {
            const doc = (await idbGet(docKey)) as BoardCanvasDoc | undefined;
            if (!doc || doc.version !== 1 || !Array.isArray(doc.pieces) || doc.pieces.length === 0) return false;
            setProgressText('Restoring your board…');
            const [boardEl, bgEl, els, origEls] = await Promise.all([
                loadImage(src),
                doc.bgImageSrc ? loadImage(doc.bgImageSrc) : Promise.resolve(null),
                Promise.all(doc.pieces.map(p => loadImage(p.src))),
                Promise.all(doc.pieces.map(p => (p.origSrc ? loadImage(p.origSrc) : Promise.resolve(null)))),
            ]);
            if (signal.aborted) return true; // editor closed mid-restore — don't fall through to a pipeline run
            boardElRef.current = boardEl;
            elsRef.current.clear();
            origElsRef.current.clear();
            nodeRefs.current.clear();
            doc.pieces.forEach((p, i) => {
                elsRef.current.set(p.id, els[i]);
                origElsRef.current.set(p.id, origEls[i] || els[i]);
            });
            const list: EditorPiece[] = doc.pieces.map(p => ({ ...p }));
            piecesRef.current = list;
            setPieces(list);
            setNatural(doc.natural);
            setBgColor(doc.bgColor);
            setBgImage(bgEl);
            setUseBgImage(doc.useBgImage && !!bgEl);
            setShadows(doc.shadows);
            setSelectedId(null);
            setWasRestored(true);
            setStatus('ready');
            return true;
        } catch (err) {
            console.warn('[BoardCanvasEditor] session restore failed — running pipeline:', err);
            return false;
        }
    }, [docKey, src]);

    // No run-once guard: under StrictMode the cleanup aborts the first run, and a
    // guard would leave nothing to restart it — instead every (re)mount starts a fresh
    // run and runPipeline itself aborts whichever run came before.
    // A previously saved session restores instead of re-running the (paid) pipeline.
    useEffect(() => {
        const ac = new AbortController();
        void (async () => {
            const restored = await restoreDoc(ac.signal);
            if (!restored && !ac.signal.aborted) runPipeline();
        })();
        return () => {
            ac.abort();
            abortRef.current?.abort();
            void saveDoc(); // final save on close (autosave may not have flushed)
        };
    }, [runPipeline, restoreDoc, saveDoc]);

    // debounced autosave of every meaningful change
    useEffect(() => {
        if (status !== 'ready') return;
        const t = setTimeout(() => { void saveDoc(); }, 800);
        return () => clearTimeout(t);
    }, [pieces, bgColor, bgImage, useBgImage, shadows, natural, status, saveDoc]);

    // ---- stage fitting ----
    useLayoutEffect(() => {
        const measure = () => {
            const el = containerRef.current;
            if (!el) return;
            const pad = 24;
            const availW = Math.max(100, el.clientWidth - pad);
            const availH = Math.max(100, el.clientHeight - pad);
            setFit(Math.min(availW / natural.w, availH / natural.h, 1.5));
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [natural]);

    // ---- selection / transformer ----
    useEffect(() => {
        const tr = transformerRef.current;
        if (!tr) return;
        const node = selectedId ? nodeRefs.current.get(selectedId) : null;
        tr.nodes(node ? [node] : []);
        tr.getLayer()?.batchDraw();
    }, [selectedId, pieces]);

    const updatePiece = (id: string, patch: Partial<EditorPiece>) => {
        setPieces(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
    };

    const deletePiece = useCallback((id: string) => {
        setPieces(prev => prev.filter(p => p.id !== id));
        nodeRefs.current.delete(id);
        elsRef.current.delete(id);
        origElsRef.current.delete(id);
        setSelectedId(prev => (prev === id ? null : prev));
    }, []);

    const duplicatePiece = (id: string) => {
        setPieces(prev => {
            const p = prev.find(x => x.id === id);
            if (!p) return prev;
            const copy = { ...p, id: Math.random().toString(36).substring(2, 11), x: p.x + 24, y: p.y + 24, aiStatus: undefined };
            elsRef.current.set(copy.id, elsRef.current.get(id)!);
            const origEl = origElsRef.current.get(id);
            if (origEl) origElsRef.current.set(copy.id, origEl);
            return [...prev, copy];
        });
    };

    const movePiece = (id: string, dir: 1 | -1) => {
        setPieces(prev => {
            const i = prev.findIndex(p => p.id === id);
            const j = i + dir;
            if (i === -1 || j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                e.preventDefault();
                deletePiece(selectedId);
            } else if (e.key === 'Escape') {
                if (selectedId) setSelectedId(null);
                else onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, deletePiece, onClose]);

    // ---- background plate ----
    const generateAiBackground = async () => {
        if (aiBgLoading) return;
        setAiBgLoading(true);
        try {
            const res = await fetch('/api/imagen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: AI_BG_PROMPT, targetModel: 'nano-banana', singleImage: true, imageData: src }),
            });
            if (!res.ok) {
                let msg = `Background generation failed (${res.status})`;
                try { msg = (await res.json()).error || msg; } catch { /* non-JSON body */ }
                throw new Error(msg);
            }
            const data = await res.json();
            if (!data.images?.[0]) throw new Error('Background generation returned no image');
            const el = await loadImage(data.images[0]);
            setBgImage(el);
            setUseBgImage(true);
        } catch (err: any) {
            alert(`AI background failed: ${err?.message || 'unknown error'}`);
        } finally {
            setAiBgLoading(false);
        }
    };

    // ---- export ----
    const exportPng = () => {
        const stage = stageRef.current;
        const tr = transformerRef.current;
        if (!stage) return;
        const prevNodes = tr ? tr.nodes() : [];
        tr?.nodes([]);
        // export at exact natural resolution — pixelRatio 1/fit can float-truncate one pixel
        stage.size({ width: natural.w, height: natural.h });
        stage.scale({ x: 1, y: 1 });
        stage.draw();
        const url = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 });
        stage.size({ width: natural.w * fit, height: natural.h * fit });
        stage.scale({ x: fit, y: fit });
        tr?.nodes(prevNodes);
        stage.draw();
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(title || 'material-board').replace(/[^a-z0-9-_]+/gi, '_')}_canvas.png`;
        a.click();
    };

    const downloadPiece = (p: EditorPiece) => {
        const ext = (p.src.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg');
        const a = document.createElement('a');
        a.href = p.src;
        a.download = `${p.label.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'piece'}.${ext}`;
        a.click();
    };

    const busy = status === 'detecting' || status === 'segmenting';
    const selected = pieces.find(p => p.id === selectedId) || null;
    const completingCount = pieces.filter(p => p.aiStatus === 'completing').length;

    // cover-fit crop so an uploaded background of any aspect fills the board without stretching
    const bgCrop = useMemo(() => {
        if (!bgImage) return undefined;
        const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
        const s = Math.max(natural.w / iw, natural.h / ih);
        const cw = natural.w / s, ch = natural.h / s;
        return { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch };
    }, [bgImage, natural]);

    const deselectIfBg = (e: Konva.KonvaEventObject<any>) => {
        if (e.target === e.target.getStage() || e.target.hasName('bce-bg')) setSelectedId(null);
    };

    return (
        <div className="bce-overlay">
            <div className="bce-header">
                <div className="bce-title">
                    <span className="bce-badge">CANVAS</span>
                    {title || 'Material Board'}
                    {status === 'ready' && <span className="bce-count">{pieces.length} pieces</span>}
                    {status === 'ready' && wasRestored && <span className="bce-restored" title="Your previous session was restored — pieces, uploads and layout kept. Use ↻ Re-segment to start over from the original board.">↩ restored</span>}
                </div>
                <div className="bce-actions">
                    <input type="file" accept="image/*" ref={bgInputRef} style={{ display: 'none' }} onChange={(e) => { void uploadBackground(e.target.files); e.target.value = ''; }} />
                    <input type="file" accept="image/*" multiple ref={matInputRef} style={{ display: 'none' }} onChange={(e) => { void addMaterialFiles(e.target.files); e.target.value = ''; }} />
                    <button className="vw-btn vw-btn-sm vw-btn-g" onClick={() => setShadows(s => !s)} disabled={busy}>
                        {shadows ? '☀ Shadows on' : '☁ Shadows off'}
                    </button>
                    <button
                        className="vw-btn vw-btn-sm vw-btn-g"
                        onClick={() => bgInputRef.current?.click()}
                        disabled={status !== 'ready'}
                        title="Upload your own image to use as the board background"
                    >
                        🖼 Upload BG
                    </button>
                    <button
                        className="vw-btn vw-btn-sm vw-btn-g"
                        onClick={() => (bgImage ? setUseBgImage(v => !v) : generateAiBackground())}
                        disabled={busy || aiBgLoading}
                        title="Generate an empty background plate from the original board via Nano Banana — or toggle between the image and flat-color background"
                    >
                        {aiBgLoading ? '◌ Generating BG…' : bgImage ? (useBgImage ? '▦ Flat color BG' : '▩ Image BG') : '▩ AI clean background'}
                    </button>
                    <button
                        className="vw-btn vw-btn-sm"
                        style={{ borderColor: '#fbbf24', color: '#fbbf24', fontWeight: 600 }}
                        onClick={completeAll}
                        disabled={busy || completingCount > 0 || pieces.length === 0}
                        title="Re-generate every piece as a complete, undamaged object via Nano Banana — fixes overlapped and imperfect cutouts"
                    >
                        {completingCount > 0 ? `✨ Completing ${completingCount}…` : '✨ Complete all pieces'}
                    </button>
                    <button className="vw-btn vw-btn-sm vw-btn-g" onClick={runPipeline} disabled={busy} title="Re-detect and re-cut all pieces (resets your layout)">
                        ↻ Re-segment
                    </button>
                    <button className="vw-btn vw-btn-sm vw-btn-p" onClick={exportPng} disabled={busy || status !== 'ready'}>
                        ⤓ Export PNG
                    </button>
                    <button className="vw-btn vw-btn-sm vw-btn-g" onClick={onClose}>✕ Close</button>
                </div>
            </div>

            <div className="bce-body">
                <div className="bce-canvas-wrap" ref={containerRef}>
                    {busy && (
                        <div className="bce-progress">
                            <div className="bce-spinner" />
                            <div>{progressText}</div>
                            <div className="bce-progress-hint">runs in your browser — nothing is uploaded except the detection call</div>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="bce-progress">
                            <div className="bce-error">Segmentation failed</div>
                            <div className="bce-error-detail">{error}</div>
                            <button className="vw-btn vw-btn-sm vw-btn-p" onClick={runPipeline}>↻ Retry</button>
                        </div>
                    )}
                    {status === 'ready' && (
                        <Stage
                            ref={stageRef as any}
                            width={natural.w * fit}
                            height={natural.h * fit}
                            scaleX={fit}
                            scaleY={fit}
                            onMouseDown={deselectIfBg}
                            onTouchStart={deselectIfBg}
                        >
                            <Layer>
                                {useBgImage && bgImage ? (
                                    <KonvaImage name="bce-bg" image={bgImage} x={0} y={0} width={natural.w} height={natural.h} crop={bgCrop} listening={true} />
                                ) : (
                                    <Rect name="bce-bg" x={0} y={0} width={natural.w} height={natural.h} fill={bgColor} listening={true} />
                                )}
                                {pieces.map(p => (
                                    <KonvaImage
                                        key={p.id}
                                        ref={(node) => { if (node) nodeRefs.current.set(p.id, node); else nodeRefs.current.delete(p.id); }}
                                        image={elsRef.current.get(p.id)}
                                        x={p.x}
                                        y={p.y}
                                        width={p.width}
                                        height={p.height}
                                        rotation={p.rotation}
                                        draggable
                                        onClick={() => setSelectedId(p.id)}
                                        onTap={() => setSelectedId(p.id)}
                                        onDragStart={() => setSelectedId(p.id)}
                                        onDragEnd={(e) => updatePiece(p.id, { x: e.target.x(), y: e.target.y() })}
                                        onTransformEnd={(e) => {
                                            const node = e.target as Konva.Image;
                                            updatePiece(p.id, {
                                                x: node.x(),
                                                y: node.y(),
                                                width: Math.max(8, node.width() * node.scaleX()),
                                                height: Math.max(8, node.height() * node.scaleY()),
                                                rotation: node.rotation(),
                                            });
                                            node.scaleX(1);
                                            node.scaleY(1);
                                        }}
                                        shadowColor="rgba(0,0,0,0.45)"
                                        shadowBlur={shadows ? 18 : 0}
                                        shadowOffset={shadows ? { x: 6, y: 10 } : { x: 0, y: 0 }}
                                        shadowOpacity={shadows ? 0.55 : 0}
                                    />
                                ))}
                                <Transformer
                                    ref={transformerRef as any}
                                    rotateEnabled
                                    keepRatio={false}
                                    anchorSize={9}
                                    anchorCornerRadius={2}
                                    borderStroke="#ccff00"
                                    anchorStroke="#ccff00"
                                    anchorFill="#111"
                                    boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
                                />
                            </Layer>
                        </Stage>
                    )}
                </div>

                <div className="bce-sidebar">
                    <div className="bce-sidebar-title">Pieces</div>
                    <button
                        className="vw-btn vw-btn-sm"
                        style={{ borderColor: '#4ade80', color: '#4ade80', fontWeight: 600 }}
                        onClick={() => pickUpload('asis')}
                        disabled={status !== 'ready'}
                        title="Upload photos and place them on the board unchanged (no AI)"
                    >
                        ➕ Add photo as-is
                    </button>
                    <div className="bce-tool-row">
                        <button
                            className="vw-btn vw-btn-sm vw-btn-g"
                            onClick={() => pickUpload('swatch')}
                            disabled={status !== 'ready'}
                            title="Upload photos of materials — AI converts each into a clean flat-lay swatch"
                        >
                            ✨ As material
                        </button>
                        <button
                            className="vw-btn vw-btn-sm vw-btn-g"
                            onClick={() => pickUpload('cutout')}
                            disabled={status !== 'ready'}
                            title="Upload photos of furniture/objects — AI keeps them exactly as they look and only removes the background"
                        >
                            🪑 As cutout
                        </button>
                    </div>
                    {status === 'ready' && pieces.length === 0 && <div className="bce-sidebar-empty">No pieces — try Re-segment</div>}
                    <div className="bce-piece-list">
                        {[...pieces].reverse().map(p => (
                            <div
                                key={p.id}
                                className={`bce-piece ${selectedId === p.id ? 'bce-piece-sel' : ''}`}
                                onClick={() => setSelectedId(p.id)}
                            >
                                <img src={p.src} alt={p.label} />
                                <span className="bce-piece-label" title={p.label}>
                                    {p.lowConfidence && <span title="Mask may be inaccurate — check this piece">⚠ </span>}
                                    {p.label}
                                </span>
                                {p.aiStatus === 'completing' && <span className="bce-spin" title="AI is completing this piece">⟳</span>}
                                {p.aiStatus === 'done' && <span className="bce-status-done" title="AI-completed full object">✨</span>}
                                {p.aiStatus === 'failed' && <span className="bce-status-failed" title="AI completion failed — select the piece and retry">✕</span>}
                            </div>
                        ))}
                    </div>
                    {selected && (
                        <div className="bce-selected-tools">
                            <div className="bce-selected-label" title={selected.label}>{selected.label}</div>
                            <div className="bce-tool-row">
                                <button className="vw-btn vw-btn-sm vw-btn-g" onClick={() => movePiece(selected.id, 1)} title="Bring forward">▲ Front</button>
                                <button className="vw-btn vw-btn-sm vw-btn-g" onClick={() => movePiece(selected.id, -1)} title="Send backward">▼ Back</button>
                            </div>
                            <div className="bce-tool-row">
                                <button className="vw-btn vw-btn-sm vw-btn-g" onClick={() => duplicatePiece(selected.id)}>⧉ Duplicate</button>
                                <button className="vw-btn vw-btn-sm bce-btn-danger" onClick={() => deletePiece(selected.id)}>🗑 Delete</button>
                            </div>
                            <div className="bce-tool-row">
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => downloadPiece(selected)}
                                    title="Download just this piece as an image (cutouts keep their transparency)"
                                >
                                    ⤓ Save piece PNG
                                </button>
                            </div>
                            <div className="bce-tool-row">
                                <button
                                    className="vw-btn vw-btn-sm"
                                    style={{ borderColor: '#fbbf24', color: '#fbbf24' }}
                                    onClick={() => void completeOne(selected.id, abortRef.current?.signal)}
                                    disabled={selected.aiStatus === 'completing'}
                                    title={selected.source === 'upload'
                                        ? 'Convert this photo into a clean flat-lay swatch (re-run for a new take)'
                                        : 'Re-generate this piece as a complete, undamaged object (fixes overlap damage; re-run for a new variation)'}
                                >
                                    {selected.aiStatus === 'completing'
                                        ? '⟳ Completing…'
                                        : selected.source === 'upload'
                                            ? (selected.aiStatus === 'done' ? '✨ Re-make swatch' : '✨ Make material swatch')
                                            : (selected.aiStatus === 'done' ? '✨ Re-complete' : '✨ AI Complete')}
                                </button>
                            </div>
                            {selected.source === 'upload' && (
                                <div className="bce-tool-row">
                                    <button
                                        className="vw-btn vw-btn-sm vw-btn-g"
                                        onClick={() => void cutoutOne(selected.id, abortRef.current?.signal)}
                                        disabled={selected.aiStatus === 'completing'}
                                        title="Keep the object exactly as photographed and remove only the background"
                                    >
                                        🪑 Cut out object
                                    </button>
                                </div>
                            )}
                            <input
                                className="bce-swap-input"
                                placeholder="Swap material to… e.g. walnut veneer"
                                value={swapText}
                                onChange={(e) => setSwapText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && swapText.trim()) void swapOne(selected.id, swapText, abortRef.current?.signal); }}
                                disabled={selected.aiStatus === 'completing'}
                            />
                            <div className="bce-tool-row">
                                <button
                                    className="vw-btn vw-btn-sm"
                                    style={{ borderColor: '#4ade80', color: '#4ade80' }}
                                    onClick={() => void swapOne(selected.id, swapText, abortRef.current?.signal)}
                                    disabled={selected.aiStatus === 'completing' || !swapText.trim()}
                                    title="Re-render this piece in a different material, keeping its shape and position — e.g. turn a template's marble into your walnut"
                                >
                                    ⇄ Swap material
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="bce-hint">
                        Drag to move · corners to resize · top handle to rotate · Del to remove · ✨ regenerates a piece as a full undamaged object (overlapped pieces are completed automatically)
                    </div>
                </div>
            </div>
        </div>
    );
}
