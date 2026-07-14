"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './dimensionEditor.css';

type Point = { x: number; y: number };
type Gizmo = { start: Point; end: Point; color: string };
type GizmoKey = 'w' | 'l' | 'h' | 'sh';
type DragNode = { key: GizmoKey; type: 'node'; point: 'start' | 'end' };
type DragLine = { key: GizmoKey; type: 'line'; lastPos: Point };
type DragState = DragNode | DragLine | null;
type Bounds = { minX: number; maxX: number; minY: number; maxY: number; bottomPt: Point };

const COLORS: Record<GizmoKey, string> = {
    w: '#ef4444',
    l: '#10b981',
    h: '#3b82f6',
    sh: '#a855f7',
};

const UNITS: { value: string; label: string }[] = [
    { value: 'mm', label: 'mm' },
    { value: 'cm', label: 'cm' },
    { value: 'm', label: 'm' },
    { value: 'in', label: 'inches' },
    { value: 'ft', label: 'feet' },
];

interface DimensionEditorProps {
    initialImageSrc: string;
    initialFileName: string;
    onClose: () => void;
}

export default function DimensionEditor({ initialImageSrc, initialFileName, onClose }: DimensionEditorProps) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
    const [dimensions, setDimensions] = useState<{ w: string; l: string; h: string; sh: string; unit: string }>({
        w: '', l: '', h: '', sh: '', unit: 'mm',
    });
    const [showSeatHeight, setShowSeatHeight] = useState(false);
    const [originalFileName, setOriginalFileName] = useState('');
    const [gizmos, setGizmos] = useState<Record<GizmoKey, Gizmo>>({
        w: { start: { x: 385, y: 370 }, end: { x: 200, y: 450 }, color: COLORS.w },
        l: { start: { x: 415, y: 370 }, end: { x: 600, y: 450 }, color: COLORS.l },
        h: { start: { x: 400, y: 345 }, end: { x: 400, y: 120 }, color: COLORS.h },
        sh: { start: { x: 600, y: 345 }, end: { x: 600, y: 220 }, color: COLORS.sh },
    });
    const [dragging, setDragging] = useState<DragState>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ===== Bounds detection =====
    const detectObjectBounds = useCallback((imgEl: HTMLImageElement, width: number, height: number): Bounds | null => {
        try {
            const c = document.createElement('canvas');
            c.width = width;
            c.height = height;
            const cx = c.getContext('2d');
            if (!cx) return null;
            cx.drawImage(imgEl, 0, 0, width, height);
            const data = cx.getImageData(0, 0, width, height).data;

            const insetX = Math.floor(width * 0.05);
            const insetY = Math.floor(height * 0.05);
            const getP = (x: number, y: number) => {
                const i = (y * width + x) * 4;
                return [data[i], data[i + 1], data[i + 2]];
            };
            const corners = [
                getP(insetX, insetY),
                getP(width - insetX, insetY),
                getP(insetX, height - insetY),
                getP(width - insetX, height - insetY),
            ];
            let bgR = 0, bgG = 0, bgB = 0;
            corners.forEach((c2) => { bgR += c2[0]; bgG += c2[1]; bgB += c2[2]; });
            bgR /= 4; bgG /= 4; bgB /= 4;

            let minX = width, maxX = 0, minY = height, maxY = 0;
            let bottomPt: Point = { x: 0, y: 0 };
            const threshold = 25;
            for (let y = 0; y < height; y += 2) {
                for (let x = 0; x < width; x += 2) {
                    const i = (y * width + x) * 4;
                    const alpha = data[i + 3];
                    if (alpha < 20) continue;
                    const diff = (Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB)) / 3;
                    if (diff > threshold) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) { maxY = y; bottomPt = { x, y }; }
                    }
                }
            }
            if (minX >= maxX || minY >= maxY) return null;
            if (maxX - minX > width * 0.98 && maxY - minY > height * 0.98) return null;
            return { minX, maxX, minY, maxY, bottomPt };
        } catch {
            return null;
        }
    }, []);

    const applyBoundsToGizmos = useCallback((bounds: Bounds, w: number) => {
        const { minX, maxX, minY, maxY, bottomPt } = bounds;
        const pad = Math.max(30, w * 0.05);
        let centerX = bottomPt.x;
        if (centerX < minX + (maxX - minX) * 0.2 || centerX > maxX - (maxX - minX) * 0.2) {
            centerX = (minX + maxX) / 2;
        }
        const leftCornerX = minX - pad;
        const leftCornerY = maxY + pad;
        const centerJointY = maxY + pad * 2.5;
        const seatHeightY = maxY - (maxY - minY) * 0.4;

        setGizmos({
            h: { start: { x: leftCornerX, y: leftCornerY - 15 }, end: { x: leftCornerX, y: minY }, color: COLORS.h },
            w: { start: { x: leftCornerX + 15, y: leftCornerY + 5 }, end: { x: centerX - 15, y: centerJointY }, color: COLORS.w },
            l: { start: { x: centerX + 15, y: centerJointY }, end: { x: maxX + pad, y: maxY + pad }, color: COLORS.l },
            sh: { start: { x: maxX + pad, y: maxY + pad - 15 }, end: { x: maxX + pad, y: seatHeightY }, color: COLORS.sh },
        });
    }, []);

    const resetGizmos = useCallback((w?: number, h?: number) => {
        const cw = w ?? canvasSize.width;
        const ch = h ?? canvasSize.height;
        const ox = cw * 0.5;
        const oy = ch * 0.6;
        setGizmos({
            w: { start: { x: ox - 15, y: oy + 10 }, end: { x: cw * 0.25, y: ch * 0.75 }, color: COLORS.w },
            l: { start: { x: ox + 15, y: oy + 10 }, end: { x: cw * 0.75, y: ch * 0.75 }, color: COLORS.l },
            h: { start: { x: ox, y: oy - 15 }, end: { x: ox, y: ch * 0.2 }, color: COLORS.h },
            sh: { start: { x: cw * 0.75 + 30, y: ch * 0.75 - 15 }, end: { x: cw * 0.75 + 30, y: ch * 0.4 }, color: COLORS.sh },
        });
    }, [canvasSize.width, canvasSize.height]);

    // ===== Image load + padding =====
    const processImageSource = useCallback((src: string, fileName = 'image') => {
        setOriginalFileName(fileName);
        setDimensions((prev) => ({ ...prev, w: '', l: '', h: '', sh: '' }));

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const MAX_DIM = 1000;
            let w = img.width;
            let h = img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
                if (w > h) { h = Math.floor((MAX_DIM / w) * h); w = MAX_DIM; }
                else { w = Math.floor((MAX_DIM / h) * w); h = MAX_DIM; }
            } else {
                w = Math.floor(w);
                h = Math.floor(h);
            }
            const padding = Math.max(100, Math.floor(Math.max(w, h) * 0.25));
            const paddedW = w + padding * 2;
            const paddedH = h + padding * 2;

            // Sample background color from corners of the source
            const cc = document.createElement('canvas');
            cc.width = w;
            cc.height = h;
            const ccx = cc.getContext('2d');
            if (!ccx) return;
            ccx.drawImage(img, 0, 0, w, h);
            const cd = ccx.getImageData(0, 0, w, h).data;
            const getP = (x: number, y: number) => {
                const i = (y * w + x) * 4;
                return [cd[i], cd[i + 1], cd[i + 2], cd[i + 3]];
            };
            const x1 = Math.min(2, w - 1), x2 = Math.max(0, w - 3);
            const y1 = Math.min(2, h - 1), y2 = Math.max(0, h - 3);
            const c1 = getP(x1, y1), c2 = getP(x2, y1), c3 = getP(x1, y2), c4 = getP(x2, y2);
            const bgR = Math.round((c1[0] + c2[0] + c3[0] + c4[0]) / 4);
            const bgG = Math.round((c1[1] + c2[1] + c3[1] + c4[1]) / 4);
            const bgB = Math.round((c1[2] + c2[2] + c3[2] + c4[2]) / 4);
            const bgA = Math.round((c1[3] + c2[3] + c3[3] + c4[3]) / 4);

            const padded = document.createElement('canvas');
            padded.width = paddedW;
            padded.height = paddedH;
            const pCtx = padded.getContext('2d');
            if (!pCtx) return;
            if (bgA > 20) {
                pCtx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${bgA / 255})`;
                pCtx.fillRect(0, 0, paddedW, paddedH);
            }
            pCtx.drawImage(img, padding, padding, w, h);

            const baked = new Image();
            baked.onload = () => {
                setCanvasSize({ width: paddedW, height: paddedH });
                setImage(baked);
                const bounds = detectObjectBounds(baked, paddedW, paddedH);
                if (bounds) applyBoundsToGizmos(bounds, paddedW);
                else resetGizmos(paddedW, paddedH);
            };
            baked.src = padded.toDataURL('image/png');
        };
        img.src = src;
    }, [detectObjectBounds, applyBoundsToGizmos, resetGizmos]);

    useEffect(() => {
        if (initialImageSrc) {
            processImageSource(initialImageSrc, initialFileName || 'extracted_object');
        }
    }, [initialImageSrc, initialFileName, processImageSource]);

    const processFile = useCallback((file: File | null | undefined) => {
        if (!file || !file.type.startsWith('image/')) return;
        const baseName = file.name ? file.name.substring(0, file.name.lastIndexOf('.')) || file.name : 'image';
        const url = URL.createObjectURL(file);
        processImageSource(url, baseName);
    }, [processImageSource]);

    // Esc to close
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Paste an image directly into the editor
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    processFile(items[i].getAsFile());
                    break;
                }
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [processFile]);

    // ===== Drawing =====
    const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, isExport = false) => {
        ctx.clearRect(0, 0, width, height);

        if (image) {
            ctx.drawImage(image, 0, 0, width, height);
        } else {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, width, height);
            return;
        }

        const activeKeys: GizmoKey[] = ['w', 'l', 'h'];
        if (showSeatHeight) activeKeys.push('sh');

        // Group centroid — used to push labels OUTWARDS away from the gizmo cluster.
        let cx = 0, cy = 0;
        activeKeys.forEach((k) => {
            cx += gizmos[k].start.x + gizmos[k].end.x;
            cy += gizmos[k].start.y + gizmos[k].end.y;
        });
        cx /= (activeKeys.length * 2);
        cy /= (activeKeys.length * 2);

        activeKeys.forEach((key) => {
            const line = gizmos[key];
            const val = dimensions[key];
            const drawColor = isExport ? '#000000' : line.color;

            const arrowLen = 14;
            const arrowAngle = Math.PI / 7;
            const angleEnd = Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x);
            const angleStart = Math.atan2(line.start.y - line.end.y, line.start.x - line.end.x);

            const drawArrowPath = () => {
                ctx.beginPath();
                ctx.moveTo(line.start.x, line.start.y);
                ctx.lineTo(line.end.x, line.end.y);

                ctx.moveTo(line.end.x, line.end.y);
                ctx.lineTo(line.end.x - arrowLen * Math.cos(angleEnd - arrowAngle), line.end.y - arrowLen * Math.sin(angleEnd - arrowAngle));
                ctx.moveTo(line.end.x, line.end.y);
                ctx.lineTo(line.end.x - arrowLen * Math.cos(angleEnd + arrowAngle), line.end.y - arrowLen * Math.sin(angleEnd + arrowAngle));

                ctx.moveTo(line.start.x, line.start.y);
                ctx.lineTo(line.start.x - arrowLen * Math.cos(angleStart - arrowAngle), line.start.y - arrowLen * Math.sin(angleStart - arrowAngle));
                ctx.moveTo(line.start.x, line.start.y);
                ctx.lineTo(line.start.x - arrowLen * Math.cos(angleStart + arrowAngle), line.start.y - arrowLen * Math.sin(angleStart + arrowAngle));
            };

            // White halo behind the colored arrow (screen only — keeps export clean)
            if (!isExport) {
                drawArrowPath();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }

            drawArrowPath();
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = isExport ? 2 : 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Endpoint node handles (screen only)
            if (!isExport) {
                [line.start, line.end].forEach((pt) => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = line.color;
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = line.color;
                    ctx.fill();
                });
            }

            // Value label
            if (val) {
                const text = `${val} ${dimensions.unit}`;
                ctx.font = 'bold 22px Arial, sans-serif';

                const midX = (line.start.x + line.end.x) / 2;
                const midY = (line.start.y + line.end.y) / 2;

                let nx = 0, ny = 0;
                const dx = line.end.x - line.start.x;
                const dy = line.end.y - line.start.y;
                const len = Math.hypot(dx, dy);

                if (len > 0) {
                    nx = -dy / len;
                    ny = dx / len;
                    const outX = midX - cx;
                    const outY = midY - cy;
                    if (nx * outX + ny * outY < 0) { nx = -nx; ny = -ny; }
                }

                const textWidth = ctx.measureText(text).width;
                let offsetDist = 20;
                let angle = 0;

                if (key === 'h' || key === 'sh') {
                    angle = 0;
                    offsetDist = 15 + (textWidth / 2) * Math.abs(nx) + 11 * Math.abs(ny);
                } else {
                    angle = Math.atan2(dy, dx);
                    if (angle > Math.PI / 2) angle -= Math.PI;
                    if (angle < -Math.PI / 2) angle += Math.PI;
                    offsetDist = 20;
                }

                const textX = midX + nx * offsetDist;
                const textY = midY + ny * offsetDist;

                ctx.save();
                ctx.translate(textX, textY);
                ctx.rotate(angle);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = drawColor;
                ctx.fillText(text, 0, 0);
                ctx.restore();
            }
        });
    }, [image, gizmos, dimensions, showSeatHeight]);

    useEffect(() => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) draw(ctx, canvasSize.width, canvasSize.height);
        }
    }, [draw, canvasSize]);

    // ===== Pointer interaction =====
    const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const distance = (p1: Point, p2: Point) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

    const distToSegment = (p: Point, v: Point, w: Point) => {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return distance(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!image) return;
        const pos = getPos(e);
        const activeKeys: GizmoKey[] = ['w', 'l', 'h'];
        if (showSeatHeight) activeKeys.push('sh');

        let hit: DragState = null;

        // Endpoint nodes first
        for (const key of activeKeys) {
            if (distance(pos, gizmos[key].start) < 25) { hit = { key, type: 'node', point: 'start' }; break; }
            if (distance(pos, gizmos[key].end) < 25) { hit = { key, type: 'node', point: 'end' }; break; }
        }
        // Then the line itself
        if (!hit) {
            for (const key of activeKeys) {
                if (distToSegment(pos, gizmos[key].start, gizmos[key].end) < 20) {
                    hit = { key, type: 'line', lastPos: pos };
                    break;
                }
            }
        }

        if (hit) {
            setDragging(hit);
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dragging || !image) return;
        const pos = getPos(e);
        if (dragging.type === 'node') {
            const node = dragging;
            setGizmos((prev) => ({
                ...prev,
                [node.key]: {
                    ...prev[node.key],
                    [node.point]: pos,
                },
            }));
        } else {
            const line = dragging;
            const dx = pos.x - line.lastPos.x;
            const dy = pos.y - line.lastPos.y;
            setGizmos((prev) => {
                const g = prev[line.key];
                return {
                    ...prev,
                    [line.key]: {
                        ...g,
                        start: { x: g.start.x + dx, y: g.start.y + dy },
                        end: { x: g.end.x + dx, y: g.end.y + dy },
                    },
                };
            });
            setDragging({ ...line, lastPos: pos });
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (dragging) {
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            setDragging(null);
        }
    };

    // ===== Drop zone in editor =====
    const onDropFile: React.DragEventHandler<HTMLLabelElement> = (e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    };

    // ===== Save =====
    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        draw(ctx, canvasSize.width, canvasSize.height, true);
        const link = document.createElement('a');
        link.download = originalFileName ? `${originalFileName}_dim.png` : 'dimensioned-image_dim.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        // Repaint with on-screen styling
        draw(ctx, canvasSize.width, canvasSize.height, false);
    };

    const handleAutoDetect = () => {
        if (!image) return;
        const bounds = detectObjectBounds(image, canvasSize.width, canvasSize.height);
        if (bounds) applyBoundsToGizmos(bounds, canvasSize.width);
        else resetGizmos();
    };

    // ===== Render =====
    return (
        <div className="de-overlay" role="dialog" aria-modal="true">
            <div className="de-shell">
                <header className="de-topbar">
                    <div className="de-topbar-left">
                        <button className="de-back" onClick={onClose} aria-label="Back to gallery">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12" />
                                <polyline points="12 19 5 12 12 5" />
                            </svg>
                            Back
                        </button>
                        <h1 className="de-title">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            Dimensio
                        </h1>
                    </div>
                    <button className="de-close" onClick={onClose} aria-label="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </header>

                <main className="de-main">
                    <aside className="de-panel">
                        <section className="de-card">
                            <h2 className="de-card-title">1. Upload Image</h2>
                            <label
                                className={`de-drop ${isDraggingFile ? 'is-over' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
                                onDrop={onDropFile}
                            >
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span className="de-drop-main">Click, drop, or paste</span>
                                <span className="de-drop-sub">any image file</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="de-hidden"
                                    onChange={(e) => processFile(e.target.files?.[0])}
                                />
                            </label>
                        </section>

                        <section className="de-card">
                            <h2 className="de-card-title">2. Set Dimensions</h2>

                            <div className="de-field">
                                <label>Unit</label>
                                <select
                                    className="de-input"
                                    value={dimensions.unit}
                                    onChange={(e) => setDimensions({ ...dimensions, unit: e.target.value })}
                                >
                                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>

                            <div className="de-rows">
                                <div className="de-row">
                                    <span className="de-swatch" style={{ background: COLORS.w }} />
                                    <label>Width (W)</label>
                                    <input className="de-input" placeholder="e.g. 15.5" value={dimensions.w} onChange={(e) => setDimensions({ ...dimensions, w: e.target.value })} />
                                </div>
                                <div className="de-row">
                                    <span className="de-swatch" style={{ background: COLORS.l }} />
                                    <label>Length (L)</label>
                                    <input className="de-input" placeholder="e.g. 18.0" value={dimensions.l} onChange={(e) => setDimensions({ ...dimensions, l: e.target.value })} />
                                </div>
                                <div className="de-row">
                                    <span className="de-swatch" style={{ background: COLORS.h }} />
                                    <label>Height (H)</label>
                                    <input className="de-input" placeholder="e.g. 32.0" value={dimensions.h} onChange={(e) => setDimensions({ ...dimensions, h: e.target.value })} />
                                </div>

                                <div className="de-divider">
                                    <span className="de-divider-label">Optional</span>
                                    <label className="de-switch">
                                        <span>Seat Height</span>
                                        <input
                                            type="checkbox"
                                            checked={showSeatHeight}
                                            onChange={(e) => setShowSeatHeight(e.target.checked)}
                                        />
                                        <span className={`de-switch-track ${showSeatHeight ? 'on' : ''}`}>
                                            <span className="de-switch-thumb" />
                                        </span>
                                    </label>
                                </div>

                                {showSeatHeight && (
                                    <div className="de-row">
                                        <span className="de-swatch" style={{ background: COLORS.sh }} />
                                        <label>Seat (SH)</label>
                                        <input className="de-input" placeholder="e.g. 18.0" value={dimensions.sh} onChange={(e) => setDimensions({ ...dimensions, sh: e.target.value })} />
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="de-actions">
                            <button className="de-btn de-btn-secondary" onClick={handleAutoDetect} disabled={!image}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
                                    <path d="m14 7 3 3" />
                                </svg>
                                Auto-Detect Object
                            </button>
                            <button className="de-btn de-btn-secondary" onClick={() => resetGizmos()} disabled={!image}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10" />
                                    <polyline points="1 20 1 14 7 14" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                                Reset Lines
                            </button>
                            <button className="de-btn de-btn-primary" onClick={handleSave} disabled={!image}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Save Image
                            </button>
                        </div>
                    </aside>

                    <section className="de-stage">
                        {!image && (
                            <div className="de-empty">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                                <p className="de-empty-main">No Image Loaded</p>
                                <p className="de-empty-sub">Wait for object extraction...</p>
                            </div>
                        )}

                        {image && (
                            <div className="de-hint">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="5 9 2 12 5 15" />
                                    <polyline points="9 5 12 2 15 5" />
                                    <polyline points="19 9 22 12 19 15" />
                                    <polyline points="9 19 12 22 15 19" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <line x1="12" y1="2" x2="12" y2="22" />
                                </svg>
                                Drag the lines or node circles to adjust positions
                            </div>
                        )}

                        <canvas
                            ref={canvasRef}
                            width={canvasSize.width}
                            height={canvasSize.height}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                            className="de-canvas"
                            style={{
                                cursor: dragging ? 'grabbing' : image ? 'crosshair' : 'default',
                                opacity: image ? 1 : 0,
                            }}
                        />
                    </section>
                </main>
            </div>
        </div>
    );
}
