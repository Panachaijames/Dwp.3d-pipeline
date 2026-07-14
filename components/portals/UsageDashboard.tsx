"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
    Activity, Users, LogIn, Zap, MousePointerClick,
    RefreshCw, Download, Search, AlertCircle,
} from 'lucide-react';

interface UsageEvent {
    id: string;
    email: string | null;
    name: string | null;
    role: string | null;
    event_type: 'login' | 'logout' | 'page_view' | 'api_call' | string;
    feature: string | null;
    detail: Record<string, unknown> | null;
    path: string | null;
    user_agent: string | null;
    created_at: string;
}

type RangeKey = 'today' | '7d' | '30d' | 'all';
type TypeFilter = 'all' | 'login' | 'page_view' | 'api_call';

const RANGES: { key: RangeKey; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'all', label: 'All time' },
];

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'All events' },
    { key: 'login', label: 'Logins' },
    { key: 'page_view', label: 'Features' },
    { key: 'api_call', label: 'API calls' },
];

const rangeStartISO = (range: RangeKey): string | null => {
    if (range === 'all') return null;
    const now = new Date();
    if (range === 'today') {
        now.setHours(0, 0, 0, 0);
        return now.toISOString();
    }
    const days = range === '7d' ? 7 : 30;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const featureLabel = (feature: string | null): string => {
    if (!feature) return '—';
    if (feature.startsWith('api:')) return feature.slice(4);
    return feature;
};

const typeBadge = (type: string) => {
    switch (type) {
        case 'login': return { label: 'Login', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
        case 'logout': return { label: 'Logout', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' };
        case 'page_view': return { label: 'Feature', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
        case 'api_call': return { label: 'API', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
        default: return { label: type, cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' };
    }
};

const relativeTime = (iso: string): string => {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
};

const detailSummary = (event: UsageEvent): string => {
    const d = event.detail;
    if (!d) return '';
    if (event.event_type === 'api_call') {
        const parts: string[] = [];
        if (d.method) parts.push(String(d.method));
        if (d.status !== undefined) parts.push(`→ ${d.status}`);
        if (typeof d.ms === 'number') parts.push(`${d.ms}ms`);
        return parts.join(' ');
    }
    if (event.event_type === 'login') {
        return d.resumed ? 'resumed session' : 'new sign-in';
    }
    return '';
};

export const UsageDashboard: React.FC = () => {
    const [events, setEvents] = useState<UsageEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [range, setRange] = useState<RangeKey>('7d');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [search, setSearch] = useState('');

    const fetchEvents = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = opts?.silent === true;
        if (!silent) setLoading(true);
        try {
            let query = supabase
                .from('threed_usage_events')
                .select('*');

            const start = rangeStartISO(range);
            if (start) query = query.gte('created_at', start);

            const { data, error: queryError } = await query
                .order('created_at', { ascending: false })
                .limit(2000);
            if (queryError) throw queryError;
            setEvents((data as UsageEvent[]) || []);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load usage events:', err);
            // On a background refresh, keep the current data instead of wiping
            // it and flashing an error.
            if (!silent) {
                setError(err?.message || 'Failed to load usage events.');
                setEvents([]);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [range]);

    // Initial load + reload when the date range changes (shows the spinner).
    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // Live updates: realtime INSERT subscription (coalesced) + a 30s fallback
    // poll so new activity appears without hitting Refresh. The poll keeps
    // things live even if realtime isn't enabled on the table.
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const scheduleSilentRefresh = () => {
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            refreshTimer.current = setTimeout(() => { void fetchEvents({ silent: true }); }, 1500);
        };

        const channel = supabase
            .channel('threed_usage_events_feed')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'threed_usage_events' },
                () => scheduleSilentRefresh()
            )
            .subscribe();

        const interval = setInterval(() => { void fetchEvents({ silent: true }); }, 30_000);

        return () => {
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [fetchEvents]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return events.filter((e) => {
            if (typeFilter !== 'all' && e.event_type !== typeFilter) return false;
            if (!term) return true;
            return (
                (e.email || '').toLowerCase().includes(term) ||
                (e.name || '').toLowerCase().includes(term) ||
                (e.feature || '').toLowerCase().includes(term)
            );
        });
    }, [events, typeFilter, search]);

    const stats = useMemo(() => {
        const uniqueUsers = new Set<string>();
        let logins = 0, pageViews = 0, apiCalls = 0;
        for (const e of events) {
            if (e.email) uniqueUsers.add(e.email);
            if (e.event_type === 'login') logins++;
            else if (e.event_type === 'page_view') pageViews++;
            else if (e.event_type === 'api_call') apiCalls++;
        }
        return { uniqueUsers: uniqueUsers.size, logins, pageViews, apiCalls };
    }, [events]);

    // Who came in — one row per user, most recently active first.
    const perUser = useMemo(() => {
        const map = new Map<string, { email: string; name: string; role: string; lastSeen: string; logins: number; actions: number }>();
        for (const e of events) {
            const key = e.email || '(anonymous)';
            const entry = map.get(key) || {
                email: key,
                name: e.name || '',
                role: e.role || '',
                lastSeen: e.created_at,
                logins: 0,
                actions: 0,
            };
            if (e.name && !entry.name) entry.name = e.name;
            if (e.role && !entry.role) entry.role = e.role;
            if (new Date(e.created_at) > new Date(entry.lastSeen)) entry.lastSeen = e.created_at;
            if (e.event_type === 'login') entry.logins++;
            if (e.event_type === 'page_view' || e.event_type === 'api_call') entry.actions++;
            map.set(key, entry);
        }
        return Array.from(map.values()).sort(
            (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
        );
    }, [events]);

    // What functions — one row per feature, most used first.
    const perFeature = useMemo(() => {
        const map = new Map<string, { feature: string; count: number; users: Set<string> }>();
        for (const e of events) {
            if (e.event_type !== 'page_view' && e.event_type !== 'api_call') continue;
            const key = e.feature || '—';
            const entry = map.get(key) || { feature: key, count: 0, users: new Set<string>() };
            entry.count++;
            if (e.email) entry.users.add(e.email);
            map.set(key, entry);
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [events]);

    const exportCsv = useCallback(() => {
        const header = ['time', 'email', 'name', 'role', 'event_type', 'feature', 'detail', 'path', 'user_agent'];
        const escape = (v: unknown) => {
            const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
            return `"${s.replace(/"/g, '""')}"`;
        };
        const rows = filtered.map((e) => [
            new Date(e.created_at).toISOString(),
            e.email, e.name, e.role, e.event_type, e.feature,
            e.detail, e.path, e.user_agent,
        ].map(escape).join(','));
        const csv = [header.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [filtered, range]);

    const cards = [
        { icon: Users, label: 'Unique users', value: stats.uniqueUsers, color: 'text-orange-500' },
        { icon: LogIn, label: 'Sign-ins', value: stats.logins, color: 'text-green-500' },
        { icon: MousePointerClick, label: 'Feature opens', value: stats.pageViews, color: 'text-blue-500' },
        { icon: Zap, label: 'API calls', value: stats.apiCalls, color: 'text-purple-500' },
    ];

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
                    {RANGES.map((r) => (
                        <button
                            key={r.key}
                            onClick={() => setRange(r.key)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${range === r.key ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-600 dark:text-green-400 mr-1" title="Auto-refreshing (realtime + every 30s)">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        Live
                    </span>
                    <button
                        onClick={() => fetchEvents()}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={exportCsv}
                        disabled={filtered.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-3 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                        <Download size={14} />
                        Export CSV
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                        <div className="font-medium">Couldn&apos;t load usage data.</div>
                        <div className="text-xs mt-1 opacity-80">{error} — if this is the first run, apply the <code>threed_usage_events</code> migration in Supabase.</div>
                    </div>
                </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((c) => (
                    <div key={c.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                        <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-2">
                            <c.icon size={15} className={c.color} />
                            {c.label}
                        </div>
                        <div className="text-3xl font-bold text-zinc-900 dark:text-white tabular-nums">{c.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Who came in */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                        <Users size={16} className="text-orange-500" />
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Who came in</h3>
                        <span className="text-xs text-zinc-500 ml-auto">{perUser.length} users</span>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 text-xs">
                                <tr>
                                    <th className="px-5 py-2.5 font-medium">User</th>
                                    <th className="px-3 py-2.5 font-medium">Role</th>
                                    <th className="px-3 py-2.5 font-medium text-right">Sign-ins</th>
                                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Last seen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {perUser.map((u) => (
                                    <tr key={u.email} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                                        <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200">
                                            <div className="font-medium truncate max-w-[180px]">{u.name || u.email}</div>
                                            {u.name && <div className="text-[11px] text-zinc-500 truncate max-w-[180px]">{u.email}</div>}
                                        </td>
                                        <td className="px-3 py-2.5 text-zinc-500 capitalize">{u.role || '—'}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{u.logins}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{u.actions}</td>
                                        <td className="px-5 py-2.5 text-right text-zinc-500 text-xs whitespace-nowrap">{relativeTime(u.lastSeen)}</td>
                                    </tr>
                                ))}
                                {!loading && perUser.length === 0 && (
                                    <tr><td colSpan={5} className="px-5 py-8 text-center text-zinc-500 text-sm">No activity in this range.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* What functions */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                        <Activity size={16} className="text-purple-500" />
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">What functions</h3>
                        <span className="text-xs text-zinc-500 ml-auto">{perFeature.length} features</span>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 text-xs">
                                <tr>
                                    <th className="px-5 py-2.5 font-medium">Feature</th>
                                    <th className="px-3 py-2.5 font-medium text-right">Uses</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Users</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {perFeature.map((f) => (
                                    <tr key={f.feature} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                                        <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 font-mono text-xs">{featureLabel(f.feature)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{f.count}</td>
                                        <td className="px-5 py-2.5 text-right tabular-nums text-zinc-500">{f.users.size}</td>
                                    </tr>
                                ))}
                                {!loading && perFeature.length === 0 && (
                                    <tr><td colSpan={3} className="px-5 py-8 text-center text-zinc-500 text-sm">No feature usage in this range.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Activity feed */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-sm flex items-center gap-2">
                        <Activity size={16} className="text-blue-500" />
                        Activity feed
                    </h3>
                    <div className="flex items-center gap-2 sm:ml-auto">
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter by user or feature..."
                                className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white outline-none focus:border-orange-500 w-52"
                            />
                        </div>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                            className="py-1.5 px-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white outline-none focus:border-orange-500"
                        >
                            {TYPE_FILTERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                    </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 text-xs sticky top-0">
                            <tr>
                                <th className="px-5 py-2.5 font-medium">When</th>
                                <th className="px-3 py-2.5 font-medium">User</th>
                                <th className="px-3 py-2.5 font-medium">Type</th>
                                <th className="px-3 py-2.5 font-medium">Feature</th>
                                <th className="px-5 py-2.5 font-medium">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {loading ? (
                                <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500 text-sm">Loading activity…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500 text-sm">No matching events.</td></tr>
                            ) : (
                                filtered.slice(0, 500).map((e) => {
                                    const badge = typeBadge(e.event_type);
                                    return (
                                        <tr key={e.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                                            <td className="px-5 py-2.5 text-zinc-500 text-xs whitespace-nowrap" title={new Date(e.created_at).toLocaleString()}>{relativeTime(e.created_at)}</td>
                                            <td className="px-3 py-2.5 text-zinc-900 dark:text-zinc-200 truncate max-w-[180px]">{e.name || e.email || '(anonymous)'}</td>
                                            <td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span></td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-300">{featureLabel(e.feature)}</td>
                                            <td className="px-5 py-2.5 text-zinc-500 text-xs">{detailSummary(e)}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 500 && (
                    <div className="px-5 py-2.5 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-center">
                        Showing 500 of {filtered.length} events — narrow the range or export CSV for the full set.
                    </div>
                )}
            </div>
        </div>
    );
};
