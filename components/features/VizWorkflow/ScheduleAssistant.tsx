"use client";
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { CalendarClock, Send, X } from 'lucide-react';

interface Props { rawRequests: any[]; }
interface ChatMsg { role: 'user' | 'assistant'; content: string; }

// "achira.b@dwp.com" → "Achira B."
const emailToName = (email: string): string => {
    const local = email.split('@')[0];
    const parts = local.split('.');
    if (parts.length >= 2) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ' ' + parts[1].charAt(0).toUpperCase() + '.';
    }
    return local.charAt(0).toUpperCase() + local.slice(1);
};

const SUGGESTIONS = [
    'Who is available next week?',
    'Who has the most work right now?',
    'What deadlines are coming up this week?',
];

export default function ScheduleAssistant({ rawRequests }: Props) {
    const [open, setOpen] = useState(false);
    const [members, setMembers] = useState<{ email: string; name: string; role: string }[]>([]);
    const [membersLoaded, setMembersLoaded] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const bodyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open || membersLoaded) return;
        const fetchMembers = async () => {
            try {
                const { data } = await supabase
                    .from('threed_user_roles')
                    .select('email, role')
                    .in('role', ['member', 'outsource', 'leader']);
                setMembers((data || []).map(r => ({ email: r.email, name: emailToName(r.email), role: r.role })));
            } catch (err) {
                console.error('Failed to load members for schedule assistant:', err);
            } finally {
                setMembersLoaded(true);
            }
        };
        void fetchMembers();
    }, [open, membersLoaded]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, busy]);

    // Compact view of the schedule — only the fields the assistant needs.
    const schedule = useMemo(() => rawRequests
        .filter(r => r && r.deadline)
        .slice(0, 150)
        .map(r => ({
            project: `${r.project_number ? r.project_number + ' - ' : ''}${r.project_name || 'Untitled'}`,
            request: r.request_name || undefined,
            status: r.status || 'Submitted',
            assigned_to: r.assigned_to || null,
            start: String(r.start_date || r.timestamp || '').slice(0, 10) || undefined,
            deadline: r.deadline,
            areas: (Array.isArray(r.areas) ? r.areas : [])
                .filter((a: any) => a && a.scope && a.scope.trim() !== '')
                .map((a: any) => ({
                    scope: a.scope,
                    designer: a.designer || undefined,
                    assigned_to: a.assigned_to || undefined,
                    start: a.startDate || undefined,
                    target: a.targetDate || undefined,
                })),
        })), [rawRequests]);

    const send = async (text?: string) => {
        const question = (text ?? input).trim();
        if (!question || busy) return;

        const nextMessages: ChatMsg[] = [...messages, { role: 'user', content: question }];
        setMessages(nextMessages);
        setInput('');
        setBusy(true);

        try {
            const res = await fetch('/api/schedule-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Lets the assistant check coworkers' Google Calendar free/busy as you
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`,
                },
                body: JSON.stringify({ messages: nextMessages, schedule, members }),
            });
            const data = await res.json();
            const reply = res.ok
                ? (data.response || "Sorry, I couldn't produce an answer.")
                : `Something went wrong: ${data.error || res.status}`;
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Request failed: ${err?.message || 'network error'}` }]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {/* Floating toggle button — sits above the feedback button */}
            <button
                type="button"
                title="Ask about the 3D schedule"
                onClick={() => setOpen(o => !o)}
                style={{
                    position: 'fixed', bottom: 84, right: 24, zIndex: 1000,
                    width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: '#E8731A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(232, 115, 26, 0.4)',
                }}
            >
                {open ? <X size={22} color="#fff" /> : <CalendarClock size={22} color="#fff" />}
            </button>

            {/* Chat panel */}
            {open && (
                <div style={{
                    position: 'fixed', bottom: 144, right: 24, zIndex: 1000,
                    width: 360, maxWidth: 'calc(100vw - 48px)', height: 480, maxHeight: 'calc(100vh - 180px)',
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--card, #252526)', border: '1px solid var(--bdr, #3E3E42)', borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
                    fontFamily: "'DM Sans', sans-serif",
                }}>
                    {/* Header */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr, #2E2E2E)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarClock size={16} color="#E8731A" />
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx, #E8E8E8)' }}>Schedule Assistant</div>
                            <div style={{ fontSize: 9, color: 'var(--tx3, #888)' }}>Ask who's busy or free, based on the 3D Schedule &amp; Google Calendar</div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {messages.length === 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--tx3, #888)', marginBottom: 2 }}>Try asking:</div>
                                {SUGGESTIONS.map(s => (
                                    <button key={s} type="button" onClick={() => void send(s)}
                                        style={{
                                            textAlign: 'left', fontSize: 11, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                            background: 'var(--bg, #1A1A1A)', border: '1px solid var(--bdr, #3E3E42)', color: 'var(--tx2, #BBB)',
                                        }}
                                    >{s}</button>
                                ))}
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} style={{
                                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%', padding: '8px 11px', borderRadius: 10, fontSize: 11.5, lineHeight: 1.45,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                background: m.role === 'user' ? '#E8731A' : 'var(--bg, #1A1A1A)',
                                border: m.role === 'user' ? 'none' : '1px solid var(--bdr, #2E2E2E)',
                                color: m.role === 'user' ? '#fff' : 'var(--tx, #E8E8E8)',
                            }}>{m.content}</div>
                        ))}
                        {busy && (
                            <div style={{ alignSelf: 'flex-start', padding: '8px 11px', borderRadius: 10, fontSize: 11.5, background: 'var(--bg, #1A1A1A)', border: '1px solid var(--bdr, #2E2E2E)', color: 'var(--tx3, #888)' }}>
                                Checking the schedule…
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div style={{ padding: 10, borderTop: '1px solid var(--bdr, #2E2E2E)', display: 'flex', gap: 6 }}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                            placeholder='e.g. "Is Achira free on Friday?"'
                            style={{
                                flex: 1, fontSize: 11.5, padding: '8px 10px', borderRadius: 8, outline: 'none',
                                background: 'var(--bg, #1A1A1A)', border: '1px solid var(--bdr, #3E3E42)', color: 'var(--tx, #E8E8E8)',
                            }}
                        />
                        <button type="button" onClick={() => void send()} disabled={busy || !input.trim()}
                            style={{
                                width: 34, borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer',
                                background: busy || !input.trim() ? 'var(--bdr, #3E3E42)' : '#E8731A',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        ><Send size={14} color="#fff" /></button>
                    </div>
                </div>
            )}
        </>
    );
}
