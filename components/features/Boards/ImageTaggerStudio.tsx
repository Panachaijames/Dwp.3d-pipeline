"use client";
// Image Tagger studio — standalone auto-tagging for any image (interior scene,
// material board, or furniture shot) without a Prompt Gen result. Uses the same
// Gemini tagging prompts, editable tag overlay, 4K upscale, annotated PNG export,
// and Google Sheets material-schedule export as Prompt Gen.

import React, { useEffect, useRef, useState } from 'react';
import { VizProject } from '../VizWorkflow/constants';
import { compressImage } from './materialBoardCore';
import { TagMode } from './taggingCore';
import TaggableImage from './TaggableImage';

interface Props {
    proj: VizProject | null;
    active?: boolean;
    onCanvasEdit: (src: string, title: string) => void;
    onFullscreen: (src: string) => void;
}

type UploadedImage = { id: string; name: string; src: string };

const TAG_MODES: { id: TagMode; label: string; hint: string }[] = [
    { id: 'scene', label: 'Interior scene', hint: 'Tags every material, furniture piece, fixture, and finish (DD schedule or full catalogue)' },
    { id: 'materialBoard', label: 'Material board', hint: 'Tags each swatch on a flat-lay board with 2-letter material codes' },
    { id: 'furniture', label: 'Furniture / FF&E', hint: 'Tags furniture pieces with FF&E category codes' },
];

export default function ImageTaggerStudio({ proj, active = true, onCanvasEdit, onFullscreen }: Props) {
    const [images, setImages] = useState<UploadedImage[]>([]);
    const [tagMode, setTagMode] = useState<TagMode>('scene');
    const [customSchedule, setCustomSchedule] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const addFiles = (files: FileList | File[] | null | undefined) => {
        for (const file of Array.from(files || [])) {
            if (!file.type.startsWith('image/')) continue;
            const reader = new FileReader();
            reader.onload = async ev => {
                const compressed = await compressImage(String(ev.target?.result));
                setImages(prev => [{ id: Math.random().toString(36).substring(2, 11), name: file.name, src: compressed }, ...prev]);
            };
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (!active) return; // only the visible studio consumes the paste
            if (document.querySelector('.bs-tagx')) return; // fullscreen tag editor open — Ctrl+V is for tags there
            const files = Array.from(e.clipboardData?.items || [])
                .filter(i => i.type.startsWith('image/'))
                .map(i => i.getAsFile())
                .filter((f): f is File => !!f);
            if (files.length) addFiles(files);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    return (
        <div className="bs-tagger">
            <div className="bs-sec-title">Auto-tag images</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                {TAG_MODES.map(m => (
                    <button
                        key={m.id}
                        className={`vw-btn vw-btn-sm ${tagMode === m.id ? 'vw-btn-p' : 'vw-btn-g'}`}
                        title={m.hint}
                        onClick={() => setTagMode(m.id)}
                    >
                        {m.label}
                    </button>
                ))}
                <button className="vw-btn vw-btn-sm" onClick={() => fileRef.current?.click()}>⇪ Add images</button>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {tagMode === 'scene' && (
                <textarea
                    className="vw-fi"
                    style={{ width: '100%', minHeight: 64, fontSize: 10, fontFamily: 'ui-monospace, Consolas, monospace', marginBottom: 10 }}
                    placeholder={`Optional: paste a project material schedule to tag against (one code per line, e.g. "MT01 : General metal (Mirror) caramel"). Leave empty to use ${proj?.phase === 'DD' ? "the DD schedule" : 'the full category catalogue'}.`}
                    value={customSchedule}
                    onChange={e => setCustomSchedule(e.target.value)}
                />
            )}

            {images.length === 0 ? (
                <div
                    className="bs-drop"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    style={{ minHeight: 200 }}
                >
                    <div className="bs-drop-hint">
                        <div style={{ fontSize: 22 }}>◩</div>
                        <div>Click, drag, or paste images to tag</div>
                        <div style={{ fontSize: 9, color: 'var(--tx3)' }}>Renders, boards, or furniture shots — tags are editable, exportable as PNG or a Google Sheets material schedule</div>
                    </div>
                </div>
            ) : (
                <div className="bs-grid bs-grid-lg">
                    {images.map((img, i) => (
                        <div key={img.id} className="bs-card">
                            <div className="bs-card-hd">
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => setImages(prev => prev.filter(x => x.id !== img.id))}>✕</button>
                            </div>
                            <TaggableImage
                                src={img.src}
                                altText={img.name}
                                downloadName={`Boards-Tagged-${i + 1}`}
                                tagMode={tagMode}
                                customSchedule={customSchedule}
                                ddSchedule={proj?.phase === 'DD'}
                                projectName={proj?.name}
                                allowUpscale
                                allowSheetExport
                                onCanvasEdit={onCanvasEdit}
                                onFullscreen={onFullscreen}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
