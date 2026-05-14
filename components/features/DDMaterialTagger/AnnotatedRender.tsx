"use client";
import React, { useState, useRef, useCallback } from 'react';
import { MaterialAnnotation } from '../VizWorkflow/constants';

interface Props {
    imageData: string;
    annotations: MaterialAnnotation[];
    onUpdateAnnotation: (id: string, x: number, y: number) => void;
    onEditAnnotation: (id: string, code: string, note?: string) => void;
    onDeleteAnnotation: (id: string) => void;
    onAddAnnotation: (code: string, x: number, y: number) => void;
    onFullscreen?: () => void;
    flatLay?: boolean;
}

export default function AnnotatedRender({
    imageData,
    annotations,
    onUpdateAnnotation,
    onEditAnnotation,
    onDeleteAnnotation,
    onAddAnnotation,
    onFullscreen,
    flatLay = false,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<{ id: string; startMouseX: number; startMouseY: number; origX: number; origY: number } | null>(null);
    const [, forceUpdate] = useState(0);
    const [addMode, setAddMode] = useState(false);
    const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
    const [newCode, setNewCode] = useState("");
    const [zoom, setZoom] = useState(1);
    const [labelScale, setLabelScale] = useState(1);
    const [detailedColor, setDetailedColor] = useState(false);
    const newCodeInputRef = useRef<HTMLInputElement>(null);

    const getRelativePos = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 50, y: 50 };
        return {
            x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
            y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
        };
    }, []);

    const handleLabelMouseDown = (e: React.MouseEvent, ann: MaterialAnnotation) => {
        e.stopPropagation();
        e.preventDefault();
        draggingRef.current = { id: ann.id, startMouseX: e.clientX, startMouseY: e.clientY, origX: ann.x, origY: ann.y };

        const onMouseMove = (ev: MouseEvent) => {
            if (!draggingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const dx = ((ev.clientX - draggingRef.current.startMouseX) / rect.width) * 100;
            const dy = ((ev.clientY - draggingRef.current.startMouseY) / rect.height) * 100;
            const newX = Math.max(0, Math.min(100, draggingRef.current.origX + dx));
            const newY = Math.max(0, Math.min(100, draggingRef.current.origY + dy));
            onUpdateAnnotation(draggingRef.current.id, newX, newY);
        };

        const onMouseUp = () => {
            draggingRef.current = null;
            forceUpdate(n => n + 1);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleContainerClick = (e: React.MouseEvent) => {
        if (draggingRef.current) return;
        if (!addMode) {
            onFullscreen?.();
            return;
        }
        const pos = getRelativePos(e.clientX, e.clientY);
        setPendingPos(pos);
        setNewCode("");
        setTimeout(() => newCodeInputRef.current?.focus(), 50);
    };

    const confirmAdd = () => {
        if (!newCode.trim() || !pendingPos) return;
        onAddAnnotation(newCode.trim().toUpperCase(), pendingPos.x, pendingPos.y);
        setPendingPos(null);
        setNewCode("");
    };

    const cancelAdd = () => {
        setPendingPos(null);
        setNewCode("");
    };

    const changeZoom = (delta: number) => {
        setZoom(prev => Math.max(1, Math.min(3, Math.round((prev + delta) * 100) / 100)));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                    onClick={() => { setAddMode(a => !a); setPendingPos(null); }}
                    style={{
                        background: addMode ? '#ccff00' : 'var(--card)',
                        color: addMode ? '#000' : 'var(--tx2)',
                        border: `1px solid ${addMode ? '#ccff00' : 'var(--bdr)'}`,
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                    }}
                >
                    <span style={{ fontSize: 13 }}>+</span>
                    {addMode ? 'Click image to place label' : 'Add Label'}
                </button>
                <span style={{ fontSize: 9, color: 'var(--tx3)' }}>
                    {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} | drag to reposition | edit or delete labels
                </span>
                <button
                    onClick={() => setLabelScale(prev => prev > 1 ? 1 : 1.75)}
                    style={{
                        background: labelScale > 1 ? '#ccff00' : 'var(--card)',
                        color: labelScale > 1 ? '#000' : 'var(--tx2)',
                        border: `1px solid ${labelScale > 1 ? '#ccff00' : 'var(--bdr)'}`,
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                    title="Toggle larger tag labels"
                >
                    {labelScale > 1 ? 'Tags 175%' : 'Zoom Tags'}
                </button>
                <button
                    onClick={() => setDetailedColor(v => !v)}
                    style={{
                        background: detailedColor ? '#ccff00' : 'var(--card)',
                        color: detailedColor ? '#000' : 'var(--tx2)',
                        border: `1px solid ${detailedColor ? '#ccff00' : 'var(--bdr)'}`,
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                    title={detailedColor ? 'Switch back to 2-color tags (material vs furniture)' : 'Give each category (tile, glass, stone, seating, ...) its own color'}
                >
                    {detailedColor ? 'Colors: Detailed' : 'Colors: Default'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                    <button
                        onClick={() => changeZoom(-0.25)}
                        disabled={zoom <= 1}
                        style={{ background: 'var(--card)', color: 'var(--tx2)', border: '1px solid var(--bdr)', borderRadius: 4, width: 24, height: 24, fontSize: 13, fontWeight: 700, cursor: zoom <= 1 ? 'not-allowed' : 'pointer', opacity: zoom <= 1 ? 0.45 : 1 }}
                        title="Zoom out"
                    >
                        -
                    </button>
                    <button
                        onClick={() => setZoom(1)}
                        style={{ background: zoom === 1 ? 'var(--bg3)' : 'var(--card)', color: 'var(--tx2)', border: '1px solid var(--bdr)', borderRadius: 4, minWidth: 42, height: 24, fontSize: 9, fontWeight: 600, cursor: 'pointer' }}
                        title="Reset zoom"
                    >
                        {Math.round(zoom * 100)}%
                    </button>
                    <button
                        onClick={() => changeZoom(0.25)}
                        disabled={zoom >= 3}
                        style={{ background: 'var(--card)', color: 'var(--tx2)', border: '1px solid var(--bdr)', borderRadius: 4, width: 24, height: 24, fontSize: 13, fontWeight: 700, cursor: zoom >= 3 ? 'not-allowed' : 'pointer', opacity: zoom >= 3 ? 0.45 : 1 }}
                        title="Zoom in"
                    >
                        +
                    </button>
                </div>
            </div>

            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    borderRadius: 8,
                    overflow: zoom > 1 ? 'auto' : 'hidden',
                    border: addMode ? '2px solid #ccff00' : '1px solid var(--bdr)',
                    userSelect: 'none',
                    maxHeight: zoom > 1 ? 520 : undefined,
                }}
            >
                <div
                    ref={containerRef}
                    style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: `${zoom * 100}%`,
                        minWidth: '100%',
                        cursor: addMode ? 'crosshair' : (onFullscreen ? 'pointer' : 'default'),
                    }}
                    onClick={handleContainerClick}
                >
                    <img
                        src={imageData}
                        alt="Annotated render"
                        style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
                        draggable={false}
                    />

                    {annotations.map(ann => (
                        <AnnotationLabel
                            key={ann.id}
                            annotation={ann}
                            flatLay={flatLay || ann.variant === 'flat'}
                            labelScale={labelScale}
                            detailedColor={detailedColor}
                            onMouseDown={(e) => handleLabelMouseDown(e, ann)}
                            onEdit={(code, note) => onEditAnnotation(ann.id, code, note)}
                            onDelete={() => onDeleteAnnotation(ann.id)}
                        />
                    ))}

                    {pendingPos && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${pendingPos.x}%`,
                                top: `${pendingPos.y}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex: 20,
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{
                                background: tagColorForCode(newCode.toUpperCase(), detailedColor),
                                border: '2px dashed #000',
                                borderRadius: 3,
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'background 120ms ease',
                            }}>
                                <input
                                    ref={newCodeInputRef}
                                    value={newCode}
                                    onChange={e => setNewCode(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') cancelAdd(); }}
                                    placeholder="e.g. MT01"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        width: 70,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        fontFamily: 'monospace',
                                        color: '#000',
                                    }}
                                />
                                <button onClick={confirmAdd} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#000', padding: 0 }}>OK</button>
                                <button onClick={cancelAdd} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#333', padding: 0 }}>x</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const FURNITURE_PREFIXES = new Set(['AP', 'AT', 'BP', 'CG', 'DB', 'DL', 'SE', 'TA', 'WK']);

const MATERIAL_COLOR = '#ccff00';
const FURNITURE_COLOR = '#00e5ff';

// Per-category palette — all light enough to keep black text readable.
const DETAILED_TAG_COLORS: Record<string, string> = {
    // Materials & finishes
    MT: '#ffd166', // Metal — gold
    TL: '#ff9a6b', // Tile — coral
    ST: '#c9b29b', // Stone — sand
    PT: '#fff066', // Paint — yellow
    PL: '#e8c39e', // Plastic Laminate — wheat
    LE: '#e2906e', // Leather — terracotta
    FB: '#ffb3d9', // Fabric — pink
    WC: '#dda0dd', // Wallpaper — plum
    GL: '#a0e7e5', // Glass & Mirror — aqua
    SK: '#b0c4de', // Skirt — steel blue
    WD: '#deb887', // Wood — burlywood
    CE: '#e5e7eb', // Ceiling — light grey
    SF: '#f4a460', // Special Finish — sandy
    CP: '#ffc1cc', // Carpet — pastel pink
    VT: '#f7cac9', // Vinyl Tile — rose
    AG: '#cdc0b0', // Aggregate — bone
    AL: '#d6d6d6', // Aluminum — silver
    AY: '#b5ead7', // Acrylic — mint
    // Lighting / electrical / plumbing
    LT: '#fde68a', // Lighting — soft gold
    EE: '#fdfd96', // Electrical Equipment — pale yellow
    PF: '#87ceeb', // Plumbing Fixtures — sky
    SA: '#a8dadc', // Sanitary Accessories — pale cyan
    // Doors (D, D01..., DB...) — DB is furniture below, plain D handled here
    D:  '#bbded6', // Door — mint
    // Furniture / FF&E
    AP: '#9ad0f5', // Appliance
    AT: '#f5a4cb', // Artwork
    BP: '#fcd5ce', // Bedding, Linens & Pillows
    CG: '#d8b4fe', // Casegood
    DB: '#c4b5fd', // Drapery & Blinds
    DL: '#fcd34d', // Decorative Lighting (Lamp)
    SE: '#ffaaa5', // Seating
    TA: '#d4a373', // Table
    WK: '#fbb6ce', // Workstation / System Furniture
};

const prefixOf = (code: string): string => code.match(/^[A-Z]+/)?.[0] || '';

const tagColorForCode = (code: string, detailed: boolean): string => {
    const prefix = prefixOf(code);
    if (detailed) {
        return DETAILED_TAG_COLORS[prefix] || (FURNITURE_PREFIXES.has(prefix) ? FURNITURE_COLOR : MATERIAL_COLOR);
    }
    return FURNITURE_PREFIXES.has(prefix) ? FURNITURE_COLOR : MATERIAL_COLOR;
};

function AnnotationLabel({ annotation, flatLay, labelScale, detailedColor, onMouseDown, onEdit, onDelete }: {
    annotation: MaterialAnnotation;
    flatLay: boolean;
    labelScale: number;
    detailedColor: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    onEdit: (code: string, note?: string) => void;
    onDelete: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draftCode, setDraftCode] = useState(annotation.code);
    const [draftNote, setDraftNote] = useState(annotation.note || "");
    const tagColor = tagColorForCode(editing ? draftCode : annotation.code, detailedColor);

    const startEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setDraftCode(annotation.code);
        setDraftNote(annotation.note || "");
        setEditing(true);
    };

    const saveEdit = () => {
        const nextCode = draftCode.trim().toUpperCase();
        if (!nextCode) return;
        const nextNote = draftNote.trim();
        onEdit(nextCode, nextNote || undefined);
        setEditing(false);
    };

    const cancelEdit = () => {
        setDraftCode(annotation.code);
        setDraftNote(annotation.note || "");
        setEditing(false);
    };

    return (
        <div
            style={{
                position: 'absolute',
                left: `${annotation.x}%`,
                top: `${annotation.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                cursor: editing ? 'default' : 'grab',
            }}
            onMouseDown={editing ? undefined : onMouseDown}
            onClick={e => e.stopPropagation()}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={flatLay ? {
                background: tagColor,
                color: '#000',
                fontSize: 11 * labelScale,
                fontWeight: 700,
                fontFamily: 'monospace',
                padding: `${2 * labelScale}px ${6 * labelScale}px`,
                borderRadius: 2,
                whiteSpace: 'nowrap',
                boxShadow: 'none',
                position: 'relative',
                lineHeight: 1.4,
                border: '1px solid rgba(0,0,0,0.15)',
            } : {
                background: tagColor,
                color: '#000',
                fontSize: 11 * labelScale,
                fontWeight: 700,
                fontFamily: 'monospace',
                padding: `${2 * labelScale}px ${6 * labelScale}px`,
                borderRadius: 3,
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                position: 'relative',
                lineHeight: 1.4,
            }}>
                {editing ? (
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 118 }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                    >
                        <input
                            value={draftCode}
                            onChange={e => setDraftCode(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            style={{ background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.22)', borderRadius: 3, color: '#000', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, outline: 'none', padding: '2px 4px', width: 84 }}
                            autoFocus
                        />
                        <textarea
                            value={draftNote}
                            onChange={e => setDraftNote(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
                            placeholder="note"
                            style={{ background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.22)', borderRadius: 3, color: '#000', fontFamily: 'sans-serif', fontSize: 9, fontWeight: 500, outline: 'none', padding: '2px 4px', width: 112, minHeight: 32, resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button onClick={saveEdit} style={{ background: '#000', color: tagColor, border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontWeight: 700, padding: '2px 6px' }}>Save</button>
                            <button onClick={cancelEdit} style={{ background: 'rgba(0,0,0,0.12)', color: '#000', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontWeight: 700, padding: '2px 6px' }}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <>
                        {annotation.code}
                        {annotation.note && (
                            <div style={{ fontSize: 8 * labelScale, fontWeight: 500, fontFamily: 'sans-serif', color: '#222', marginTop: 1 * labelScale, maxWidth: 120 * labelScale, whiteSpace: 'normal', lineHeight: 1.3 }}>
                                {annotation.note}
                            </div>
                        )}
                    </>
                )}
                {hovered && (
                    <>
                        {!editing && (
                            <button
                                onMouseDown={startEdit}
                                style={{
                                    position: 'absolute',
                                    top: -8,
                                    left: -8,
                                    background: '#111827',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: 18,
                                    height: 18,
                                    color: '#fff',
                                    fontSize: 9,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    lineHeight: 1,
                                    padding: 0,
                                    zIndex: 11,
                                }}
                                title="Edit label"
                            >
                                E
                            </button>
                        )}
                        <button
                            onMouseDown={e => { e.stopPropagation(); onDelete(); }}
                            style={{
                                position: 'absolute',
                                top: -8,
                                right: -8,
                                background: '#f87171',
                                border: 'none',
                                borderRadius: '50%',
                                width: 16,
                                height: 16,
                                color: '#fff',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 1,
                                padding: 0,
                                zIndex: 11,
                            }}
                            title="Delete label"
                        >
                            x
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
