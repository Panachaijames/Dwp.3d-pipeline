import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/services/supabaseClient';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, User, Trash2, Pencil, Plus } from 'lucide-react';

interface ScheduleTabProps {
    rawRequests: any[];
    setRawRequests: React.Dispatch<React.SetStateAction<any[]>>;
}

interface ThreeDMember {
    email: string;
    role: string;
    name?: string;
    avatar_url?: string;
}

interface EditForm {
    request_name: string;
    status: string;
    priority: string;
    start: string;      // YYYY-MM-DD
    deadline: string;   // YYYY-MM-DD
    description: string;
    areas: any[];
}

interface DragState {
    kind: 'req' | 'area';
    reqId: string;
    areaIdx: number; // index into req.areas (-1 for kind 'req')
    mode: 'move' | 'start' | 'end';
    originX: number;
    dayWidth: number;
    delta: number; // days
    origStart: string;
    origEnd: string;
}

const DAY_MS = 86400000;
const shiftDate = (str: string, days: number) => new Date(new Date(str).getTime() + days * DAY_MS);
// Format using local date parts — the grid positions bars by local dates, so the stored
// date must match what the user saw while dragging.
const toDateOnly = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const saveErrorText = (error: { message?: string } | null) => {
    const msg = error?.message || 'unknown error';
    const hint = msg.includes('does not exist')
        ? '\n\nThe database is missing the new schedule columns. Run supabase/migrations/20260713120000_add_schedule_move_columns.sql in the Supabase SQL editor, then try again.'
        : '';
    return `Failed to save the changes: ${msg}${hint}`;
};

// Resolve the dates a bar should show while it is being dragged (snapped to whole days, start never past end)
const dragDates = (d: DragState) => {
    let s = new Date(d.origStart);
    let e = new Date(d.origEnd);
    if (d.mode === 'move' || d.mode === 'start') s = shiftDate(d.origStart, d.delta);
    if (d.mode === 'move' || d.mode === 'end') e = shiftDate(d.origEnd, d.delta);
    if (s > e) { if (d.mode === 'start') s = new Date(e); else e = new Date(s); }
    return { start: s, end: e };
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PALETTE = [
    { bg: '#E8731A20', border: '#E8731A' },
    { bg: '#3B82F620', border: '#3B82F6' },
    { bg: '#8B5CF620', border: '#8B5CF6' },
    { bg: '#EC489920', border: '#EC4899' },
    { bg: '#10B98120', border: '#10B981' },
    { bg: '#F59E0B20', border: '#F59E0B' },
    { bg: '#06B6D420', border: '#06B6D4' },
    { bg: '#EF444420', border: '#EF4444' },
];

const AREA_PALETTE = [
    { bg: '#60A5FA18', border: '#60A5FA' },
    { bg: '#A78BFA18', border: '#A78BFA' },
    { bg: '#F472B618', border: '#F472B6' },
];

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'Submitted': { bg: '#E8731A22', border: '#E8731A', text: '#E8731A' },
    'In Progress': { bg: '#3B82F622', border: '#3B82F6', text: '#60A5FA' },
    'Completed': { bg: '#10B98122', border: '#10B981', text: '#34D399' },
};

// Extract a short display name from email: "achira.b@dwp.com" → "Achira B."
const emailToName = (email: string): string => {
    const local = email.split('@')[0]; // "achira.b"
    const parts = local.split('.');
    if (parts.length >= 2) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ' ' + parts[1].charAt(0).toUpperCase() + '.';
    }
    return local.charAt(0).toUpperCase() + local.slice(1);
};

export default function ScheduleTab({ rawRequests, setRawRequests }: ScheduleTabProps) {
    const [members, setMembers] = useState<ThreeDMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigningId, setAssigningId] = useState<string | null>(null);
    const [newPersonText, setNewPersonText] = useState('');
    const [addingPerson, setAddingPerson] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [drag, setDrag] = useState<DragState | null>(null);
    const [editingReq, setEditingReq] = useState<any | null>(null);

    const now = new Date();
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewMonth, setViewMonth] = useState(now.getMonth());

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                // Get assignable 3D team members (member + outsource + leader roles)
                const { data: roleData } = await supabase
                    .from('threed_user_roles')
                    .select('email, role')
                    .in('role', ['member', 'outsource', 'leader']);

                // Also fetch display info from threed_team_status for avatars/names  
                const { data: statusData } = await supabase
                    .from('threed_team_status')
                    .select('name, avatar_url');

                const memberList: ThreeDMember[] = (roleData || []).map(r => {
                    // Try to match with team_status for name/avatar
                    const shortName = emailToName(r.email);
                    const match = (statusData || []).find(s =>
                        s.name?.toLowerCase().startsWith(shortName.split(' ')[0].toLowerCase())
                    );
                    return {
                        email: r.email,
                        role: r.role,
                        name: match?.name || emailToName(r.email),
                        avatar_url: match?.avatar_url,
                    };
                });

                setMembers(memberList);
            } catch (err) {
                console.error("Failed to load 3D members:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMembers();
    }, []);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };
    const goToday = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); };

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysArr = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59);

    const visibleRequests = useMemo(() => {
        return rawRequests.filter(req => {
            if (!(req.start_date || req.timestamp) || !req.deadline) return false;
            const s = new Date(req.start_date || req.timestamp);
            const e = new Date(req.deadline);
            return s <= monthEnd && e >= monthStart;
        });
    }, [rawRequests, viewYear, viewMonth]);

    const handleAssign = async (requestId: string, memberEmail: string | null) => {
        // Optimistic UI update
        setRawRequests(prev => prev.map(req => req.id === requestId ? { ...req, assigned_to: memberEmail } : req));
        setAssigningId(null);
        await supabase.from('project_requests').update({ assigned_to: memberEmail }).eq('id', requestId);

        // Send email notification to the assigned member (only on assign, not unassign)
        if (memberEmail) {
            const req = rawRequests.find(r => r.id === requestId);
            const member = members.find(m => m.email === memberEmail);
            if (req) {
                try {
                    const { notifyAssignedMember } = await import('../../../services/emailService');
                    await notifyAssignedMember(memberEmail, member?.name || emailToName(memberEmail), {
                        project_name: req.project_name,
                        project_number: req.project_number,
                        request_name: req.request_name,
                        deadline: req.deadline,
                        status: req.status,
                        priority: req.priority,
                    });
                    console.log(`✅ Assignment notification sent to ${memberEmail}`);
                } catch (err) {
                    console.error('⚠️ Failed to send assignment notification:', err);
                }
            }
        }
    };

    // Assign a member to ONE area of a request (stored inside the areas JSON),
    // independent of the request-level assigned_to.
    const handleAssignArea = async (req: any, areaIdx: number, member: ThreeDMember | null) => {
        const prevAreas = req.areas;
        const area = (req.areas || [])[areaIdx];
        const newAreas = (req.areas || []).map((a: any, i: number) =>
            i === areaIdx
                ? { ...a, assigned_to: member?.email || null, designer: member ? (member.name || emailToName(member.email)) : '' }
                : a
        );
        setRawRequests(prev => prev.map(r => r.id === req.id ? { ...r, areas: newAreas } : r));
        setAssigningId(null);

        const { error } = await supabase.from('project_requests').update({ areas: newAreas }).eq('id', req.id);
        if (error) {
            console.error('Failed to assign area:', error);
            setRawRequests(prev => prev.map(r => r.id === req.id ? { ...r, areas: prevAreas } : r));
            alert(`Failed to save the assignment: ${error.message}`);
            return;
        }

        if (member && area) {
            try {
                const { notifyAssignedMember } = await import('../../../services/emailService');
                await notifyAssignedMember(member.email, member.name || emailToName(member.email), {
                    project_name: req.project_name,
                    project_number: req.project_number,
                    request_name: `${req.request_name || req.project_name || ''} — Area: ${area.scope}`,
                    deadline: area.targetDate || req.deadline,
                    status: req.status,
                    priority: req.priority,
                });
            } catch (err) {
                console.error('⚠️ Failed to send area assignment notification:', err);
            }
        }
    };

    // Add a person who isn't in the member list yet so they can be assigned.
    // Saved to threed_user_roles (the table Settings manages) so they show up in
    // every assign list from now on. Never overwrites an existing row's role.
    const handleAddPerson = async (): Promise<ThreeDMember | null> => {
        let email = newPersonText.trim().toLowerCase();
        if (!email) return null;
        if (!email.includes('@')) email = `${email.replace(/\s+/g, '.')}@dwp.com`;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('Please enter a valid email, e.g. somchai.k@dwp.com');
            return null;
        }

        const existing = members.find(m => m.email === email);
        if (existing) { setNewPersonText(''); return existing; }

        setAddingPerson(true);
        try {
            const { data: existingRow } = await supabase
                .from('threed_user_roles')
                .select('email, role')
                .eq('email', email)
                .maybeSingle();

            if (!existingRow) {
                const { error } = await supabase
                    .from('threed_user_roles')
                    .insert({ email, role: 'member' });
                if (error) {
                    console.error('Failed to save new person to member list:', error);
                    alert(`Assigned for now, but couldn't save ${email} to the member list: ${error.message}\nThey may disappear from the list after a refresh.`);
                }
            }

            const person: ThreeDMember = {
                email,
                role: existingRow?.role || 'member',
                name: emailToName(email),
            };
            setMembers(prev => [...prev, person]);
            setNewPersonText('');
            return person;
        } finally {
            setAddingPerson(false);
        }
    };

    // Small "add person" row at the bottom of both assign dropdowns.
    const renderAddPerson = (onPick: (m: ThreeDMember) => void) => {
        const submit = async () => {
            const person = await handleAddPerson();
            if (person) onPick(person);
        };
        const disabled = addingPerson || !newPersonText.trim();
        return (
            <div style={{ borderTop: '1px solid #ffffff10', marginTop: 4, paddingTop: 6, display: 'flex', gap: 4 }}>
                <input
                    value={newPersonText}
                    onChange={e => setNewPersonText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
                    placeholder="somchai.k@dwp.com"
                    style={{
                        flex: 1, minWidth: 0, background: '#ffffff08', border: '1px solid #ffffff15',
                        borderRadius: 4, padding: '5px 6px', fontSize: 10, color: 'var(--tx, #E8E8E8)', outline: 'none',
                    }}
                />
                <button
                    onClick={() => void submit()}
                    disabled={disabled}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', borderRadius: 4,
                        background: '#3B82F620', border: '1px solid #3B82F650', color: '#60A5FA',
                        fontSize: 10, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                    }}
                >
                    <Plus size={9} /> Add
                </button>
            </div>
        );
    };

    // Save edits made in the Edit Request modal, then mirror them to Google Calendar.
    const handleSaveEdit = async (form: EditForm) => {
        const req = editingReq;
        if (!req) return;
        const original = req;
        const initialStart = String(req.start_date || req.timestamp || '').slice(0, 10);

        const payload: Record<string, any> = {
            request_name: form.request_name,
            status: form.status,
            priority: form.priority,
            deadline: form.deadline,
            description: form.description,
            areas: form.areas,
        };
        // Only touch start_date when it actually changed — the column may not exist
        // until the migration is applied, and other edits shouldn't fail because of it.
        if (form.start && form.start !== initialStart) payload.start_date = form.start;

        setRawRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...payload } : r));
        setEditingReq(null);

        const { error } = await supabase.from('project_requests').update(payload).eq('id', req.id);
        if (error) {
            console.error('Failed to save request edits:', error);
            setRawRequests(prev => prev.map(r => r.id === req.id ? original : r));
            alert(saveErrorText(error));
            return;
        }

        const startIso = payload.start_date || req.start_date || req.timestamp;
        void syncRequestToCalendar({ ...req, description: form.description }, startIso, form.deadline, form.request_name);
    };

    const handleDelete = async (requestId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this request? This action cannot be undone.")) {
            const reqRow = rawRequests.find(r => r.id === requestId);

            // Optimistic update
            setRawRequests(prev => prev.filter(r => r.id !== requestId));

            try {
                const { error } = await supabase.from('project_requests').delete().eq('id', requestId);
                if (error) throw error;
            } catch (err) {
                console.error("Failed to delete request:", err);
                alert("Failed to delete the request. Please try again.");
                return;
            }

            // Remove the matching Google Calendar event too (non-fatal if it fails).
            if (reqRow && reqRow.project_name && reqRow.deadline) {
                try {
                    await fetch('/api/calendar/delete-event', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                        },
                        body: JSON.stringify({
                            eventId: reqRow.gcal_event_id || undefined,
                            requestId: reqRow.id,
                            projectName: reqRow.project_name,
                            projectNumber: reqRow.project_number,
                            requestName: reqRow.request_name,
                            startDate: reqRow.start_date || reqRow.timestamp,
                            deadline: reqRow.deadline,
                        })
                    });
                } catch (calErr) {
                    console.error('Calendar event delete failed (non-fatal):', calErr);
                }
            }
        }
    };

    const getBarStyle = (startStr: string | Date, endStr: string | Date) => {
        const s = new Date(startStr);
        const e = new Date(endStr);
        const clampedStart = s < monthStart ? 1 : s.getDate();
        const clampedEnd = e > monthEnd ? daysInMonth : e.getDate();
        const span = Math.max(1, clampedEnd - clampedStart + 1);
        return { gridColumnStart: clampedStart, gridColumnEnd: clampedStart + span };
    };

    // Get valid areas (areas that have a scope name filled in), keeping their index in req.areas for updates
    const getValidAreas = (req: any) => {
        if (!req.areas || !Array.isArray(req.areas)) return [];
        return req.areas
            .map((a: any, i: number) => ({ ...a, __idx: i }))
            .filter((a: any) => a && a.scope && a.scope.trim() !== '');
    };

    const startDrag = (
        e: React.PointerEvent,
        kind: 'req' | 'area',
        reqId: string,
        areaIdx: number,
        mode: 'move' | 'start' | 'end',
        origStart: string,
        origEnd: string,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        const gridEl = (e.currentTarget as HTMLElement).closest('[data-gantt-grid]');
        const dayWidth = gridEl ? gridEl.getBoundingClientRect().width / daysInMonth : 30;
        setDrag({ kind, reqId, areaIdx, mode, originX: e.clientX, dayWidth, delta: 0, origStart, origEnd });
    };

    // Mirror a request's dates/title onto Google Calendar (direct API, acting as
    // the signed-in user). Works even when no event id is stored yet: the route
    // finds the event by request-id tag or title (or creates one), and we
    // remember the id it returns for next time.
    const syncRequestToCalendar = async (req: any, startIso: string, deadlineStr: string, requestName?: string) => {
        if (!req?.project_name || !deadlineStr) return;
        try {
            const res = await fetch('/api/calendar/update-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                },
                body: JSON.stringify({
                    eventId: req.gcal_event_id || undefined,
                    requestId: req.id,
                    projectName: req.project_name,
                    projectNumber: req.project_number,
                    requestName: requestName ?? req.request_name,
                    startDate: startIso,
                    deadline: deadlineStr,
                    description: req.description,
                })
            });
            const data = await res.json().catch(() => null);
            const newEventId = data?.eventId || data?.id;
            if (res.ok && newEventId && newEventId !== req.gcal_event_id) {
                setRawRequests(prev => prev.map(r => r.id === req.id ? { ...r, gcal_event_id: newEventId } : r));
                // Best-effort: the gcal_event_id column may not exist until the migration runs.
                const { error } = await supabase.from('project_requests').update({ gcal_event_id: newEventId }).eq('id', req.id);
                if (error) console.debug('Could not store gcal_event_id (non-fatal):', error.message);
            }
        } catch (calErr) {
            console.error('Calendar sync failed (non-fatal):', calErr);
        }
    };

    const commitDrag = async () => {
        if (!drag) return;
        const d = drag;
        setDrag(null);
        if (d.delta === 0) return;

        const { start, end } = dragDates(d);
        const req = rawRequests.find(r => r.id === d.reqId);
        if (!req) return;

        if (d.kind === 'req') {
            const startIso = start.toISOString();
            const deadlineStr = toDateOnly(end);
            const prevStart = req.start_date ?? null;
            const prevDeadline = req.deadline;

            setRawRequests(prev => prev.map(r => r.id === d.reqId ? { ...r, start_date: startIso, deadline: deadlineStr } : r));
            const { error } = await supabase
                .from('project_requests')
                .update({ start_date: startIso, deadline: deadlineStr })
                .eq('id', d.reqId);
            if (error) {
                console.error('Failed to reschedule request:', error);
                setRawRequests(prev => prev.map(r => r.id === d.reqId ? { ...r, start_date: prevStart, deadline: prevDeadline } : r));
                alert(saveErrorText(error));
                return;
            }

            // Mirror the change onto Google Calendar (finds or creates the event as needed)
            void syncRequestToCalendar(req, startIso, deadlineStr);
        } else {
            const prevAreas = req.areas;
            const newAreas = (req.areas || []).map((a: any, i: number) =>
                i === d.areaIdx ? { ...a, startDate: toDateOnly(start), targetDate: toDateOnly(end) } : a
            );
            setRawRequests(prev => prev.map(r => r.id === d.reqId ? { ...r, areas: newAreas } : r));
            const { error } = await supabase.from('project_requests').update({ areas: newAreas }).eq('id', d.reqId);
            if (error) {
                console.error('Failed to reschedule area:', error);
                setRawRequests(prev => prev.map(r => r.id === d.reqId ? { ...r, areas: prevAreas } : r));
                alert(saveErrorText(error));
            }
        }
    };

    useEffect(() => {
        if (!drag) return;
        const onMove = (e: PointerEvent) => {
            setDrag(prev => prev ? { ...prev, delta: Math.round((e.clientX - prev.originX) / prev.dayWidth) } : prev);
        };
        const onUp = () => { void commitDrag(); };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [drag]);

    const todayDate = now.getDate();
    const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', fontFamily: "'DM Sans', sans-serif" }}>
                Loading Schedule...
            </div>
        );
    }

    // Helper: Render day cell backgrounds for a row
    const renderDayCells = (isSubRow = false) => (
        daysArr.map(day => {
            const date = new Date(viewYear, viewMonth, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isTodayCol = isCurrentMonth && day === todayDate;
            return (
                <div key={day} style={{
                    borderRight: '1px solid var(--bdr, #2E2E2E)',
                    background: isTodayCol ? '#E8731A08' : isWeekend ? '#00000010' : isSubRow ? '#ffffff02' : 'transparent',
                }} />
            );
        })
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg, #1A1A1A)', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden' }} onClick={() => setAssigningId(null)}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--bdr, #2E2E2E)', background: 'var(--card, #252526)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Calendar style={{ color: '#E8731A', width: 20, height: 20 }} />
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--tx, #E8E8E8)', letterSpacing: '-0.3px' }}>3D Schedule</h2>
                        <span style={{ fontSize: 10, color: 'var(--tx3, #888)' }}>Visualize workload &amp; assign projects · drag bars to reschedule (syncs to Google Calendar)</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={goToday} style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600, background: 'var(--bg, #1A1A1A)', border: '1px solid var(--bdr, #3E3E42)', borderRadius: 6, color: 'var(--tx2, #BBB)', cursor: 'pointer' }}>Today</button>
                    <button onClick={prevMonth} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--bdr, #3E3E42)', borderRadius: 6, color: 'var(--tx2, #BBB)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx, #E8E8E8)', minWidth: 140, textAlign: 'center' }}>
                        {MONTH_NAMES[viewMonth]} {viewYear}
                    </span>
                    <button onClick={nextMonth} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--bdr, #3E3E42)', borderRadius: 6, color: 'var(--tx2, #BBB)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <ChevronRight size={14} />
                    </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx3, #888)' }}>
                    {visibleRequests.length} request{visibleRequests.length !== 1 ? 's' : ''} this month
                </div>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {/* Day Headers */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `200px repeat(${daysInMonth}, 1fr)`,
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    background: 'var(--card, #252526)',
                    borderBottom: '1px solid var(--bdr, #2E2E2E)',
                }}>
                    <div style={{ padding: '8px 12px', fontSize: 9, fontWeight: 700, color: 'var(--tx3, #888)', textTransform: 'uppercase', letterSpacing: '0.5px', borderRight: '1px solid var(--bdr, #2E2E2E)' }}>
                        Project
                    </div>
                    {daysArr.map(day => {
                        const date = new Date(viewYear, viewMonth, day);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isTodayCol = isCurrentMonth && day === todayDate;
                        return (
                            <div key={day} style={{
                                padding: '4px 0', textAlign: 'center',
                                borderRight: '1px solid var(--bdr, #2E2E2E)',
                                background: isTodayCol ? '#E8731A15' : isWeekend ? '#00000020' : 'transparent',
                            }}>
                                <div style={{ fontSize: 8, color: isWeekend ? '#555' : 'var(--tx3, #888)', textTransform: 'uppercase', fontWeight: 600 }}>
                                    {date.toLocaleDateString('en-US', { weekday: 'narrow' })}
                                </div>
                                <div style={{
                                    fontSize: 11, fontWeight: isTodayCol ? 800 : 500,
                                    color: isTodayCol ? '#fff' : 'var(--tx2, #BBB)',
                                    ...(isTodayCol ? { background: '#E8731A', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' } : {}),
                                }}>
                                    {day}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Request Rows */}
                {visibleRequests.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--tx3, #888)' }}>
                        <Calendar size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>No requests this month</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>Navigate to a different month or create a new 3D request</div>
                    </div>
                ) : (
                    visibleRequests.map((req, idx) => {
                        const color = PALETTE[idx % PALETTE.length];
                        const statusColor = STATUS_COLORS[req.status] || STATUS_COLORS['Submitted'];
                        const reqStart = req.start_date || req.timestamp;
                        const isDraggingReq = drag !== null && drag.kind === 'req' && drag.reqId === req.id;
                        const reqDrag = isDraggingReq ? dragDates(drag!) : null;
                        const barStyle = getBarStyle(reqDrag ? reqDrag.start : reqStart, reqDrag ? reqDrag.end : req.deadline);
                        const isAssigning = assigningId === req.id;
                        const assignedMember = members.find(m => m.email === req.assigned_to);
                        // Fall back to a name derived from the email for assignees no longer in the list
                        const assignedLabel = assignedMember?.name || (req.assigned_to ? emailToName(req.assigned_to) : null);
                        const validAreas = getValidAreas(req);
                        const hasAreas = validAreas.length > 0;
                        const isExpanded = expandedIds.has(req.id);

                        return (
                            <React.Fragment key={req.id}>
                                {/* ── Main Project Row ── */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `200px repeat(${daysInMonth}, 1fr)`,
                                    minHeight: 52,
                                    borderBottom: isExpanded && hasAreas ? 'none' : '1px solid var(--bdr, #2E2E2E)',
                                    position: 'relative',
                                    zIndex: isAssigning ? 100 : 1,
                                }}>
                                    {/* Project Label */}
                                    <div style={{
                                        padding: '6px 10px', borderRight: '1px solid var(--bdr, #2E2E2E)',
                                        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
                                        background: 'var(--card, #252526)', position: 'sticky', left: 0, zIndex: 10,
                                        cursor: hasAreas ? 'pointer' : 'default',
                                    }}
                                        onClick={() => { if (hasAreas) toggleExpand(req.id); }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {/* Expand/collapse chevron */}
                                            {hasAreas && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--tx3, #888)', flexShrink: 0, transition: 'transform 0.15s ease' }}>
                                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
                                                </span>
                                            )}
                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx, #E8E8E8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {req.project_number ? `${req.project_number} - ` : ''}{req.project_name || 'Untitled'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', paddingLeft: hasAreas ? 16 : 0 }}>
                                            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: statusColor.bg, border: `1px solid ${statusColor.border}40`, color: statusColor.text, fontWeight: 600 }}>
                                                {req.status || 'Submitted'}
                                            </span>
                                            {hasAreas && (
                                                <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: '#ffffff08', border: '1px solid #ffffff10', color: '#888', fontWeight: 500 }}>
                                                    {validAreas.length} area{validAreas.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {/* Assign Button */}
                                            <div
                                                style={{
                                                    fontSize: 8, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
                                                    background: assignedLabel ? '#3B82F615' : '#ffffff08',
                                                    border: `1px solid ${assignedLabel ? '#3B82F640' : '#ffffff15'}`,
                                                    color: assignedLabel ? '#60A5FA' : '#666',
                                                    display: 'flex', alignItems: 'center', gap: 3, position: 'relative',
                                                }}
                                                onClick={(e) => { e.stopPropagation(); setNewPersonText(''); setAssigningId(isAssigning ? null : req.id); }}
                                            >
                                                <User size={8} />
                                                <span>{assignedLabel || 'Assign'}</span>

                                                {isAssigning && (
                                                    <div style={{
                                                        position: 'absolute', top: 22, left: 0, background: 'var(--card, #252526)',
                                                        border: '1px solid var(--bdr, #3E3E42)', borderRadius: 8,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: 6, zIndex: 50, width: 200,
                                                    }} onClick={e => e.stopPropagation()}>
                                                        <div style={{ fontSize: 9, fontWeight: 700, color: '#888', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assign to 3D member</div>

                                                        {/* Unassign option */}
                                                        <div
                                                            style={{ padding: '6px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, color: '#888', marginBottom: 2 }}
                                                            onMouseEnter={e => (e.currentTarget.style.background = '#ffffff08')}
                                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                            onClick={() => handleAssign(req.id, null)}
                                                        >
                                                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#888' }}>✕</div>
                                                            <div>
                                                                <div style={{ fontWeight: 600 }}>Unassign</div>
                                                            </div>
                                                        </div>

                                                        {/* Team Members */}
                                                        <div style={{ maxHeight: 170, overflowY: 'auto' }}>
                                                            {members.map((m, mi) => (
                                                                <div
                                                                    key={m.email}
                                                                    style={{
                                                                        padding: '6px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                                        color: 'var(--tx, #E8E8E8)', marginBottom: 1,
                                                                        background: req.assigned_to === m.email ? '#3B82F615' : 'transparent',
                                                                    }}
                                                                    onMouseEnter={e => (e.currentTarget.style.background = '#ffffff08')}
                                                                    onMouseLeave={e => (e.currentTarget.style.background = req.assigned_to === m.email ? '#3B82F615' : 'transparent')}
                                                                    onClick={() => handleAssign(req.id, m.email)}
                                                                >
                                                                    {m.avatar_url ? (
                                                                        <img src={m.avatar_url} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                                                                    ) : (
                                                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: PALETTE[mi % PALETTE.length].border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                                                                            {(m.name || 'U').charAt(0)}
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                                                                        <div style={{ fontSize: 8, color: '#888' }}>{m.role} · {m.email}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Add a person not in the list */}
                                                        {renderAddPerson(m => handleAssign(req.id, m.email))}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Edit Button */}
                                            <div
                                                style={{
                                                    fontSize: 8, padding: '2px', borderRadius: 3, cursor: 'pointer',
                                                    background: '#3B82F615',
                                                    border: '1px solid #3B82F640',
                                                    color: '#60A5FA',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onClick={(e) => { e.stopPropagation(); setAssigningId(null); setEditingReq(req); }}
                                                title="Edit Request"
                                            >
                                                <Pencil size={10} />
                                            </div>

                                            {/* Delete Button */}
                                            <div
                                                style={{
                                                    fontSize: 8, padding: '2px', borderRadius: 3, cursor: 'pointer',
                                                    background: '#EF444415',
                                                    border: '1px solid #EF444440',
                                                    color: '#EF4444',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onClick={(e) => handleDelete(req.id, e)}
                                                title="Delete Request"
                                            >
                                                <Trash2 size={10} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Day Cell Backgrounds */}
                                    {renderDayCells()}

                                    {/* Gantt Bar Overlay */}
                                    <div data-gantt-grid style={{
                                        position: 'absolute', top: 0, left: 200, right: 0, bottom: 0,
                                        display: 'grid', gridTemplateColumns: `repeat(${daysInMonth}, 1fr)`,
                                        alignItems: 'center', pointerEvents: 'none',
                                    }}>
                                        <div
                                            onPointerDown={e => startDrag(e, 'req', req.id, -1, 'move', reqStart, req.deadline)}
                                            title="Drag to move · drag edges to change start/end"
                                            style={{
                                                gridColumnStart: barStyle.gridColumnStart,
                                                gridColumnEnd: barStyle.gridColumnEnd,
                                                height: 26, borderRadius: 6,
                                                background: `linear-gradient(135deg, ${color.bg}, ${color.bg})`,
                                                border: `1.5px solid ${color.border}${isDraggingReq ? '' : '60'}`,
                                                borderLeft: `3px solid ${color.border}`,
                                                display: 'flex', alignItems: 'center', paddingLeft: 8, margin: '0 2px',
                                                overflow: 'hidden', position: 'relative',
                                                pointerEvents: 'auto', touchAction: 'none', userSelect: 'none',
                                                cursor: isDraggingReq ? 'grabbing' : 'grab',
                                            }}>
                                            <span style={{ fontSize: 9, fontWeight: 600, color: color.border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
                                                {req.request_name || req.project_name || ''}
                                            </span>
                                            <div onPointerDown={e => startDrag(e, 'req', req.id, -1, 'start', reqStart, req.deadline)}
                                                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
                                            <div onPointerDown={e => startDrag(e, 'req', req.id, -1, 'end', reqStart, req.deadline)}
                                                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
                                        </div>
                                    </div>
                                </div>

                                {/* ── Area Sub-Rows (expanded) ── */}
                                {isExpanded && hasAreas && validAreas.map((area: any, areaIdx: number) => {
                                    const areaColor = AREA_PALETTE[areaIdx % AREA_PALETTE.length];
                                    // For the area bar: use area's own dates if available, fallback to project dates
                                    const areaStart = area.startDate || reqStart;
                                    const areaEnd = area.targetDate || req.deadline;
                                    const isDraggingArea = drag !== null && drag.kind === 'area' && drag.reqId === req.id && drag.areaIdx === area.__idx;
                                    const areaDrag = isDraggingArea ? dragDates(drag!) : null;
                                    const areaBarStyle = getBarStyle(areaDrag ? areaDrag.start : areaStart, areaDrag ? areaDrag.end : areaEnd);
                                    const isLastArea = areaIdx === validAreas.length - 1;
                                    const areaAssignKey = `${req.id}#${area.__idx}`;
                                    const isAssigningArea = assigningId === areaAssignKey;
                                    const areaAssignee = members.find(m => m.email === area.assigned_to);
                                    const areaAssignLabel = areaAssignee ? areaAssignee.name : (area.designer || 'Assign');
                                    const areaHasAssignee = Boolean(areaAssignee || area.designer);

                                    // Format the target date for display
                                    const targetDisplay = area.targetDate
                                        ? new Date(area.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                        : '';

                                    return (
                                        <div key={`${req.id}-area-${areaIdx}`} style={{
                                            display: 'grid',
                                            gridTemplateColumns: `200px repeat(${daysInMonth}, 1fr)`,
                                            minHeight: 38,
                                            borderBottom: isLastArea ? '1px solid var(--bdr, #2E2E2E)' : '1px solid #ffffff06',
                                            position: 'relative',
                                            background: '#ffffff02',
                                            zIndex: isAssigningArea ? 100 : 1,
                                        }}>
                                            {/* Area Label */}
                                            <div style={{
                                                padding: '4px 10px 4px 26px', borderRight: '1px solid var(--bdr, #2E2E2E)',
                                                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                                                background: 'var(--card, #252526)', position: 'sticky', left: 0, zIndex: 9,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{
                                                        width: 16, height: 16, borderRadius: '50%',
                                                        background: areaColor.border + '25',
                                                        border: `1.5px solid ${areaColor.border}60`,
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 8, fontWeight: 700, color: areaColor.border, flexShrink: 0,
                                                    }}>
                                                        {areaIdx + 1}
                                                    </span>
                                                    <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--tx2, #BBB)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {area.scope}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 21 }}>
                                                    {/* Per-area assign chip */}
                                                    <div
                                                        style={{
                                                            fontSize: 7, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
                                                            background: areaHasAssignee ? '#3B82F615' : '#ffffff08',
                                                            border: `1px solid ${areaHasAssignee ? '#3B82F640' : '#ffffff15'}`,
                                                            color: areaHasAssignee ? '#60A5FA' : '#666',
                                                            display: 'flex', alignItems: 'center', gap: 3, position: 'relative',
                                                        }}
                                                        onClick={(e) => { e.stopPropagation(); setNewPersonText(''); setAssigningId(isAssigningArea ? null : areaAssignKey); }}
                                                    >
                                                        <User size={7} />
                                                        <span>{areaAssignLabel}</span>

                                                        {isAssigningArea && (
                                                            <div style={{
                                                                position: 'absolute', top: 18, left: 0, background: 'var(--card, #252526)',
                                                                border: '1px solid var(--bdr, #3E3E42)', borderRadius: 8,
                                                                boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: 6, zIndex: 50, width: 200,
                                                            }} onClick={e => e.stopPropagation()}>
                                                                <div style={{ fontSize: 9, fontWeight: 700, color: '#888', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                    Assign &ldquo;{area.scope}&rdquo; to
                                                                </div>

                                                                <div
                                                                    style={{ padding: '6px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, color: '#888', marginBottom: 2 }}
                                                                    onMouseEnter={e => (e.currentTarget.style.background = '#ffffff08')}
                                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                                    onClick={() => handleAssignArea(req, area.__idx, null)}
                                                                >
                                                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#888' }}>✕</div>
                                                                    <div><div style={{ fontWeight: 600 }}>Unassign</div></div>
                                                                </div>

                                                                <div style={{ maxHeight: 170, overflowY: 'auto' }}>
                                                                    {members.map((m, mi) => (
                                                                        <div
                                                                            key={m.email}
                                                                            style={{
                                                                                padding: '6px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                                color: 'var(--tx, #E8E8E8)', marginBottom: 1,
                                                                                background: area.assigned_to === m.email ? '#3B82F615' : 'transparent',
                                                                            }}
                                                                            onMouseEnter={e => (e.currentTarget.style.background = '#ffffff08')}
                                                                            onMouseLeave={e => (e.currentTarget.style.background = area.assigned_to === m.email ? '#3B82F615' : 'transparent')}
                                                                            onClick={() => handleAssignArea(req, area.__idx, m)}
                                                                        >
                                                                            {m.avatar_url ? (
                                                                                <img src={m.avatar_url} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                                                                            ) : (
                                                                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: PALETTE[mi % PALETTE.length].border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                                                                                    {(m.name || 'U').charAt(0)}
                                                                                </div>
                                                                            )}
                                                                            <div>
                                                                                <div style={{ fontWeight: 600 }}>{m.name}</div>
                                                                                <div style={{ fontSize: 8, color: '#888' }}>{m.role} · {m.email}</div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Add a person not in the list */}
                                                                {renderAddPerson(m => handleAssignArea(req, area.__idx, m))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {targetDisplay && (
                                                        <span style={{ fontSize: 7, color: '#E8731A', fontWeight: 600 }}>
                                                            Due {targetDisplay}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Day Cell Backgrounds */}
                                            {renderDayCells(true)}

                                            {/* Area Gantt Bar */}
                                            <div data-gantt-grid style={{
                                                position: 'absolute', top: 0, left: 200, right: 0, bottom: 0,
                                                display: 'grid', gridTemplateColumns: `repeat(${daysInMonth}, 1fr)`,
                                                alignItems: 'center', pointerEvents: 'none',
                                            }}>
                                                <div
                                                    onPointerDown={e => startDrag(e, 'area', req.id, area.__idx, 'move', areaStart, areaEnd)}
                                                    title="Drag to move · drag edges to change start/end"
                                                    style={{
                                                        gridColumnStart: areaBarStyle.gridColumnStart,
                                                        gridColumnEnd: areaBarStyle.gridColumnEnd,
                                                        height: 18, borderRadius: 4,
                                                        background: areaColor.bg,
                                                        border: `1px solid ${areaColor.border}${isDraggingArea ? '' : '40'}`,
                                                        borderLeft: `2.5px solid ${areaColor.border}`,
                                                        display: 'flex', alignItems: 'center', paddingLeft: 6, margin: '0 2px',
                                                        overflow: 'hidden', position: 'relative',
                                                        pointerEvents: 'auto', touchAction: 'none', userSelect: 'none',
                                                        cursor: isDraggingArea ? 'grabbing' : 'grab',
                                                    }}>
                                                    <span style={{ fontSize: 8, fontWeight: 500, color: areaColor.border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.9, pointerEvents: 'none' }}>
                                                        {area.scope}
                                                    </span>
                                                    <div onPointerDown={e => startDrag(e, 'area', req.id, area.__idx, 'start', areaStart, areaEnd)}
                                                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize' }} />
                                                    <div onPointerDown={e => startDrag(e, 'area', req.id, area.__idx, 'end', areaStart, areaEnd)}
                                                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize' }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })
                )}
            </div>

            {/* Edit Request Modal */}
            {editingReq && (
                <EditRequestModal
                    key={editingReq.id}
                    req={editingReq}
                    onClose={() => setEditingReq(null)}
                    onSave={handleSaveEdit}
                />
            )}
        </div>
    );
}

/* ── Edit Request Modal ─────────────────────────────────────────────── */

const editInputStyle: React.CSSProperties = {
    width: '100%', fontSize: 11, padding: '7px 9px', borderRadius: 6, outline: 'none',
    background: 'var(--bg, #1A1A1A)', border: '1px solid var(--bdr, #3E3E42)', color: 'var(--tx, #E8E8E8)',
    fontFamily: "'DM Sans', sans-serif",
};
const editLabelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, color: 'var(--tx3, #888)', textTransform: 'uppercase',
    letterSpacing: '0.4px', marginBottom: 4, display: 'block',
};

function EditRequestModal({ req, onClose, onSave }: { req: any; onClose: () => void; onSave: (form: EditForm) => Promise<void> }) {
    const [form, setForm] = useState<EditForm>({
        request_name: req.request_name || '',
        status: req.status || 'Submitted',
        priority: req.priority || 'Medium',
        start: String(req.start_date || req.timestamp || '').slice(0, 10),
        deadline: req.deadline || '',
        description: req.description || '',
        areas: Array.isArray(req.areas) ? req.areas.map((a: any) => ({ ...a })) : [],
    });

    const setArea = (i: number, field: string, value: string) => {
        setForm(f => ({ ...f, areas: f.areas.map((a, idx) => idx === i ? { ...a, [field]: value } : a) }));
    };
    const addArea = () => setForm(f => ({
        ...f,
        areas: [...f.areas, {
            id: f.areas.reduce((m, a) => Math.max(m, Number(a?.id) || 0), 0) + 1,
            scope: '', designer: '', startDate: '', targetDate: '', description: '',
        }],
    }));
    const removeArea = (i: number) => setForm(f => ({ ...f, areas: f.areas.filter((_, idx) => idx !== i) }));

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 580, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                    background: 'var(--card, #252526)', border: '1px solid var(--bdr, #3E3E42)', borderRadius: 12,
                    padding: 20, fontFamily: "'DM Sans', sans-serif",
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx, #E8E8E8)' }}>Edit Request</div>
                        <div style={{ fontSize: 10, color: 'var(--tx3, #888)' }}>
                            {req.project_number ? `${req.project_number} - ` : ''}{req.project_name || 'Untitled'} · changes sync to Google Calendar
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3, #888)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                {/* Request fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={editLabelStyle}>Request Name</label>
                        <input style={editInputStyle} value={form.request_name} onChange={e => setForm({ ...form, request_name: e.target.value })} placeholder="e.g. Lobby Rendering" />
                    </div>
                    <div>
                        <label style={editLabelStyle}>Status</label>
                        <select style={editInputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                            <option>Submitted</option>
                            <option>In Progress</option>
                            <option>Completed</option>
                        </select>
                    </div>
                    <div>
                        <label style={editLabelStyle}>Priority</label>
                        <select style={editInputStyle} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                            <option>Low</option>
                            <option>Medium</option>
                            <option>High</option>
                        </select>
                    </div>
                    <div>
                        <label style={editLabelStyle}>Start Date</label>
                        <input style={editInputStyle} type="date" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
                    </div>
                    <div>
                        <label style={editLabelStyle}>Deadline *</label>
                        <input style={editInputStyle} type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={editLabelStyle}>Description / Notes</label>
                        <textarea style={{ ...editInputStyle, minHeight: 54, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                    </div>
                </div>

                {/* Areas */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ ...editLabelStyle, marginBottom: 0 }}>Areas &amp; Scope</label>
                        <span style={{ fontSize: 9, color: 'var(--tx3, #888)' }}>{form.areas.filter(a => a?.scope?.trim()).length} named</span>
                    </div>
                    {form.areas.map((a, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px 2fr 1.4fr 1fr 1fr 22px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3, #888)', textAlign: 'center' }}>{i + 1}</span>
                            <input style={editInputStyle} value={a.scope || ''} onChange={e => setArea(i, 'scope', e.target.value)} placeholder="Scope name" />
                            <input style={editInputStyle} value={a.designer || ''} onChange={e => setArea(i, 'designer', e.target.value)} placeholder="Designer" />
                            <input style={editInputStyle} type="date" title="Area start" value={a.startDate || ''} onChange={e => setArea(i, 'startDate', e.target.value)} />
                            <input style={editInputStyle} type="date" title="Area target" value={a.targetDate || ''} onChange={e => setArea(i, 'targetDate', e.target.value)} />
                            <button
                                type="button" title="Remove area" onClick={() => removeArea(i)}
                                style={{ background: 'none', border: '1px solid #EF444440', borderRadius: 5, color: '#EF4444', cursor: 'pointer', height: 26, fontSize: 11 }}
                            >✕</button>
                        </div>
                    ))}
                    <button
                        type="button" onClick={addArea}
                        style={{ ...editInputStyle, cursor: 'pointer', textAlign: 'center', color: 'var(--tx2, #BBB)', fontWeight: 600 }}
                    >+ Add Area</button>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        type="button" onClick={onClose}
                        style={{ fontSize: 11, fontWeight: 600, padding: '8px 16px', borderRadius: 7, cursor: 'pointer', background: 'none', border: '1px solid var(--bdr, #3E3E42)', color: 'var(--tx2, #BBB)' }}
                    >Cancel</button>
                    <button
                        type="button"
                        disabled={!form.deadline}
                        title={form.deadline ? '' : 'Deadline is required'}
                        onClick={() => void onSave(form)}
                        style={{
                            fontSize: 11, fontWeight: 700, padding: '8px 18px', borderRadius: 7,
                            cursor: form.deadline ? 'pointer' : 'not-allowed', border: 'none',
                            background: form.deadline ? '#E8731A' : 'var(--bdr, #3E3E42)', color: '#fff',
                        }}
                    >Save Changes</button>
                </div>
            </div>
        </div>
    );
}
