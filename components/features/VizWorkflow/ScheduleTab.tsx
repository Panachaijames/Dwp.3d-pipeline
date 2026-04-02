import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/services/supabaseClient';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, User, Trash2 } from 'lucide-react';

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
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const now = new Date();
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewMonth, setViewMonth] = useState(now.getMonth());

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                // Get assignable 3D team members (member + outsource roles)
                const { data: roleData } = await supabase
                    .from('threed_user_roles')
                    .select('email, role')
                    .in('role', ['member', 'outsource']);

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
            if (!req.timestamp || !req.deadline) return false;
            const s = new Date(req.timestamp);
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
            if (req && member) {
                try {
                    const { notifyAssignedMember } = await import('../../../services/emailService');
                    await notifyAssignedMember(memberEmail, member.name || emailToName(memberEmail), {
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

    const handleDelete = async (requestId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this request? This action cannot be undone.")) {
            // Optimistic update
            setRawRequests(prev => prev.filter(req => req.id !== requestId));
            
            try {
                const { error } = await supabase.from('project_requests').delete().eq('id', requestId);
                if (error) throw error;
            } catch (err) {
                console.error("Failed to delete request:", err);
                alert("Failed to delete the request. Please try again.");
            }
        }
    };

    const getBarStyle = (startStr: string, endStr: string) => {
        const s = new Date(startStr);
        const e = new Date(endStr);
        const clampedStart = s < monthStart ? 1 : s.getDate();
        const clampedEnd = e > monthEnd ? daysInMonth : e.getDate();
        const span = Math.max(1, clampedEnd - clampedStart + 1);
        return { gridColumnStart: clampedStart, gridColumnEnd: clampedStart + span };
    };

    // Get valid areas (areas that have a scope name filled in)
    const getValidAreas = (req: any) => {
        if (!req.areas || !Array.isArray(req.areas)) return [];
        return req.areas.filter((a: any) => a && a.scope && a.scope.trim() !== '');
    };

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
                        <span style={{ fontSize: 10, color: 'var(--tx3, #888)' }}>Visualize workload &amp; assign projects to 3D team</span>
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
                        const barStyle = getBarStyle(req.timestamp, req.deadline);
                        const isAssigning = assigningId === req.id;
                        const assignedMember = members.find(m => m.email === req.assigned_to);
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
                                                    background: assignedMember ? '#3B82F615' : '#ffffff08',
                                                    border: `1px solid ${assignedMember ? '#3B82F640' : '#ffffff15'}`,
                                                    color: assignedMember ? '#60A5FA' : '#666',
                                                    display: 'flex', alignItems: 'center', gap: 3, position: 'relative',
                                                }}
                                                onClick={(e) => { e.stopPropagation(); setAssigningId(isAssigning ? null : req.id); }}
                                            >
                                                <User size={8} />
                                                <span>{assignedMember ? assignedMember.name : 'Assign'}</span>

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
                                                )}
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
                                    <div style={{
                                        position: 'absolute', top: 0, left: 200, right: 0, bottom: 0,
                                        display: 'grid', gridTemplateColumns: `repeat(${daysInMonth}, 1fr)`,
                                        alignItems: 'center', pointerEvents: 'none',
                                    }}>
                                        <div style={{
                                            gridColumnStart: barStyle.gridColumnStart,
                                            gridColumnEnd: barStyle.gridColumnEnd,
                                            height: 26, borderRadius: 6,
                                            background: `linear-gradient(135deg, ${color.bg}, ${color.bg})`,
                                            border: `1.5px solid ${color.border}60`,
                                            borderLeft: `3px solid ${color.border}`,
                                            display: 'flex', alignItems: 'center', paddingLeft: 8, margin: '0 2px',
                                            overflow: 'hidden',
                                        }}>
                                            <span style={{ fontSize: 9, fontWeight: 600, color: color.border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {req.request_name || req.project_name || ''}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Area Sub-Rows (expanded) ── */}
                                {isExpanded && hasAreas && validAreas.map((area: any, areaIdx: number) => {
                                    const areaColor = AREA_PALETTE[areaIdx % AREA_PALETTE.length];
                                    // For the area bar: use area's own dates if available, fallback to project dates
                                    const areaStart = area.startDate || req.timestamp;
                                    const areaEnd = area.targetDate || req.deadline;
                                    const areaBarStyle = getBarStyle(areaStart, areaEnd);
                                    const isLastArea = areaIdx === validAreas.length - 1;

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
                                                    {area.designer && (
                                                        <span style={{ fontSize: 7, color: '#666', fontWeight: 500 }}>
                                                            {area.designer}
                                                        </span>
                                                    )}
                                                    {area.designer && targetDisplay && <span style={{ fontSize: 7, color: '#444' }}>·</span>}
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
                                            <div style={{
                                                position: 'absolute', top: 0, left: 200, right: 0, bottom: 0,
                                                display: 'grid', gridTemplateColumns: `repeat(${daysInMonth}, 1fr)`,
                                                alignItems: 'center', pointerEvents: 'none',
                                            }}>
                                                <div style={{
                                                    gridColumnStart: areaBarStyle.gridColumnStart,
                                                    gridColumnEnd: areaBarStyle.gridColumnEnd,
                                                    height: 18, borderRadius: 4,
                                                    background: areaColor.bg,
                                                    border: `1px solid ${areaColor.border}40`,
                                                    borderLeft: `2.5px solid ${areaColor.border}`,
                                                    display: 'flex', alignItems: 'center', paddingLeft: 6, margin: '0 2px',
                                                    overflow: 'hidden',
                                                }}>
                                                    <span style={{ fontSize: 8, fontWeight: 500, color: areaColor.border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.9 }}>
                                                        {area.scope}
                                                    </span>
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
        </div>
    );
}
