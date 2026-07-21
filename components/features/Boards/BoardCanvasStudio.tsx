"use client";
// Board Canvas studio — direct entry into the BoardCanvasEditor without needing
// a Prompt Gen result. Import a board from a URL (Pinterest pins resolve via the
// /api/fetch-image proxy), upload a file, or reopen a previously imported board.
// Uses the SAME IndexedDB key as Prompt Gen (`dwp_mb_imports_{proj.id}`) so
// boards imported in either app show up in both.

import React, { useEffect, useRef, useState } from 'react';
import { get as idbGet, update as idbUpdate } from 'idb-keyval';
import { VizProject } from '../VizWorkflow/constants';

interface Props {
    proj: VizProject | null;
    onOpenCanvas: (src: string, title: string) => void;
}

type ImportedBoard = { id: string; title: string; src: string; addedAt: number };

export default function BoardCanvasStudio({ proj, onOpenCanvas }: Props) {
    const importsKey = `dwp_mb_imports_${proj?.id || 'standalone'}`;
    const [importedBoards, setImportedBoards] = useState<ImportedBoard[]>([]);
    const [importUrl, setImportUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let alive = true;
        idbGet(importsKey).then((list) => { if (alive && Array.isArray(list)) setImportedBoards(list); else if (alive) setImportedBoards([]); }).catch(() => {});
        return () => { alive = false; };
    }, [importsKey]);

    // Read-modify-write inside one IndexedDB transaction (idb-keyval `update`) so a
    // concurrent write from Prompt Gen on the same shared key can't clobber ours.
    const addImportedBoard = (title: string, src: string) => {
        const entry: ImportedBoard = { id: Math.random().toString(36).substring(2, 11), title, src, addedAt: Date.now() };
        void idbUpdate<ImportedBoard[]>(importsKey, (list) => {
            const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, 12);
            setImportedBoards(next);
            return next;
        }).catch((e) => console.warn('[imports] save failed:', e));
    };

    const removeImportedBoard = (id: string) => {
        void idbUpdate<ImportedBoard[]>(importsKey, (list) => {
            const next = (Array.isArray(list) ? list : []).filter(b => b.id !== id);
            setImportedBoards(next);
            return next;
        }).catch(() => {});
    };

    // Import an external board (e.g. a Pinterest pin or image URL) into the canvas editor.
    const importBoardFromUrl = async () => {
        const url = importUrl.trim();
        if (!url || importing) return;
        setImporting(true);
        try {
            const res = await fetch('/api/fetch-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            let data: any = {};
            try { data = await res.json(); } catch { /* non-JSON */ }
            if (!res.ok || !data.imageData) throw new Error(data.error || `Fetch failed (${res.status})`);
            const title = /pinterest\.|pinimg\./i.test(url) ? 'Pinterest board' : 'Imported board';
            addImportedBoard(title, data.imageData);
            onOpenCanvas(data.imageData, title);
            setImportUrl('');
        } catch (err: any) {
            alert(`Import failed: ${err?.message || 'unknown error'}\n\nTip: on Pinterest, right-click the image → "Copy image address" and paste that URL instead.`);
        } finally {
            setImporting(false);
        }
    };

    const importBoardFromFile = (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const title = file.name.replace(/\.[^.]+$/, '') || 'Imported board';
            addImportedBoard(title, String(reader.result));
            onOpenCanvas(String(reader.result), title);
        };
        reader.onerror = () => alert('Could not read that file');
        reader.readAsDataURL(file);
    };

    return (
        <div className="bs-canvas-studio">
            <div className="bs-sec-title">Import a board</div>
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8 }}>
                Paste a Pinterest pin / image URL or upload a board image. The canvas editor splits it into movable pieces
                (Gemini boxes + in-browser SlimSAM), lets you swap materials, complete damaged pieces, and re-export.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    className="vw-fi"
                    style={{ flex: 1, minWidth: 220 }}
                    placeholder="https://pinterest.com/pin/… or any image URL"
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void importBoardFromUrl(); }}
                />
                <button className="vw-btn vw-btn-p" onClick={importBoardFromUrl} disabled={importing || !importUrl.trim()}>
                    {importing ? 'Importing…' : '⇩ Import URL'}
                </button>
                <button className="vw-btn" onClick={() => fileRef.current?.click()}>⇪ Upload file</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { importBoardFromFile(e.target.files); e.target.value = ''; }} />
            </div>

            <div className="bs-sec-title" style={{ marginTop: 18 }}>Saved boards {proj ? `— ${proj.name || proj.projectId}` : ''}</div>
            {importedBoards.length === 0 ? (
                <div className="bs-empty" style={{ minHeight: 160 }}>
                    <div style={{ fontSize: 22 }}>✂</div>
                    <div>No imported boards yet</div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>Boards you import here (or in Prompt Gen) are saved per project and can be reopened with their edit session intact.</div>
                </div>
            ) : (
                <div className="bs-board-grid">
                    {importedBoards.map(b => (
                        <div key={b.id} className="bs-board-thumb">
                            <img src={b.src} alt={b.title} onClick={() => onOpenCanvas(b.src, b.title)} />
                            <div className="bs-board-thumb-bar">
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.title}</span>
                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => onOpenCanvas(b.src, b.title)}>✂ Open</button>
                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} title="Remove from saved boards" onClick={() => removeImportedBoard(b.id)}>✕</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
