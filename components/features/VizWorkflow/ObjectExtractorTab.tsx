"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import './objectExtractor.css';

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
};

type Metadata = {
    specific_object_name?: string;
    object_name?: string;
    object_category?: string;
    [key: string]: any;
};

const DEFAULT_VIEWS = [
    {
        id: 'Front View',
        instruction:
            'Render the object as a STRAIGHT-ON FRONT VIEW (camera positioned dead-center in front of the object, perpendicular to its front face, at eye level). Only the FRONT face should be visible; the sides and back should NOT be visible. This is a clean head-on product shot.',
    },
    {
        id: 'Side Profile',
        instruction:
            'Render the object as a PURE 90° SIDE PROFILE (camera positioned directly to the RIGHT side of the object, perpendicular to its front). Only ONE SIDE should be visible; the front and back should NOT be visible. This MUST be a clean side silhouette, completely different from the front view.',
    },
    {
        id: '3/4 Back View',
        instruction:
            'Render the object ROTATED so the camera sees it from a 3/4 BACK-RIGHT angle (camera positioned roughly 150° from dead-center front — behind and to the right of the object, at eye level). The BACK and the RIGHT side must be the dominant visible surfaces. This view MUST show the object from behind, not from the front.',
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
        clearStatus();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const clearResults = () => {
        setResults([]);
        setMetadata(null);
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
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'extracted_objects.zip';
        link.click();
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

        // Build views from custom or default
        let views = DEFAULT_VIEWS;
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

    const openResultInNewTab = (entry: ResultEntry) => {
        const newTab = window.open();
        if (!newTab) return;
        const imgSrc = `data:image/png;base64,${entry.data}`;
        newTab.document.body.innerHTML = `<style>body{margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh}img{max-width:100%;max-height:100vh;background:#171715;padding:20px;border-radius:8px}</style><img src="${imgSrc}">`;
    };

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
                                <div className="oe-card" key={`${entry.name}-${idx}`} onClick={() => openResultInNewTab(entry)}>
                                    <img src={`data:image/png;base64,${entry.data}`} alt={entry.label} />
                                    <div className="oe-card-label">{entry.label}</div>
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
        </div>
    );
}
