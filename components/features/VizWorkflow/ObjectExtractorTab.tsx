"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import './objectExtractor.css';
import DimensionEditor from './DimensionEditor';
import SpecSheet from './SpecSheet';

type Point = { nx: number; ny: number };

type Dimensions = {
    height: number | null;
    width: number | null;
    depth: number | null;
    unit: string;
};

type ResultEntry = {
    data: string;
    name: string;
    label: string;
    batchId: string;
};

type Metadata = {
    specific_object_name?: string;
    object_name?: string;
    object_category?: string;
    [key: string]: any;
};

// One extract run = one furniture item. Snapshots everything the Spec Sheet
// needs so any previously-extracted item can be turned into a DWG later.
type Batch = {
    id: string;
    name: string;
    sourceImage: string;
    metadata: Metadata | null;
    dimensions: Dimensions;
};

const DEFAULT_VIEWS = [
    {
        id: 'Front View',
        instruction:
            'Render the object as a STRAIGHT-ON FRONT VIEW (camera positioned dead-center in front of the object, perpendicular to its front face, at eye level). Only the FRONT face should be visible; the sides and back should NOT be visible. This is a clean head-on product shot.',
        dimensionGuide:
            'For this FRONT VIEW: only HEIGHT and WIDTH are visible (DEPTH is hidden — do NOT draw a depth arrow). The HEIGHT arrow is VERTICAL, placed just outside the LEFT edge of the object. The WIDTH arrow is HORIZONTAL, placed just below the BOTTOM edge of the object.',
    },
    {
        id: 'Side Profile',
        instruction:
            'Render the object as a PURE 90° SIDE PROFILE (camera positioned directly to the RIGHT side of the object, perpendicular to its front). Only ONE SIDE should be visible; the front and back should NOT be visible. This MUST be a clean side silhouette, completely different from the front view.',
        dimensionGuide:
            'For this SIDE PROFILE: only HEIGHT and DEPTH are visible (WIDTH is hidden — do NOT draw a width arrow). The HEIGHT arrow is VERTICAL, placed just outside the LEFT edge of the object. The DEPTH arrow is HORIZONTAL, placed just below the BOTTOM edge of the object (since front-to-back appears as left-to-right in a side profile).',
    },
    {
        id: '3/4 Front View',
        instruction:
            'Render the object ROTATED so the camera sees it from a 3/4 FRONT-RIGHT angle (camera positioned roughly 30°–45° from dead-center front — in front of and to the right of the object, at eye level). The FRONT and the RIGHT side must be the dominant visible surfaces. The BACK of the object must NOT be visible. This is a classic 3/4 product hero shot.',
        dimensionGuide:
            'For this 3/4 FRONT VIEW: all three dimensions are visible. The HEIGHT arrow is VERTICAL, placed just outside the LEFT edge of the object. The WIDTH arrow runs along the BOTTOM edge of the FRONT face of the object (the receding floor edge on the LEFT half of the silhouette). The DEPTH arrow runs along the BOTTOM edge of the RIGHT-SIDE face (the receding floor edge on the RIGHT half of the silhouette). WIDTH and DEPTH must NOT be parallel to each other — they follow two different floor edges that meet at the front-right corner.',
    },
    {
        id: '3/4 Back View',
        instruction:
            'Render the object ROTATED so the camera sees it from a 3/4 BACK-RIGHT angle (camera positioned roughly 150° from dead-center front — behind and to the right of the object, at eye level). The BACK and the RIGHT side must be the dominant visible surfaces. This view MUST show the object from behind, not from the front.',
        dimensionGuide:
            'For this 3/4 BACK VIEW: all three dimensions are visible. The HEIGHT arrow is VERTICAL, placed just outside the LEFT edge of the object. The WIDTH arrow runs along the BOTTOM edge of the BACK face of the object (the receding edge on the LEFT half of the silhouette). The DEPTH arrow runs along the BOTTOM edge of the RIGHT-SIDE face (the receding edge on the RIGHT half of the silhouette). WIDTH and DEPTH must NOT be parallel to each other — they follow two different floor edges that meet at the back-right corner.',
    },
    {
        id: 'Isometric View',
        instruction:
            'Render the object as a TRUE ISOMETRIC VIEW (camera positioned at a 45° horizontal angle and tilted ~30° downward from above, so the FRONT, RIGHT SIDE, and TOP faces are ALL visible simultaneously with equal visual weight). Use parallel projection with no perspective foreshortening — all three axes should appear equally foreshortened, exactly like a classic isometric technical/CAD rendering. The three visible faces must be clearly distinguishable. The FRONT face must be on the LEFT half of the silhouette and the RIGHT-SIDE face must be on the RIGHT half of the silhouette.',
        dimensionGuide:
            'For this ISOMETRIC VIEW: all three dimensions are visible. The HEIGHT arrow is VERTICAL, placed just outside the LEFT edge of the object. The WIDTH arrow runs along the BOTTOM edge of the FRONT face (the receding floor edge on the LEFT half of the silhouette). The DEPTH arrow runs along the BOTTOM edge of the RIGHT-SIDE face (the receding floor edge on the RIGHT half of the silhouette). WIDTH and DEPTH must NOT be parallel to each other — they follow two different floor edges that meet at the front-right corner.',
    },
    {
        id: 'Top View',
        instruction:
            'Render the object as a STRAIGHT-DOWN TOP VIEW / BIRD\'S-EYE VIEW (camera positioned directly ABOVE the object, looking straight down, perpendicular to the ground plane). Only the TOP face should be visible; the front, sides, and back must NOT be visible. This is a clean orthographic plan view / floor-plan-style shot of the object from above. IMPORTANT ORIENTATION: the FRONT of the object must face the BOTTOM edge of the image (i.e., the back of the object points to the top of the image, the left side of the object to the left edge, and the right side of the object to the right edge of the image).',
        dimensionGuide:
            'For this TOP VIEW: only WIDTH and DEPTH are visible (HEIGHT is hidden — do NOT draw a height arrow). Because the FRONT of the object faces the BOTTOM of the image, the WIDTH arrow (left-to-right of the front face) is HORIZONTAL and placed just below the BOTTOM edge of the object. The DEPTH arrow (front-to-back of the object) is VERTICAL and placed just outside the RIGHT edge of the object. WIDTH must be horizontal in the image and DEPTH must be vertical in the image — do NOT swap them.',
    },
];

export default function ObjectExtractorTab() {
    // ===== Synced state (all variables flow through React) =====
    const [base64Image, setBase64Image] = useState<string>('');
    const [previewSrc, setPreviewSrc] = useState<string>('');
    const [promptText, setPromptText] = useState<string>('');
    const [customPrompt, setCustomPrompt] = useState<string>('');
    const [dimensions, setDimensions] = useState<Dimensions>({ height: null, width: null, depth: null, unit: 'in' });
    const [savedPath, setSavedPath] = useState<Point[]>([]);
    const [results, setResults] = useState<ResultEntry[]>([]);
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [status, setStatus] = useState<{ msg: string; error: boolean } | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
    const [dimensioningEntry, setDimensioningEntry] = useState<ResultEntry | null>(null);
    const [zoomEntry, setZoomEntry] = useState<ResultEntry | null>(null);
    const [batches, setBatches] = useState<Record<string, Batch>>({});
    const [specSheetOpen, setSpecSheetOpen] = useState<boolean>(false);
    const [specPickerOpen, setSpecPickerOpen] = useState<boolean>(false);
    const [specBatchId, setSpecBatchId] = useState<string | null>(null);

    // ===== Refs =====
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewImgRef = useRef<HTMLImageElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const lightboxImgRef = useRef<HTMLImageElement>(null);
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef<boolean>(false);
    const drawingPointsRef = useRef<Point[]>([]);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const hasMask = savedPath.length > 2;

    // ===== Helpers =====
    const showStatus = (msg: string, isError = false) => setStatus({ msg, error: isError });
    const clearStatus = () => setStatus(null);

    // ===== File handling =====
    const handleFile = useCallback((file?: File | null) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = String(e.target?.result || '');
            setBase64Image(dataUrl.split(',')[1] || '');
            setPreviewSrc(dataUrl);
            setSavedPath([]);
            drawingPointsRef.current = [];
            clearStatus();
        };
        reader.readAsDataURL(file);
    }, []);

    // ===== Paste support =====
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const item = e.clipboardData?.items[0];
            if (item && item.type.startsWith('image/')) {
                handleFile(item.getAsFile() || undefined);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [handleFile]);

    // ===== Mask rendering (on preview thumb) =====
    const drawMask = useCallback(() => {
        const canvas = maskCanvasRef.current;
        if (!canvas) return;
        const mCtx = canvas.getContext('2d');
        if (!mCtx) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        mCtx.clearRect(0, 0, canvas.width, canvas.height);

        if (savedPath.length < 3) return;

        mCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        mCtx.fillRect(0, 0, canvas.width, canvas.height);

        mCtx.globalCompositeOperation = 'destination-out';
        mCtx.beginPath();
        mCtx.moveTo(savedPath[0].nx * canvas.width, savedPath[0].ny * canvas.height);
        for (let i = 1; i < savedPath.length; i++) {
            mCtx.lineTo(savedPath[i].nx * canvas.width, savedPath[i].ny * canvas.height);
        }
        mCtx.closePath();
        mCtx.fill();

        mCtx.globalCompositeOperation = 'source-over';
        mCtx.strokeStyle = 'rgba(232, 115, 26, 0.8)';
        mCtx.lineWidth = 2;
        mCtx.setLineDash([4, 4]);
        mCtx.stroke();
    }, [savedPath]);

    useEffect(() => {
        drawMask();
    }, [drawMask, previewSrc]);

    useEffect(() => {
        const onResize = () => drawMask();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [drawMask]);

    // ===== Lightbox drawing =====
    const initLightboxCanvas = useCallback(() => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        ctx.strokeStyle = '#E8731A';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([8, 4]);
        // Replay existing path
        if (drawingPointsRef.current.length > 1) {
            ctx.beginPath();
            ctx.moveTo(drawingPointsRef.current[0].nx * canvas.width, drawingPointsRef.current[0].ny * canvas.height);
            for (let i = 1; i < drawingPointsRef.current.length; i++) {
                ctx.lineTo(drawingPointsRef.current[i].nx * canvas.width, drawingPointsRef.current[i].ny * canvas.height);
            }
            ctx.stroke();
        }
    }, []);

    const openLightbox = () => {
        if (!previewSrc) return;
        drawingPointsRef.current = [...savedPath];
        setLightboxOpen(true);
        setTimeout(initLightboxCanvas, 50);
    };

    const getNormalizedPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        let clientX: number, clientY: number;
        if ('touches' in e && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            const me = e as React.MouseEvent;
            clientX = me.clientX;
            clientY = me.clientY;
        }
        return {
            nx: (clientX - rect.left) / rect.width,
            ny: (clientY - rect.top) / rect.height,
        };
    };

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if ('touches' in e) e.preventDefault();
        isDrawingRef.current = true;
        drawingPointsRef.current = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pos = getNormalizedPos(e, canvas);
        drawingPointsRef.current.push(pos);
        ctx.beginPath();
        ctx.moveTo(pos.nx * canvas.width, pos.ny * canvas.height);
    };

    const moveDraw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawingRef.current) return;
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if ('touches' in e) e.preventDefault();
        const pos = getNormalizedPos(e, canvas);
        drawingPointsRef.current.push(pos);
        ctx.lineTo(pos.nx * canvas.width, pos.ny * canvas.height);
        ctx.stroke();
    };

    const stopDraw = () => {
        isDrawingRef.current = false;
    };

    useEffect(() => {
        window.addEventListener('mouseup', stopDraw);
        return () => window.removeEventListener('mouseup', stopDraw);
    }, []);

    const clearDrawing = () => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingPointsRef.current = [];
    };

    const doneDrawing = () => {
        setSavedPath([...drawingPointsRef.current]);
        setLightboxOpen(false);
    };

    // ===== Reset =====
    const resetAll = () => {
        setBase64Image('');
        setPreviewSrc('');
        setPromptText('');
        setCustomPrompt('');
        setDimensions({ height: null, width: null, depth: null, unit: 'in' });
        setSavedPath([]);
        drawingPointsRef.current = [];
        setResults([]);
        setMetadata(null);
        setBatches({});
        setSpecSheetOpen(false);
        setSpecPickerOpen(false);
        setSpecBatchId(null);
        clearStatus();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const clearResults = () => {
        setResults([]);
        setMetadata(null);
        setBase64Image('');
        setPreviewSrc('');
        setSavedPath([]);
        setBatches({});
        setSpecSheetOpen(false);
        setSpecPickerOpen(false);
        setSpecBatchId(null);
        drawingPointsRef.current = [];
        clearStatus();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const downloadSingle = (entry: ResultEntry) => {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${entry.data}`;
        link.download = entry.name;
        link.click();
    };

    // ===== Download all =====
    const downloadAll = async () => {
        if (results.length === 0) return;
        if (results.length === 1) {
            const link = document.createElement('a');
            link.href = `data:image/png;base64,${results[0].data}`;
            link.download = results[0].name;
            link.click();
            return;
        }
        const zip = new JSZip();
        results.forEach((entry) => zip.file(entry.name, entry.data, { base64: true }));
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'extracted_objects.zip';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    };

    // ===== Extraction =====
    const extract = async () => {
        if (!base64Image) {
            showStatus('Please provide an image.', true);
            return;
        }

        setLoading(true);
        showStatus('Applying mask and generating multiple perspective views...');

        // Build masked image
        let imageToSend = base64Image;
        if (savedPath.length > 2) {
            const tempCanvas = document.createElement('canvas');
            const imgEl = new Image();
            imgEl.src = `data:image/png;base64,${base64Image}`;
            await new Promise<void>((r) => { imgEl.onload = () => r(); });

            tempCanvas.width = imgEl.naturalWidth;
            tempCanvas.height = imgEl.naturalHeight;
            const tCtx = tempCanvas.getContext('2d');
            if (tCtx) {
                tCtx.fillStyle = '#ffffff';
                tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tCtx.beginPath();
                tCtx.moveTo(savedPath[0].nx * tempCanvas.width, savedPath[0].ny * tempCanvas.height);
                for (let i = 1; i < savedPath.length; i++) {
                    tCtx.lineTo(savedPath[i].nx * tempCanvas.width, savedPath[i].ny * tempCanvas.height);
                }
                tCtx.closePath();
                tCtx.clip();
                tCtx.drawImage(imgEl, 0, 0);
                imageToSend = tempCanvas.toDataURL('image/png').split(',')[1];
            }
        }

        // Each extract run = one furniture item ("batch"). Tag its views and
        // snapshot the source image + analysis + dimensions so the Spec Sheet
        // can be built for this specific item later, even after extracting more.
        const batchId = `b${Date.now()}`;
        const dimsSnapshot: Dimensions = { ...dimensions };

        // Build views from custom or default
        let views: { id: string; instruction: string; dimensionGuide?: string }[] = DEFAULT_VIEWS;
        const customInputVal = customPrompt.trim();
        if (customInputVal) {
            const customList = customInputVal.split(',').map((s) => s.trim()).filter(Boolean);
            views = customList.map((v) => ({
                id: v.length > 25 ? v.substring(0, 25) + '...' : v,
                instruction: `Generate a realistic view of the isolated object focusing exactly on this perspective, style, or instruction: "${v}".`,
            }));
        }

        const hasDims = !!(dimensions.height || dimensions.width || dimensions.depth);
        const dimsToSend = hasDims ? dimensions : undefined;

        const baseObjectName = promptText || 'Isolated_Object';
        let sharedMetadata: Metadata = { object_name: baseObjectName, confidence_score: 0.95 };
        let metadataRendered = false;
        const newResults: ResultEntry[] = [];

        const promises = views.map(async (view, index) => {
            try {
                const body = {
                    imageToSend,
                    originalImage: index === 0 ? base64Image : undefined,
                    promptText,
                    viewInstruction: view.instruction,
                    dimensionGuide: view.dimensionGuide,
                    includeAnalysis: index === 0,
                    dimensions: dimsToSend,
                };
                const response = await fetch('/api/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                if (result.error) throw new Error(result.error);

                let parsedFromText: Metadata | null = null;
                if (result.textData) {
                    try {
                        const jsonStr = result.textData.match(/\{[\s\S]*\}/)?.[0] || result.textData;
                        parsedFromText = JSON.parse(jsonStr);
                    } catch {
                        // ignore
                    }
                }

                if (parsedFromText && !metadataRendered && (parsedFromText.specific_object_name || parsedFromText.object_category)) {
                    sharedMetadata = parsedFromText;
                    metadataRendered = true;
                    setMetadata(parsedFromText);
                }

                if (result.imageData) {
                    const objectName = sharedMetadata?.specific_object_name || sharedMetadata?.object_name || promptText || 'Isolated_Object';
                    const safeName = objectName.replace(/\s+/g, '_');
                    const viewName = view.id.replace(/\s+/g, '_');
                    newResults.push({
                        data: result.imageData,
                        name: `${safeName}_${viewName}_${index + 1}.png`,
                        label: view.id,
                        batchId,
                    });
                }
            } catch (error) {
                console.error(`Extraction error for ${view.id}:`, error);
            }
        });

        await Promise.all(promises);

        // Maintain view order
        newResults.sort((a, b) => {
            const aIdx = views.findIndex((v) => v.id === a.label);
            const bIdx = views.findIndex((v) => v.id === b.label);
            return aIdx - bIdx;
        });

        setLoading(false);

        if (newResults.length > 0) {
            const itemName = sharedMetadata?.specific_object_name || sharedMetadata?.object_name || promptText || 'Furniture Item';
            setBatches((prev) => ({
                ...prev,
                [batchId]: { id: batchId, name: itemName, sourceImage: imageToSend, metadata: sharedMetadata, dimensions: dimsSnapshot },
            }));
            setResults((prev) => [...newResults, ...prev]);
            showStatus('Extraction complete!');
        } else {
            showStatus('Failed to isolate object views. Please try a clearer selection or prompt.', true);
        }
    };

    // ===== Drag & drop =====
    const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
        e.preventDefault();
        dropZoneRef.current?.classList.add('oe-drop-over');
    };
    const onDragLeave: React.DragEventHandler<HTMLDivElement> = () => {
        dropZoneRef.current?.classList.remove('oe-drop-over');
    };
    const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
        e.preventDefault();
        dropZoneRef.current?.classList.remove('oe-drop-over');
        handleFile(e.dataTransfer.files[0]);
    };

    const onKeyEnter: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') extract();
    };

    useEffect(() => {
        if (!zoomEntry) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomEntry(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zoomEntry]);

    // ===== Spec Sheet selection =====
    // Furniture items still represented in the gallery, most recent first.
    const availableBatches = Object.values(batches)
        .filter((b) => b.sourceImage && results.some((r) => r.batchId === b.id))
        .reverse();

    const heroFor = (items: ResultEntry[]) =>
        items.find((r) => /3\/4\s*front/i.test(r.label)) || items.find((r) => /3\/4/i.test(r.label)) || items[0];

    const openSpecSheet = () => {
        if (availableBatches.length === 0) {
            showStatus('Extract an object first to build a spec sheet.', true);
            return;
        }
        if (availableBatches.length === 1) {
            setSpecBatchId(availableBatches[0].id);
            setSpecSheetOpen(true);
        } else {
            setSpecPickerOpen(true);
        }
    };

    const chooseSpecBatch = (id: string) => {
        setSpecBatchId(id);
        setSpecPickerOpen(false);
        setSpecSheetOpen(true);
    };

    const dimLabel = (d: Dimensions) =>
        [d.width, d.depth, d.height].some((v) => v != null)
            ? `W${d.width ?? '—'} × D${d.depth ?? '—'} × H${d.height ?? '—'} ${d.unit}`
            : 'No dimensions set';

    return (
        <div className="vw-pnl oe-root">
            <div className="vw-ph">
                <div className="vw-ph-t">Object Extractor</div>
                <div className="vw-ph-s">Select an object or describe it to isolate and extract using AI. Generate multi-view perspectives with Gemini.</div>
            </div>

            <div className="oe-grid">
                {/* Control column */}
                <div className="oe-col-controls">
                    <div className="vw-cd">
                        <div className="oe-section-title">1. Source Image</div>

                        <div
                            className="oe-drop-zone"
                            ref={dropZoneRef}
                            onClick={(e) => {
                                if ((e.target as HTMLElement).closest('.oe-image-wrapper')) return;
                                fileInputRef.current?.click();
                            }}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="oe-hidden"
                                onChange={(e) => handleFile(e.target.files?.[0])}
                            />
                            {!previewSrc ? (
                                <div className="oe-drop-placeholder">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span>Click, Drag, or Paste Image</span>
                                </div>
                            ) : (
                                <div className="oe-image-wrapper">
                                    <img ref={previewImgRef} src={previewSrc} alt="Preview" />
                                    <canvas ref={maskCanvasRef} className="oe-mask-canvas" />
                                </div>
                            )}
                        </div>

                        <div className="oe-section-title" style={{ marginTop: 16 }}>2. Object Details &amp; Selection</div>

                        <div className="oe-controls-stack">
                            <input
                                type="text"
                                className="vw-fi oe-input"
                                placeholder="What is the object? (e.g., 'chair')"
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                onKeyDown={onKeyEnter}
                            />

                            <input
                                type="text"
                                className="vw-fi oe-input oe-input-sm"
                                placeholder="Custom views/styles (e.g., 'front view, side view') [Optional]"
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                onKeyDown={onKeyEnter}
                            />

                            {previewSrc && !hasMask && (
                                <button className="oe-btn oe-btn-secondary" onClick={openLightbox}>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Draw Selection Mask (Optional)
                                </button>
                            )}

                            {hasMask && (
                                <div className="oe-mask-badge" title="Click to edit selection" onClick={openLightbox}>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Mask Applied
                                </div>
                            )}

                            <div className="oe-dims">
                                <div className="oe-dims-hd">
                                    <span>Dimensions (Optional)</span>
                                    <select
                                        className="oe-unit"
                                        value={dimensions.unit}
                                        onChange={(e) => setDimensions((d) => ({ ...d, unit: e.target.value }))}
                                    >
                                        <option value="in">in</option>
                                        <option value="cm">cm</option>
                                        <option value="mm">mm</option>
                                        <option value="ft">ft</option>
                                        <option value="m">m</option>
                                    </select>
                                </div>
                                <div className="oe-dims-grid">
                                    <input
                                        type="number"
                                        className="vw-fi oe-input oe-input-sm"
                                        placeholder="Height"
                                        min={0}
                                        step="any"
                                        value={dimensions.height ?? ''}
                                        onChange={(e) => setDimensions((d) => ({ ...d, height: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                                    />
                                    <input
                                        type="number"
                                        className="vw-fi oe-input oe-input-sm"
                                        placeholder="Width"
                                        min={0}
                                        step="any"
                                        value={dimensions.width ?? ''}
                                        onChange={(e) => setDimensions((d) => ({ ...d, width: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                                    />
                                    <input
                                        type="number"
                                        className="vw-fi oe-input oe-input-sm"
                                        placeholder="Depth"
                                        min={0}
                                        step="any"
                                        value={dimensions.depth ?? ''}
                                        onChange={(e) => setDimensions((d) => ({ ...d, depth: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                                    />
                                </div>
                                <div className="oe-dims-hint">
                                    The AI draws dimension lines and your exact values into each result. To change values, edit the fields and click Extract again.
                                </div>
                            </div>

                            <button className="oe-btn oe-btn-primary" onClick={extract} disabled={loading}>
                                {loading ? 'Extracting…' : 'Extract Object Views'}
                            </button>

                            {previewSrc && (
                                <button className="oe-btn oe-btn-ghost" onClick={resetAll} disabled={loading}>
                                    Reset All
                                </button>
                            )}
                        </div>

                        {status && (
                            <div className={`oe-status ${status.error ? 'error' : 'info'}`}>{status.msg}</div>
                        )}
                    </div>

                    {metadata && (
                        <div className="vw-cd oe-json">
                            <div className="oe-section-title-sm">Analysis</div>
                            <div className="oe-json-output">
                                <pre>{JSON.stringify(metadata, null, 2)}</pre>
                            </div>
                        </div>
                    )}
                </div>

                {/* Gallery column */}
                <div className="vw-cd oe-gallery">
                    <div className="oe-gallery-hd">
                        <div className="oe-gallery-title">Multi-View Results</div>
                        <div className="oe-gallery-tools">
                            {results.length > 0 && (
                                <span className="oe-count">{results.length} Items</span>
                            )}
                            {results.length > 0 && (
                                <button className="oe-btn-toolbar danger" onClick={clearResults}>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Clear
                                </button>
                            )}
                            {results.length > 0 && (
                                <button className="oe-btn-toolbar" onClick={downloadAll}>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download All Zip
                                </button>
                            )}
                            {results.length > 0 && availableBatches.length > 0 && (
                                <button className="oe-btn-toolbar accent" onClick={openSpecSheet} title="Build an FF&E spec sheet + editable DXF (CAD) drawing for a chosen furniture item">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2M7 7h10M7 11h4M4 4h16v16H4z" />
                                    </svg>
                                    Spec Sheet (DWG){availableBatches.length > 1 ? ` · ${availableBatches.length}` : ''}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="oe-result-container">
                        {results.length === 0 && !loading && (
                            <div className="oe-waiting">Isolated object views will appear here…</div>
                        )}
                        {loading && (
                            <div className="oe-loading">
                                <div className="oe-loader" />
                                <div className="oe-loading-text">Analyzing mask and rendering views…</div>
                            </div>
                        )}
                        <div className="oe-grid-cards">
                            {results.map((entry, idx) => (
                                <div className="oe-card" key={`${entry.name}-${idx}`} onClick={() => setZoomEntry(entry)}>
                                    <img src={`data:image/png;base64,${entry.data}`} alt={entry.label} />
                                    <div className="oe-card-label">{entry.label}</div>
                                    <div className="oe-card-actions" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            className="oe-card-btn"
                                            onClick={(e) => { e.stopPropagation(); downloadSingle(entry); }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="oe-card-btn primary"
                                            onClick={(e) => { e.stopPropagation(); setDimensioningEntry(entry); }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                                <line x1="12" y1="22.08" x2="12" y2="12" />
                                            </svg>
                                            Add Dimensions
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {lightboxOpen && (
                <div className="oe-lightbox">
                    <div className="oe-lightbox-backdrop" onClick={() => setLightboxOpen(false)} />
                    <div className="oe-lightbox-container">
                        <div className="oe-lightbox-hd">
                            <div>
                                <h3>Draw around the object</h3>
                                <p>Everything outside the line will be blacked out.</p>
                            </div>
                            <div className="oe-lightbox-actions">
                                <button className="oe-lightbox-clear" onClick={clearDrawing}>Clear</button>
                                <button className="oe-lightbox-done" onClick={doneDrawing}>Done</button>
                            </div>
                        </div>
                        <div className="oe-lightbox-body">
                            <div className="oe-lightbox-image-container">
                                <img ref={lightboxImgRef} src={previewSrc} draggable={false} alt="Source" />
                                <canvas
                                    ref={drawingCanvasRef}
                                    className="oe-drawing-canvas"
                                    onMouseDown={startDraw}
                                    onMouseMove={moveDraw}
                                    onTouchStart={startDraw}
                                    onTouchMove={moveDraw}
                                    onTouchEnd={stopDraw}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Dimension Editor */}
            {dimensioningEntry && (
                <DimensionEditor
                    initialImageSrc={`data:image/png;base64,${dimensioningEntry.data}`}
                    initialFileName={dimensioningEntry.name.replace(/\.png$/i, '')}
                    onClose={() => setDimensioningEntry(null)}
                />
            )}

            {/* Furniture-item picker (when more than one item is in the gallery) */}
            {specPickerOpen && (
                <div className="oe-zoom oe-picker-overlay" role="dialog" aria-modal="true" onClick={() => setSpecPickerOpen(false)}>
                    <div className="oe-picker" onClick={(e) => e.stopPropagation()}>
                        <div className="oe-picker-hd">
                            <div>
                                <h3>Choose a furniture item</h3>
                                <p>Build the spec sheet &amp; DXF for which item?</p>
                            </div>
                            <button type="button" className="oe-picker-close" onClick={() => setSpecPickerOpen(false)} aria-label="Close">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="oe-picker-grid">
                            {availableBatches.map((b) => {
                                const items = results.filter((r) => r.batchId === b.id);
                                const hero = heroFor(items);
                                return (
                                    <button type="button" className="oe-picker-card" key={b.id} onClick={() => chooseSpecBatch(b.id)}>
                                        {hero ? <img src={`data:image/png;base64,${hero.data}`} alt={b.name} /> : <div className="oe-picker-noimg">No view</div>}
                                        <div className="oe-picker-name">{b.name}</div>
                                        <div className="oe-picker-dims">{dimLabel(b.dimensions)}</div>
                                        <div className="oe-picker-count">{items.length} view{items.length === 1 ? '' : 's'}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* FF&E Spec Sheet + DXF export */}
            {specSheetOpen && specBatchId && batches[specBatchId] && (() => {
                const batch = batches[specBatchId];
                const items = results.filter((r) => r.batchId === batch.id);
                const heroOptions = items.map((r) => ({ label: r.label, src: `data:image/png;base64,${r.data}` }));
                const hero = heroFor(items);
                return (
                    <SpecSheet
                        heroOptions={heroOptions}
                        initialHero={hero ? `data:image/png;base64,${hero.data}` : ''}
                        sourceImage={batch.sourceImage}
                        metadata={batch.metadata}
                        dimensions={batch.dimensions}
                        defaultName={batch.name}
                        onClose={() => { setSpecSheetOpen(false); setSpecBatchId(null); }}
                    />
                );
            })()}

            {/* Zoom overlay */}
            {zoomEntry && (
                <div className="oe-zoom" role="dialog" aria-modal="true" onClick={() => setZoomEntry(null)}>
                    <button
                        type="button"
                        className="oe-zoom-close"
                        onClick={(e) => { e.stopPropagation(); setZoomEntry(null); }}
                        aria-label="Close"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                    <img
                        className="oe-zoom-img"
                        src={`data:image/png;base64,${zoomEntry.data}`}
                        alt={zoomEntry.label}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div className="oe-zoom-caption" onClick={(e) => e.stopPropagation()}>{zoomEntry.label}</div>
                </div>
            )}
        </div>
    );
}
