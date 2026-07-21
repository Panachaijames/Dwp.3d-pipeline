"use client";
// Self-contained taggable image cell for the Boards studio — the Boards-side
// equivalent of Prompt Gen's renderTaggableImage(), with per-instance state
// instead of Record maps keyed by prompt-result ids.
//
// Once tagged, the cell can be expanded to a fullscreen tag-editing overlay
// (⛶ Expand, or clicking the tagged image). The overlay renders the SAME
// AnnotatedRender against the same annotation state, so tags come along and
// every edit made fullscreen is reflected in the card and vice versa.

import React, { useEffect, useState } from 'react';
import { MaterialAnnotation } from '../VizWorkflow/constants';
import AnnotatedRender from '../DDMaterialTagger/AnnotatedRender';
import { useAuth } from '../../../contexts/AuthContext';
import { TagMode, requestImageTags, upscaleImage4K, exportAnnotatedImage, triggerDownload } from './taggingCore';

export interface TaggableImageProps {
    src: string;
    altText: string;
    /** Base filename for downloads (extension is added automatically) */
    downloadName: string;
    tagMode?: TagMode;
    /** Custom code schedule (scene mode) */
    customSchedule?: string;
    /** Use the DD-phase schedule when no custom list is given (scene mode) */
    ddSchedule?: boolean;
    /** Project name used as the Google Sheet title context */
    projectName?: string;
    allowUpscale?: boolean;
    allowSheetExport?: boolean;
    onCanvasEdit?: (src: string, title: string) => void;
    onFullscreen?: (src: string) => void;
}

export default function TaggableImage({
    src,
    altText,
    downloadName,
    tagMode = 'scene',
    customSchedule,
    ddSchedule,
    projectName,
    allowUpscale,
    allowSheetExport,
    onCanvasEdit,
    onFullscreen,
}: TaggableImageProps) {
    const { accessToken, requestDriveAccess } = useAuth();
    const [annotations, setAnnotations] = useState<MaterialAnnotation[] | null>(null);
    const [tagging, setTagging] = useState(false);
    const [tagError, setTagError] = useState<string | null>(null);
    const [upscaled, setUpscaled] = useState<string | null>(null);
    const [upscaling, setUpscaling] = useState(false);
    const [sheetExporting, setSheetExporting] = useState(false);
    // Fullscreen tag-editing overlay
    const [expanded, setExpanded] = useState(false);

    // When the src prop changes (e.g. this slot now holds a different project's
    // board after a project switch, since cards can share a render key), drop the
    // stale tags/4K image so they never render against the wrong image. Done in
    // render (not an effect) to avoid a frame showing the previous board.
    const [lastSrc, setLastSrc] = useState(src);
    if (src !== lastSrc) {
        setLastSrc(src);
        setAnnotations(null);
        setUpscaled(null);
        setTagError(null);
        setExpanded(false);
    }

    const effectiveSrc = upscaled || src;

    // Escape closes the expanded overlay (AnnotatedRender's own Escape handler
    // deselects a selected tag; both firing together is harmless).
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [expanded]);

    const tag = async () => {
        if (tagging) return;
        setTagging(true);
        setTagError(null);
        setAnnotations(null);
        try {
            setAnnotations(await requestImageTags(effectiveSrc, tagMode, { customSchedule, ddSchedule }));
        } catch (err: any) {
            setTagError(err?.message || 'Tagging failed');
        }
        setTagging(false);
    };

    const upscale = async () => {
        if (upscaling) return;
        setUpscaling(true);
        try {
            setUpscaled(await upscaleImage4K(src));
        } catch (err) {
            console.warn('[TaggableImage] upscale failed:', err);
        }
        setUpscaling(false);
    };

    const download = async () => {
        const hasAnnotations = !!annotations?.length;
        const filename = `${downloadName}${hasAnnotations ? '-tagged.png' : '.jpg'}`;
        try {
            if (hasAnnotations) {
                await exportAnnotatedImage(effectiveSrc, annotations!, filename);
                return;
            }
            triggerDownload(effectiveSrc, filename);
        } catch (err) {
            console.warn('[TaggableImage] export failed:', err);
            alert(hasAnnotations
                ? 'Tagged export failed. The image may be blocked by browser canvas security; try downloading the original image instead.'
                : 'Image export failed. Please try again.');
        }
    };

    const exportToSheets = async () => {
        if (!annotations?.length) return;
        if (!accessToken) {
            requestDriveAccess();
            return;
        }
        // Open a placeholder tab synchronously so the browser treats it as a user-initiated
        // popup; navigate it to the sheet URL once the export resolves.
        const pendingTab = window.open('about:blank', '_blank');
        if (pendingTab?.document?.body) {
            pendingTab.document.title = 'Preparing your Google Sheet…';
            pendingTab.document.body.style.cssText = 'font-family:system-ui;padding:32px;color:#333;background:#fafafa';
            pendingTab.document.body.innerHTML =
                '<h2 style="margin:0 0 8px">Preparing your Google Sheet…</h2>' +
                '<p style="color:#666">Building your material schedule. This tab will redirect automatically.</p>';
        }
        setSheetExporting(true);
        try {
            const res = await fetch('/api/sheets/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ annotations, projectName: projectName || 'Boards Studio' }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) {
                    pendingTab?.close();
                    requestDriveAccess(true);
                    return;
                }
                throw new Error(data.error || 'Failed to export to Google Sheets');
            }
            if (data.url) {
                if (pendingTab && !pendingTab.closed) {
                    pendingTab.location.href = data.url;
                } else {
                    window.open(data.url, '_blank', 'noopener,noreferrer') ?? (window.location.href = data.url);
                }
            } else {
                pendingTab?.close();
            }
        } catch (err: any) {
            console.error('[TaggableImage] sheet export failed:', err);
            pendingTab?.close();
            alert(`Sheet export failed: ${err?.message || 'Unknown error'}`);
        } finally {
            setSheetExporting(false);
        }
    };

    const downloadIcon = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
    );

    // Toolbar shown for a tagged image — shared between the card header and the
    // expanded overlay so both stay in feature-parity.
    const tagToolbar = (
        <>
            <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={tag} disabled={tagging}>↻ Re-tag</button>
            <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => { setAnnotations(null); setExpanded(false); }}>Remove tags</button>
            {allowUpscale && !upscaled && (
                <button
                    className="vw-btn vw-btn-sm"
                    style={{ fontSize: 9, borderColor: '#a78bfa', color: '#a78bfa', fontWeight: 600 }}
                    onClick={upscale}
                    disabled={upscaling}
                    title="Upscale to 4K via Nano Banana — sharpens detail, preserves composition"
                >
                    {upscaling ? 'Upscaling…' : '↑ 4K'}
                </button>
            )}
            <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={download} title="Download tagged image">
                {downloadIcon}
            </button>
            {onCanvasEdit && (
                <button
                    className="vw-btn vw-btn-sm"
                    style={{ fontSize: 9, borderColor: '#c084fc', color: '#c084fc', fontWeight: 600 }}
                    onClick={() => onCanvasEdit(effectiveSrc, altText)}
                    title="Split this board into pieces and rearrange them on an editable canvas"
                >
                    ✂ Edit in Canvas
                </button>
            )}
            {allowSheetExport && (
                <button
                    className="vw-btn vw-btn-sm"
                    style={{ fontSize: 9, borderColor: '#34a853', color: '#34a853', fontWeight: 600 }}
                    onClick={exportToSheets}
                    disabled={sheetExporting}
                    title={accessToken ? 'Build a DWP material schedule from these tags and open it as a formatted Google Sheet' : 'Sign in with Google to export tags to Sheets'}
                >
                    {sheetExporting ? '⊞ Exporting…' : '⊞ Export to Sheets'}
                </button>
            )}
        </>
    );

    // zoomMaxHeight: the compact card keeps AnnotatedRender's default (520px)
    // zoom viewport; the fullscreen overlay gets nearly the whole viewport so
    // zooming in never clips the image to a small strip.
    const renderAnnotated = (zoomMaxHeight?: number | string) => (
        <AnnotatedRender
            imageData={effectiveSrc}
            annotations={annotations || []}
            onUpdateAnnotation={(id, x, y) => setAnnotations(prev => prev ? prev.map(a => a.id === id ? { ...a, x, y } : a) : prev)}
            onEditAnnotation={(id, code, note) => setAnnotations(prev => prev ? prev.map(a => a.id === id ? { ...a, code, note } : a) : prev)}
            onDeleteAnnotation={(id) => setAnnotations(prev => prev ? prev.filter(a => a.id !== id) : prev)}
            onAddAnnotation={(code, x, y, note) => setAnnotations(prev => prev ? [...prev, { id: Math.random().toString(36).substring(2, 11), code, x, y, note }] : prev)}
            onFullscreen={() => setExpanded(true)}
            zoomMaxHeight={zoomMaxHeight}
        />
    );

    return (
        <div style={{ position: 'relative', borderRadius: 8, border: '1px solid var(--bdr)', overflow: annotations ? 'visible' : 'hidden' }}>
            {annotations ? (
                <div style={{ padding: '8px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#ccff00', textTransform: 'uppercase', letterSpacing: 1 }}>
                            ◩ {annotations.length} tags{upscaled && <span style={{ marginLeft: 6, color: '#a78bfa' }}>· 4K</span>}
                        </span>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button
                                className="vw-btn vw-btn-sm"
                                style={{ fontSize: 9, borderColor: '#ccff00', color: '#ccff00', fontWeight: 700 }}
                                onClick={() => setExpanded(true)}
                                title="Open a fullscreen tag editor — tags stay editable and in sync"
                            >
                                ⛶ Expand
                            </button>
                            {tagToolbar}
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        {/* While the fullscreen editor is open it is the ONLY live
                            AnnotatedRender for this image — two simultaneous instances
                            would double keyboard handlers and muddle tag copy/paste. */}
                        {expanded ? (
                            <img src={effectiveSrc} alt={altText} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, opacity: 0.45 }} />
                        ) : renderAnnotated()}
                        {upscaling && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8 }}>
                                <div style={{ fontSize: 22, color: '#a78bfa' }}>↑</div>
                                <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600 }}>Upscaling to 4K…</div>
                                <div style={{ fontSize: 8, color: '#888' }}>~10–20s</div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    <img
                        src={effectiveSrc}
                        alt={altText}
                        style={{ width: '100%', height: 'auto', display: 'block', cursor: onFullscreen ? 'pointer' : 'default' }}
                        onClick={onFullscreen ? () => onFullscreen(effectiveSrc) : undefined}
                    />
                    {tagging ? (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <div style={{ fontSize: 20, color: '#ccff00' }}>◩</div>
                            <div style={{ fontSize: 10, color: '#ccff00', fontWeight: 600 }}>Tagging…</div>
                        </div>
                    ) : upscaling ? (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <div style={{ fontSize: 22, color: '#a78bfa' }}>↑</div>
                            <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600 }}>Upscaling to 4K…</div>
                            <div style={{ fontSize: 8, color: '#888' }}>~10–20s</div>
                        </div>
                    ) : tagError ? (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, overflow: 'auto' }}>
                            <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>Tag failed</div>
                            <div style={{ fontSize: 9, color: '#ccc', textAlign: 'center', maxWidth: '90%', wordBreak: 'break-word', lineHeight: 1.4 }}>{tagError}</div>
                            <button className="vw-btn vw-btn-sm" style={{ borderColor: '#ccff00', color: '#ccff00', fontSize: 9 }} onClick={tag}>↻ Retry</button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={download}
                                className="vw-btn vw-btn-p vw-btn-sm"
                                style={{ position: 'absolute', bottom: 8, right: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: 'rgba(255,255,255,0.1)' }}
                                title="Download Image"
                            >
                                {downloadIcon}
                            </button>
                            <button
                                onClick={tag}
                                className="vw-btn vw-btn-sm"
                                style={{ position: 'absolute', bottom: 8, left: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: '#ccff00', color: '#ccff00', fontWeight: 700, fontSize: 10 }}
                                title="Tag materials & furniture"
                            >
                                ◩ Tag
                            </button>
                            {onCanvasEdit && (
                                <button
                                    onClick={() => onCanvasEdit(effectiveSrc, altText)}
                                    className="vw-btn vw-btn-sm"
                                    style={{ position: 'absolute', top: 8, left: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: '#c084fc', color: '#c084fc', fontWeight: 700, fontSize: 10 }}
                                    title="Split this board into pieces and rearrange them on an editable canvas"
                                >
                                    ✂ Canvas
                                </button>
                            )}
                            {allowUpscale && !upscaled && (
                                <button
                                    onClick={upscale}
                                    className="vw-btn vw-btn-sm"
                                    style={{ position: 'absolute', top: 8, right: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: '#a78bfa', color: '#a78bfa', fontWeight: 700, fontSize: 10 }}
                                    title="Upscale to 4K (sharpens detail, preserves composition)"
                                >
                                    ↑ 4K
                                </button>
                            )}
                            {upscaled && (
                                <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 7px', background: 'rgba(167,139,250,0.85)', color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>4K</span>
                            )}
                        </>
                    )}
                </>
            )}

            {/* ── Fullscreen tag-editing overlay — same annotation state, so tags
                   come along and edits sync back to the card ── */}
            {expanded && (annotations || tagging || tagError) && (
                <div className="bs-tagx">
                    <div className="bs-tagx-hd">
                        <span className="bs-tagx-title">
                            ◩ {altText}{annotations && <span style={{ color: '#ccff00', marginLeft: 8 }}>{annotations.length} tags</span>}{upscaled && <span style={{ color: '#a78bfa', marginLeft: 6 }}>4K</span>}
                        </span>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                            {annotations && tagToolbar}
                            <button className="vw-btn vw-btn-sm" style={{ fontSize: 9, fontWeight: 700 }} onClick={() => setExpanded(false)} title="Close (Esc)">✕ Close</button>
                        </div>
                    </div>
                    <div className="bs-tagx-body">
                        <div className="bs-tagx-stage">
                            {annotations ? renderAnnotated('calc(100vh - 160px)') : tagging ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 300, color: '#ccff00' }}>
                                    <div style={{ fontSize: 26 }}>◩</div>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>Re-tagging…</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 300 }}>
                                    <div style={{ fontSize: 12, color: '#f87171', fontWeight: 700 }}>Tag failed</div>
                                    <div style={{ fontSize: 10, color: '#ccc', textAlign: 'center', maxWidth: 480, wordBreak: 'break-word' }}>{tagError}</div>
                                    <button className="vw-btn vw-btn-sm" style={{ borderColor: '#ccff00', color: '#ccff00', fontSize: 10 }} onClick={tag}>↻ Retry</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
