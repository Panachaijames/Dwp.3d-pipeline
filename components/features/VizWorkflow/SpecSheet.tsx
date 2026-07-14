"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './specSheet.css';
import { traceImage } from './specSheetTrace';
import { buildSpecSheetDxf } from './specSheetDxf';

type Dimensions = {
    height: number | null;
    width: number | null;
    depth: number | null;
    unit: string;
};

type Metadata = {
    specific_object_name?: string;
    object_name?: string;
    object_category?: string;
    primary_colors?: string[];
    materials_and_textures?: string[];
    style_design_era?: string;
    key_features?: string[];
    [key: string]: unknown;
};

interface SpecSheetProps {
    /** Rendered views of the chosen item, selectable as the hero perspective. */
    heroOptions: Array<{ label: string; src: string }>;
    /** Initially selected hero perspective (data URL). */
    initialHero: string;
    /** Masked/source object image used for extraction (base64, no data: prefix). */
    sourceImage: string;
    metadata: Metadata | null;
    dimensions: Dimensions;
    defaultName: string;
    onClose: () => void;
}

type ViewKey = 'plan' | 'front' | 'side';

const TECH_VIEWS: Record<ViewKey, { label: string; instruction: string }> = {
    plan: {
        label: 'PLAN VIEW',
        instruction:
            'Render THIS EXACT object as a STRAIGHT-DOWN TOP / PLAN VIEW — a bird\'s-eye orthographic view looking straight down from directly overhead, so you see only its top surface and its footprint outline. The plan is simply the outline of this object\'s top as seen from above: for a cabinet, chest of drawers, desk, table or case-goods piece this is essentially a RECTANGLE matching its width (left-to-right) and depth (front-to-back), showing only the panel/edge lines genuinely visible from above. The FRONT of the object faces the BOTTOM edge of the image. Do NOT draw the object in perspective and do NOT invent circular shapes, wheels, spokes, bolts or any geometry that is not part of this object.',
    },
    front: {
        label: 'FRONT ELEVATION',
        instruction:
            'Render the object as a STRAIGHT-ON FRONT ELEVATION (camera dead-center in front, perpendicular to the front face, at eye level). Only the FRONT face is visible; sides and back are NOT visible.',
    },
    side: {
        label: 'SIDE ELEVATION',
        instruction:
            'Render the object as a PURE 90° SIDE ELEVATION (camera directly to the RIGHT side, perpendicular). Only ONE SIDE is visible; the front and back are NOT visible.',
    },
};

// Keyword → representative swatch tone, so material names render as tasteful chips.
const MATERIAL_TONES: Array<[RegExp, string]> = [
    [/oak|ash|beech|birch|maple|light\s*wood|veneer/i, '#c9a978'],
    [/walnut|teak|mahogany|dark\s*wood|timber/i, '#6b4a32'],
    [/marble/i, '#ece9e3'],
    [/stone|quartz|granite|terrazzo/i, '#ddd8cf'],
    [/bronze|brass|gold|copper/i, '#9c7b4e'],
    [/chrome|steel|metal|alumin/i, '#b9bdc2'],
    [/glass|mirror|acrylic/i, '#cfe0e6'],
    [/leather/i, '#8a5a3c'],
    [/linen|cotton|fabric|upholster|textile|velvet|wool/i, '#b9b1a3'],
    [/black|charcoal|graphite/i, '#2c2c2e'],
    [/white|ivory|cream/i, '#f3efe8'],
    [/grey|gray|concrete/i, '#9a9892'],
];

const toneFor = (material: string): string => {
    for (const [re, color] of MATERIAL_TONES) if (re.test(material)) return color;
    return '#c7bfb2';
};

const cssColor = (value: string): string | null => {
    if (typeof window === 'undefined') return null;
    const el = document.createElement('span');
    el.style.color = '';
    el.style.color = value;
    return el.style.color ? value : null;
};

// Strip a data: URL down to its raw base64 payload (what /api/extract expects).
const toB64 = (src: string): string => (src.includes(',') ? src.split(',')[1] : src);

export default function SpecSheet({ heroOptions, initialHero, sourceImage, metadata, dimensions, defaultName, onClose }: SpecSheetProps) {
    const pickedName = metadata?.specific_object_name || metadata?.object_category || metadata?.object_name || defaultName || '';
    const cleanedName = pickedName.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const initialName = !cleanedName || /^isolated\s*object$/i.test(cleanedName) ? 'Furniture Item' : cleanedName;
    const initialMaterials = (metadata?.materials_and_textures || []).slice(0, 4);

    const [hero, setHero] = useState(initialHero);
    const [title, setTitle] = useState(initialName);
    const [project, setProject] = useState('');
    const [area, setArea] = useState('');
    const [materials, setMaterials] = useState<string[]>(initialMaterials.length ? initialMaterials : []);
    const [materialsText, setMaterialsText] = useState(initialMaterials.join(', '));
    const [note, setNote] = useState('');
    const [noteLoading, setNoteLoading] = useState(false);
    const [dims, setDims] = useState<Dimensions>(dimensions);

    const [views, setViews] = useState<Record<ViewKey, string>>({ plan: '', front: '', side: '' });
    const [viewLoading, setViewLoading] = useState<Record<ViewKey, boolean>>({ plan: true, front: true, side: true });
    const [exporting, setExporting] = useState(false);
    const [status, setStatus] = useState<string>('');
    // Base64 (no data: prefix) the current drawings were generated from.
    const generatedFromRef = useRef<string>('');

    const unit = dims.unit || 'mm';
    const sizeLabel = useMemo(() => {
        const part = (v: number | null) => (v != null ? `${v}` : '—');
        return `W${part(dims.width)} x D${part(dims.depth)} x H${part(dims.height)} ${unit}`;
    }, [dims, unit]);

    const setDim = (k: 'width' | 'depth' | 'height', v: string) =>
        setDims((d) => ({ ...d, [k]: v === '' ? null : parseFloat(v) }));

    // Compose a sensible default specification note from the analysis metadata.
    const composeNote = useCallback(() => {
        const era = metadata?.style_design_era ? `${metadata.style_design_era} ` : '';
        const cat = (metadata?.object_category || 'piece').toLowerCase();
        const mats = materials.length ? materials.join(', ').toLowerCase() : 'specified materials';
        const feats = (metadata?.key_features || []).slice(0, 2).join(' and ').toLowerCase();
        const featClause = feats ? ` Features include ${feats}.` : '';
        return `${era}${cat} finished in ${mats}, with a softly resolved profile suited to hospitality guestroom use.${featClause} Balances practicality with warm contemporary elegance for FF&E specification.`
            .replace(/\s+/g, ' ')
            .trim();
    }, [metadata, materials]);

    useEffect(() => {
        if (!note) setNote(composeNote());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const generateView = useCallback(async (key: ViewKey, srcB64: string) => {
        if (!srcB64) return;
        setViewLoading((s) => ({ ...s, [key]: true }));
        try {
            const res = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageToSend: srcB64,
                    promptText: title,
                    viewInstruction: TECH_VIEWS[key].instruction,
                    renderStyle: 'lineart',
                    includeAnalysis: false,
                }),
            });
            const data = await res.json();
            setViews((s) => ({ ...s, [key]: data.imageData ? `data:image/png;base64,${data.imageData}` : '' }));
        } catch (err) {
            console.error(`Spec-sheet ${key} view failed:`, err);
            setViews((s) => ({ ...s, [key]: '' }));
        } finally {
            setViewLoading((s) => ({ ...s, [key]: false }));
        }
    }, [title]);

    const drawAll = useCallback((srcB64: string) => {
        if (!srcB64) return;
        generatedFromRef.current = srcB64;
        void generateView('plan', srcB64);
        void generateView('front', srcB64);
        void generateView('side', srcB64);
    }, [generateView]);

    // Initial drawings come from the SAME image shown as the hero, so the big
    // render and the plan/front/side always show one object. Fall back to the
    // masked source only when no hero render is available.
    useEffect(() => {
        if (generatedFromRef.current) return;
        const b64 = toB64(initialHero) || sourceImage;
        if (b64) drawAll(b64);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialHero]);

    // Picking a different main perspective re-derives the drawings from THAT
    // image, so the big render and the plan/front/side always show one object.
    const selectHero = (src: string) => {
        setHero(src);
        const b64 = toB64(src);
        if (b64 && b64 !== generatedFromRef.current) drawAll(b64);
    };

    const currentSource = () => generatedFromRef.current || toB64(hero) || sourceImage;

    const aiNote = async () => {
        setNoteLoading(true);
        try {
            const prompt = `Write a concise, professional FF&E specification note (2-3 sentences, no preamble, no markdown) for a piece of furniture.
Item: ${title}
Category: ${metadata?.object_category || ''}
Style / era: ${metadata?.style_design_era || ''}
Materials & finishes: ${materials.join(', ')}
Key features: ${(metadata?.key_features || []).join(', ')}
Cover form, function, material and guestroom/hospitality design intent. Return plain text only.`;
            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            const data = await res.json();
            if (data.response) setNote(String(data.response).replace(/\s+/g, ' ').trim());
        } catch (err) {
            console.error('Spec-note generation failed:', err);
        } finally {
            setNoteLoading(false);
        }
    };

    const commitMaterials = (text: string) => {
        setMaterialsText(text);
        setMaterials(text.split(',').map((m) => m.trim()).filter(Boolean));
    };

    // Safety net: never let the print-isolation class outlive the modal, even
    // if `afterprint` fails to fire (some embedded webviews don't emit it).
    useEffect(() => () => { document.body.classList.remove('ss-printing'); }, []);

    const exportPdf = () => {
        document.body.classList.add('ss-printing');
        let safety = 0;
        const cleanup = () => {
            document.body.classList.remove('ss-printing');
            window.removeEventListener('afterprint', cleanup);
            if (safety) window.clearTimeout(safety);
        };
        safety = window.setTimeout(cleanup, 60000);
        window.addEventListener('afterprint', cleanup);
        setTimeout(() => window.print(), 60);
    };

    const exportDxf = async () => {
        setExporting(true);
        setStatus('Vectorising line drawings…');
        try {
            const trace = async (src: string) => (src ? await traceImage(src, { detail: true }) : null);
            const [front, side, plan] = await Promise.all([
                trace(views.front),
                trace(views.side),
                trace(views.plan),
            ]);

            if (!front && !side && !plan) {
                setStatus('No technical views available to vectorise yet.');
                setExporting(false);
                return;
            }

            const dxf = buildSpecSheetDxf({
                title,
                project,
                area,
                note,
                materials,
                dims,
                front,
                side,
                plan,
            });

            const safe = (title || 'spec_sheet').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
            const blob = new Blob([dxf], { type: 'application/dxf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safe || 'spec_sheet'}.dxf`;
            link.click();
            // Defer revoke so the browser finishes reading the blob first
            // (synchronous revoke can abort the download in some browsers).
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            setStatus('DXF exported.');
        } catch (err) {
            console.error('DXF export failed:', err);
            setStatus('DXF export failed — see console.');
        } finally {
            setExporting(false);
        }
    };

    const num = (v: number | null) => (v != null ? `${v}` : '');
    const dimsForView: Record<ViewKey, { w: string; h: string }> = {
        plan: { w: num(dims.width), h: num(dims.depth) },
        front: { w: num(dims.width), h: num(dims.height) },
        side: { w: num(dims.depth), h: num(dims.height) },
    };

    const renderView = (key: ViewKey) => {
        const dim = dimsForView[key];
        return (
            <div className="ss-view" key={key}>
                <div className="ss-view-head">
                    <span className="ss-view-label">{TECH_VIEWS[key].label}</span>
                    {!viewLoading[key] && (
                        <button type="button" className="ss-view-regen" title="Regenerate this view" onClick={() => generateView(key, currentSource())}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                            Redraw
                        </button>
                    )}
                </div>
                <div className="ss-view-body">
                    <div className="ss-view-frame">
                        {viewLoading[key] ? (
                            <div className="ss-view-loading"><span className="ss-spinner" /> Drawing…</div>
                        ) : views[key] ? (
                            <img src={views[key]} alt={TECH_VIEWS[key].label} />
                        ) : (
                            <button className="ss-retry" onClick={() => generateView(key, currentSource())}>Retry</button>
                        )}
                    </div>
                    {/* Height dimension (right of view) */}
                    <div className="ss-dim ss-dim-col">
                        {dim.h && (<><span className="bar" /><span className="num">{dim.h}</span></>)}
                    </div>
                    {/* Width / depth dimension (below view) */}
                    <div className="ss-dim ss-dim-row">
                        {dim.w && (<><span className="bar" /><span className="num">{dim.w}</span></>)}
                    </div>
                    <div className="ss-dim-corner" />
                </div>
            </div>
        );
    };

    return (
        <div className="ss-overlay" role="dialog" aria-modal="true">
            <div className="ss-shell">
                {/* Top bar */}
                <header className="ss-topbar">
                    <div className="ss-topbar-left">
                        <button className="ss-back" onClick={onClose}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                            </svg>
                            Back
                        </button>
                        <h1 className="ss-title-bar">FF&amp;E Detail Study / DWG Sheet</h1>
                    </div>
                    <div className="ss-topbar-actions">
                        <button className="ss-btn ss-btn-secondary" onClick={exportPdf}>Export PDF</button>
                        <button className="ss-btn ss-btn-primary" onClick={exportDxf} disabled={exporting}>
                            {exporting ? 'Exporting…' : 'Export DXF (CAD)'}
                        </button>
                        <button className="ss-close" onClick={onClose} aria-label="Close">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </header>

                <div className="ss-main">
                    {/* Controls */}
                    <aside className="ss-panel">
                        <section className="ss-card">
                            <div className="ss-card-title">Sheet Details</div>
                            <label className="ss-field"><span>Item name</span>
                                <input value={title} onChange={(e) => setTitle(e.target.value)} />
                            </label>
                            <label className="ss-field"><span>Project</span>
                                <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. Hilton Hai Phong" />
                            </label>
                            <label className="ss-field"><span>Area / Location</span>
                                <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Guestroom FF&E" />
                            </label>
                            <label className="ss-field"><span>Materials &amp; finishes</span>
                                <input value={materialsText} onChange={(e) => commitMaterials(e.target.value)} placeholder="Oak Veneer, Engineered Stone, Bronze" />
                            </label>
                            <div className="ss-field">
                                <span>Overall size (W · D · H)</span>
                                <div className="ss-dim-inputs">
                                    <input type="number" min={0} placeholder="W" value={dims.width ?? ''} onChange={(e) => setDim('width', e.target.value)} />
                                    <input type="number" min={0} placeholder="D" value={dims.depth ?? ''} onChange={(e) => setDim('depth', e.target.value)} />
                                    <input type="number" min={0} placeholder="H" value={dims.height ?? ''} onChange={(e) => setDim('height', e.target.value)} />
                                    <select value={dims.unit} onChange={(e) => setDims((d) => ({ ...d, unit: e.target.value }))}>
                                        <option value="mm">mm</option>
                                        <option value="cm">cm</option>
                                        <option value="m">m</option>
                                        <option value="in">in</option>
                                        <option value="ft">ft</option>
                                    </select>
                                </div>
                            </div>
                        </section>

                        {heroOptions.length > 1 && (
                            <section className="ss-card">
                                <div className="ss-card-title">Main perspective</div>
                                <div className="ss-hero-thumbs">
                                    {heroOptions.map((opt) => (
                                        <button
                                            type="button"
                                            key={opt.label}
                                            className={`ss-hero-thumb ${hero === opt.src ? 'active' : ''}`}
                                            title={opt.label}
                                            onClick={() => selectHero(opt.src)}
                                        >
                                            <img src={opt.src} alt={opt.label} />
                                            <span>{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="ss-hint">Selecting a view sets the hero render <strong>and</strong> redraws the plan / front / side from it, so the whole sheet shows one object.</p>
                            </section>
                        )}

                        <section className="ss-card">
                            <div className="ss-card-title ss-row">
                                <span>Specification note</span>
                                <button className="ss-mini" onClick={aiNote} disabled={noteLoading}>{noteLoading ? '…' : 'AI'}</button>
                            </div>
                            <textarea className="ss-note-input" value={note} onChange={(e) => setNote(e.target.value)} rows={6} />
                        </section>

                        <section className="ss-card">
                            <div className="ss-card-title ss-row">
                                <span>Technical line drawings</span>
                                <button
                                    className="ss-mini"
                                    onClick={() => drawAll(currentSource())}
                                >Regenerate</button>
                            </div>
                            <p className="ss-hint">Set a clear <strong>Item name</strong> (e.g. &ldquo;Round wall mirror&rdquo;) — it tells the drawing what the main subject is, so ornament stays secondary. Then <strong>Redraw</strong>. Views follow the selected main perspective and feed the DXF.</p>
                        </section>

                        {status && <div className="ss-status">{status}</div>}
                        <p className="ss-hint ss-disclaimer">
                            DXF is the universal editable CAD format (open it in AutoCAD / Revit / SketchUp and Save&nbsp;As&nbsp;.dwg). True
                            .dwg can&apos;t be written in-browser. Geometry is dimensioned to your entered sizes in&nbsp;mm.
                        </p>
                    </aside>

                    {/* Live A4 sheet */}
                    <section className="ss-stage">
                        <div className="ss-sheet" id="ss-sheet">
                            <div className="ss-header">
                                <div className="ss-h-title">{title || 'FURNITURE ITEM'}</div>
                                <div className="ss-h-sub">{[project, area].filter(Boolean).join(' — ') || 'PROJECT — AREA'}</div>
                                <div className="ss-rule" />
                            </div>

                            <div className="ss-content">
                                <div className="ss-col-left">
                                    <div className="ss-block-label">OVERALL SIZE</div>
                                    <div className="ss-size">{sizeLabel}</div>

                                    <div className="ss-hero">
                                        {hero ? <img src={hero} alt={title} /> : <div className="ss-hero-empty">No perspective render</div>}
                                    </div>

                                    <div className="ss-block-label">MATERIALS &amp; FINISHES</div>
                                    <div className="ss-swatches">
                                        {(materials.length ? materials : ['Material']).map((m, i) => {
                                            const primary = metadata?.primary_colors?.[i];
                                            const bg = (primary && cssColor(primary)) || toneFor(m);
                                            return (
                                                <div className="ss-swatch" key={`${m}-${i}`}>
                                                    <div className="ss-swatch-tile" style={{ background: bg }} />
                                                    <div className="ss-swatch-label">{m}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="ss-col-right">
                                    {renderView('plan')}
                                    {renderView('front')}
                                    {renderView('side')}
                                </div>
                            </div>

                            <div className="ss-footer">
                                <div className="ss-note-block">
                                    <div className="ss-block-label">SPECIFICATION NOTE</div>
                                    <p className="ss-note-text">{note}</p>
                                </div>
                                <div className="ss-brand">{project || 'dwp'}</div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
