"use client";
// dwp.boards — standalone studio for the visual board tools extracted from
// Prompt Gen: Material Board generation (image → inventory → 5 style boards),
// Board Canvas (segment + rearrange), Object Extractor, and Image Tagger.
// Lives at /boards inside the same Next.js app so it shares the API routes,
// auth, and per-project browser storage with the pipeline.

import React, { useEffect, useState } from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '@/services/supabaseClient';
import { logUsage } from '@/services/usageLogger';
import { VizProject } from '../VizWorkflow/constants';
import { mergeProjects } from '../VizWorkflow/projectMerge';
import MaterialBoardStudio from './MaterialBoardStudio';
import BoardCanvasStudio from './BoardCanvasStudio';
import ImageTaggerStudio from './ImageTaggerStudio';
import '../VizWorkflow/vizworkflow.css';
import './boards.css';

const BoardCanvasEditor = nextDynamic(() => import('../VizWorkflow/BoardCanvasEditor'), { ssr: false });
const ObjectExtractorTab = nextDynamic(() => import('../VizWorkflow/ObjectExtractorTab'), { ssr: false });

type BoardsTab = 'material' | 'canvas' | 'extractor' | 'tagger';

const TABS: { k: BoardsTab; ic: string; lb: string }[] = [
    { k: 'material', ic: '▦', lb: 'Material Board' },
    { k: 'canvas', ic: '✂', lb: 'Board Canvas' },
    { k: 'extractor', ic: '⬚', lb: 'Object Extractor' },
    { k: 'tagger', ic: '◩', lb: 'Image Tagger' },
];

const LAST_PROJECT_KEY = 'dwp_boards_last_proj';

export default function BoardsApp() {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const dark = theme === 'dark';

    const [tab, setTab] = useState<BoardsTab>('material');
    const [projects, setProjects] = useState<VizProject[]>([]);
    const [proj, setProj] = useState<VizProject | null>(null);
    const [canvasEditor, setCanvasEditor] = useState<{ src: string; title: string } | null>(null);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

    // Load the same merged project list the pipeline shell uses, so per-project
    // storage keys (saved boards, sessions) line up across both apps.
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [{ data: requestData }, { data: vizProjectData }] = await Promise.all([
                    supabase.from('project_requests').select('*').order('created_at', { ascending: false }),
                    supabase.from('viz_projects').select('*'),
                ]);
                if (!alive) return;
                const merged = mergeProjects(requestData, vizProjectData);
                setProjects(merged);
                const lastId = localStorage.getItem(LAST_PROJECT_KEY);
                const last = lastId ? merged.find(p => p.id === lastId) : null;
                if (last) setProj(last);
            } catch (err) {
                console.error('[Boards] failed to load projects', err);
            }
        })();
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        logUsage({ eventType: 'page_view', feature: 'boards', detail: { initial: true } });
    }, []);

    const changeTab = (next: BoardsTab) => {
        setTab(next);
        logUsage({ eventType: 'page_view', feature: `boards:${next}` });
    };

    const selectProject = (id: string) => {
        const next = projects.find(p => p.id === id) || null;
        setProj(next);
        try {
            if (next) localStorage.setItem(LAST_PROJECT_KEY, next.id);
            else localStorage.removeItem(LAST_PROJECT_KEY);
        } catch { /* storage unavailable */ }
    };

    const openCanvas = (src: string, title: string) => setCanvasEditor({ src, title });
    const projKey = proj?.id || 'standalone';

    return (
        <div className={`vw-root ${dark ? 'viz-dark' : 'viz-light'}`}>
            <div className="vw-mn">
                {/* TOP BAR */}
                <div className="vw-bar">
                    <Link href="/pipeline" className="bs-back" title="Back to the 3D Pipeline">←</Link>
                    <span className="bs-brand">dwp<b>.</b>boards</span>
                    <div className="bs-tabs">
                        {TABS.map(t => (
                            <button key={t.k} className={`bs-tab ${tab === t.k ? 'on' : ''}`} onClick={() => changeTab(t.k)}>
                                <span className="bs-tab-ic">{t.ic}</span>{t.lb}
                            </button>
                        ))}
                    </div>
                    <div className="vw-bar-r">
                        <select
                            className="vw-fi bs-proj-select"
                            value={proj?.id || ''}
                            onChange={e => selectProject(e.target.value)}
                            title="Project — scopes saved boards and material schedules"
                        >
                            <option value="">No project (standalone)</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name || p.projectId || 'Untitled'}</option>
                            ))}
                        </select>
                        <button className="vw-bar-btn" onClick={toggleTheme} title="Toggle theme">{dark ? '☀' : '☾'}</button>
                        {user && <button className="vw-bar-btn" onClick={logout} title={`Sign out ${user.email || ''}`}>⎋</button>}
                    </div>
                </div>

                {/* CONTENT — Material & Tagger stay mounted (display toggle) so an
                    in-flight generation or uploaded images survive tab switches;
                    keyed per project so a project switch remounts and aborts stale
                    async work. Canvas re-reads IndexedDB cheaply, and the heavy
                    Object Extractor mounts on demand. */}
                <div className="bs-content">
                    <div style={{ display: tab === 'material' ? 'contents' : 'none' }}>
                        <MaterialBoardStudio key={projKey} proj={proj} active={tab === 'material'} onCanvasEdit={openCanvas} onFullscreen={setFullscreenImage} />
                    </div>
                    <div style={{ display: tab === 'tagger' ? 'contents' : 'none' }}>
                        <ImageTaggerStudio proj={proj} active={tab === 'tagger'} onCanvasEdit={openCanvas} onFullscreen={setFullscreenImage} />
                    </div>
                    {tab === 'canvas' && <BoardCanvasStudio key={projKey} proj={proj} onOpenCanvas={openCanvas} />}
                    {tab === 'extractor' && <div className="bs-extractor-wrap"><ObjectExtractorTab /></div>}
                </div>
            </div>

            {/* Fullscreen image overlay */}
            {fullscreenImage && (
                <div className="bs-fullscreen" onClick={() => setFullscreenImage(null)}>
                    <img src={fullscreenImage} alt="Fullscreen preview" />
                </div>
            )}

            {/* Shared canvas editor overlay */}
            {canvasEditor && (
                <BoardCanvasEditor
                    src={canvasEditor.src}
                    title={canvasEditor.title}
                    onClose={() => setCanvasEditor(null)}
                />
            )}
        </div>
    );
}
