"use client";
import React, { useState, useEffect, useCallback } from 'react';

interface LibEntry {
    id: string;
    prompt: string;
    name?: string;
    is_snippet?: boolean;
    usage_count?: number;
    is_top10?: boolean;
    tool?: string;
    phase?: string;
    mode?: string;
    llm?: string;
    notes?: string;
    designer?: string;
    project_name?: string;
    saved_by?: string;
    created_at: string;
}

export default function PromptLibraryTab({ projId }: { projId?: string }) {
    const [entries, setEntries] = useState<LibEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"global" | "project" | "top10">("global");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            let endpoint = '';
            if (activeTab === 'top10') endpoint = '/api/prompt-library/top';
            else if (activeTab === 'project' && projId) endpoint = `/api/project-prompts?projectId=${projId}`;
            else endpoint = '/api/prompt-library';

            const res = await fetch(endpoint);
            const data = await res.json();
            setEntries(data.entries || []);
        } catch { setEntries([]); }
        setLoading(false);
    }, [activeTab, projId]);

    useEffect(() => { load(); }, [load]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const copyText = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIds(prev => new Set(prev).add(id));
        setTimeout(() => setCopiedIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 1800);
    };

    const deleteEntry = async (id: string) => {
        if (!confirm('Remove this prompt from the global library?')) return;
        setDeletingId(id);
        try {
            await fetch('/api/prompt-library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
            setEntries(prev => prev.filter(e => e.id !== id));
        } catch { }
        setDeletingId(null);
    };

    const toggleTop10 = async (id: string, current: boolean) => {
        const nextState = !current;
        // Optimistic update
        setEntries(prev => prev.map(e => e.id === id ? { ...e, is_top10: nextState } : e));
        try {
            await fetch('/api/prompt-library', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_top10: nextState })
            });
        } catch {
            // Revert on error
            setEntries(prev => prev.map(e => e.id === id ? { ...e, is_top10: current } : e));
        }
    };

    const filtered = entries.filter(e =>
        !search.trim() ||
        e.prompt.toLowerCase().includes(search.toLowerCase()) ||
        (e.tool || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.project_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.phase || '').toLowerCase().includes(search.toLowerCase())
    );

    const PHASE_COLORS: Record<string, string> = { BSA: '#6B7280', CON: '#8B5CF6', SCH: '#E8731A', DD: '#2563EB' };

    return (
        <div className="vw-pnl">
            <div className="vw-ph" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div className="vw-ph-t">Prompt Library</div>
                    <div className="vw-ph-s">
                        {loading ? 'Loading…' : `${filtered.length} shared prompts — visible to all users`}
                    </div>
                </div>
                <button className="vw-btn vw-btn-g vw-btn-sm" onClick={load} disabled={loading}>↺ Refresh</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 12, padding: '0 18px 12px' }}>
                <button className={`vw-style-chip ${activeTab === 'global' ? 'on' : ''}`} onClick={() => setActiveTab('global')}>
                    Global Library
                </button>
                {projId && (
                    <button className={`vw-style-chip ${activeTab === 'project' ? 'on' : ''}`} onClick={() => setActiveTab('project')}>
                        Project Prompts
                    </button>
                )}
                <button className={`vw-style-chip ${activeTab === 'top10' ? 'on' : ''}`} onClick={() => setActiveTab('top10')}>
                    Top 10 Prompts
                </button>
            </div>

            {/* Search */}
            <div style={{ padding: '0 18px 12px' }}>
                <input
                    className="vw-fi"
                    style={{ width: '100%', fontSize: 11 }}
                    placeholder="Search by prompt, tool, phase, project…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="vw-empty"><div className="ei" style={{ fontSize: 24, opacity: .3 }}>◇</div><div className="et">Loading library…</div></div>
            ) : filtered.length === 0 ? (
                <div className="vw-empty">
                    <div className="ei">▦</div>
                    <div className="et">{search ? 'No results' : 'Library is empty'}</div>
                    <div className="es">{search ? 'Try a different search term.' : 'Save prompts from Prompt Gen to add them here. They\'ll be visible to everyone.'}</div>
                </div>
            ) : (
                <div style={{ padding: '0 18px' }}>
                    {filtered.map(e => {
                        const isExpanded = expandedIds.has(e.id);
                        const phaseColor = PHASE_COLORS[e.phase || ''] || 'var(--tx3)';
                        const date = new Date(e.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
                        return (
                            <div className="vw-lc" key={e.id}>
                                {/* Header row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {e.name && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx1)', marginRight: 4 }}>{e.name}</span>}
                                        {e.is_snippet && <span style={{ fontSize: 9, background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '2px 6px', borderRadius: 4 }}>Snippet</span>}
                                        {e.phase && (
                                            <span className="vw-badge" style={{ background: `${phaseColor}15` }}>
                                                <span className="vw-dot" style={{ background: phaseColor }} />
                                                {e.phase}
                                            </span>
                                        )}
                                        {e.tool && <span style={{ fontSize: 10, fontWeight: 600 }}>{e.tool}</span>}
                                        {e.llm && <span style={{ fontSize: 9, color: 'var(--tx3)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--bdr)' }}>{e.llm === 'claude' ? 'Claude Opus' : 'Gemini Flash'}</span>}
                                        {e.project_name && <span style={{ fontSize: 9, color: 'var(--or)', fontWeight: 500 }}>· {e.project_name}</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {activeTab === 'global' && (
                                            <button
                                                className={`vw-btn vw-btn-sm ${e.is_top10 ? 'vw-btn-ok' : 'vw-btn-g'}`}
                                                style={{ padding: '2px 6px', fontSize: 9, background: e.is_top10 ? 'rgba(234, 179, 8, 0.15)' : '', color: e.is_top10 ? '#eab308' : '', borderColor: e.is_top10 ? 'rgba(234,179,8,0.5)' : '' }}
                                                onClick={(ev) => { ev.stopPropagation(); toggleTop10(e.id, !!e.is_top10); }}
                                                title={e.is_top10 ? 'Remove from Top 10' : 'Add to Top 10'}
                                            >
                                                {e.is_top10 ? '★ Top 10' : '☆ Pin Top 10'}
                                            </button>
                                        )}
                                        {e.usage_count !== undefined && e.usage_count > 0 && <span style={{ fontSize: 9, color: 'var(--tx2)', fontWeight: 500, marginRight: 4 }}>★ {e.usage_count} uses</span>}
                                        <span className="vw-mono" style={{ fontSize: 9 }}>{date}</span>
                                        {e.saved_by && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{e.saved_by}</span>}
                                        <button
                                            className="vw-btn vw-btn-g vw-btn-sm"
                                            style={{ padding: '2px 6px', fontSize: 9, opacity: deletingId === e.id ? .4 : 1 }}
                                            onClick={(ev) => {
                                                ev.stopPropagation();
                                                if (activeTab === 'top10') {
                                                    toggleTop10(e.id, !!e.is_top10);
                                                    setTimeout(() => {
                                                        setEntries(prev => prev.filter(item => item.id !== e.id));
                                                    }, 300);
                                                } else {
                                                    deleteEntry(e.id);
                                                }
                                            }}
                                            title={activeTab === 'top10' ? "Unpin from Top 10" : "Delete from Library"}
                                            disabled={deletingId === e.id}
                                        >✕</button>
                                    </div>
                                </div>

                                {/* Prompt text */}
                                <div
                                    className={`vw-lp ${isExpanded ? 'expanded' : ''}`}
                                    onClick={() => toggleExpand(e.id)}
                                >
                                    {e.prompt}
                                </div>
                                <div className="vw-lp-toggle" onClick={() => toggleExpand(e.id)}>
                                    {isExpanded ? '▲ Collapse' : '▼ Show full prompt'}
                                </div>

                                {/* Actions when expanded */}
                                {isExpanded && (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
                                        <button
                                            className={`vw-btn vw-btn-sm ${copiedIds.has(e.id) ? 'vw-btn-ok' : 'vw-btn-g'}`}
                                            style={{ transition: 'all 0.2s' }}
                                            onClick={() => copyText(e.prompt, e.id)}
                                        >
                                            {copiedIds.has(e.id) ? '✓ Copied' : 'Copy prompt'}
                                        </button>
                                    </div>
                                )}

                                {/* Footer meta */}
                                {(e.notes || e.mode) && (
                                    <div className="vw-lm" style={{ marginTop: 6 }}>
                                        {e.mode && <span>Mode: {e.mode}</span>}
                                        {e.notes && <span>· {e.notes}</span>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
