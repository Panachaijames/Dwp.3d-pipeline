"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { TeamMember, PhaseId } from '../../types';
import { Users, Circle, Edit2, X, Check, Activity } from 'lucide-react';
import { User } from '../../contexts/AuthContext';

const PHASE_COLORS: Record<string, string> = {
    modeling: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    lighting: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    material: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
    rendering: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    animation: 'text-green-400 bg-green-400/10 border-green-400/20',
    queued: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
    done: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
};

const STATUS_COLORS = {
    online: 'bg-emerald-500',
    busy: 'bg-red-500',
    offline: 'bg-slate-500'
};

interface TeamSidebarProps {
    currentUser?: User | null;
}

export const TeamSidebar: React.FC<TeamSidebarProps> = ({ currentUser: authUser }) => {
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [myMemberProfile, setMyMemberProfile] = useState<TeamMember | null>(null);
    const [statusForm, setStatusForm] = useState({
        status: 'online' as const,
        currentTask: '',
        currentPhase: 'modeling' as PhaseId,
        progress: 0,
        role: ''
    });

    useEffect(() => {
        fetchTeam();

        const channel = supabase
            .channel('public:threed_team_status')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'threed_team_status' }, (payload) => {
                handleRealtimeUpdate(payload);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Sync auth user with team list
    useEffect(() => {
        if (team.length > 0 && authUser) {
            const me = team.find(m => m.name === authUser.name);
            if (me) {
                setMyMemberProfile(me);
                // Only update form if not already editing
                if (!isEditing) {
                    setStatusForm({
                        status: me.status as any,
                        currentTask: (me as any).current_task || me.currentTask || '',
                        currentPhase: (me as any).current_phase || me.currentPhase || 'modeling',
                        progress: me.progress || 0,
                        role: me.role || ''
                    });
                }
            } else {
                setMyMemberProfile(null);
            }
        }
    }, [team, authUser, isEditing]);

    const fetchTeam = async () => {
        try {
            const { data, error } = await supabase
                .from('threed_team_status')
                .select('*')
                .order('name');

            if (error) throw error;
            if (data) setTeam(data as any);
        } catch (error) {
            console.error('Error fetching team:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRealtimeUpdate = (payload: any) => {
        if (payload.eventType === 'INSERT') {
            setTeam(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
            setTeam(prev => prev.map(member => member.id === payload.new.id ? payload.new : member));
        } else if (payload.eventType === 'DELETE') {
            setTeam(prev => prev.filter(member => member.id !== payload.old.id));
        }
    };

    const handleJoinTeam = async () => {
        if (!authUser) return;

        try {
            const newMember = {
                name: authUser.name,
                role: authUser.role === 'leader' ? 'Pipeline Lead' : 'Designer', // Default role
                current_task: 'Just joined',
                current_phase: 'modeling',
                status: 'online',
                avatar_url: authUser.picture,
                progress: 0
            };

            const { error } = await supabase.from('threed_team_status').insert(newMember);
            if (error) throw error;

            // Force fetch to ensure UI updates even if realtime fails
            fetchTeam();
        } catch (e) {
            console.error("Error joining team:", e);
        }
    };

    const handleUpdateStatus = async () => {
        if (!myMemberProfile) return;

        try {
            const { error } = await supabase
                .from('threed_team_status')
                .update({
                    status: statusForm.status,
                    current_task: statusForm.currentTask,
                    current_phase: statusForm.currentPhase,
                    progress: statusForm.progress,
                    role: statusForm.role,
                    last_updated: new Date().toISOString()
                })
                .eq('id', myMemberProfile.id);

            if (error) {
                console.error("Supabase Update Error:", error);
                alert(`Failed to update status: ${error.message}`);
                return;
            }

            setIsEditing(false);
            // Force refresh to ensure UI updates even if realtime subscription delays
            fetchTeam();
        } catch (err: any) {
            console.error("Failed to update status:", err);
            alert(`Error: ${err.message || 'Unknown error occurred'}`);
        }
    };

    // Auto-join team if logged in but not in list
    useEffect(() => {
        if (loading || !authUser) return;

        // Find my profile if exists
        const myProfile = team.find(m => m.name === authUser.name);

        if (!myProfile) {
            // Not in team list - try to join
            console.log("Auto-joining team...");
            handleJoinTeam();
        } else {
            // Is in team list - check sync
            const currentAvatar = myProfile.avatarUrl || myProfile.avatar_url;
            if (authUser.picture && currentAvatar !== authUser.picture) {
                console.log("Syncing avatar...", authUser.picture);
                const updateAvatar = async () => {
                    await supabase
                        .from('threed_team_status')
                        .update({ avatar_url: authUser.picture })
                        .eq('id', myProfile.id);
                };
                updateAvatar();
            }
        }
    }, [loading, authUser, team]);

    if (loading) return <div className="p-4 text-xs text-slate-500">Loading team...</div>;

    if (isEditing) {
        return (
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-white uppercase">Update Pulse</h3>
                    <button onClick={() => setIsEditing(false)}><X size={14} className="text-slate-400" /></button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Status</label>
                        <div className="flex bg-slate-950 p-1 rounded-lg">
                            {['online', 'busy', 'offline'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusForm(prev => ({ ...prev, status: s as any }))}
                                    className={`flex-1 py-1 text-[10px] uppercase font-bold rounded ${statusForm.status === s ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Role / Job Title</label>
                        <input
                            type="text"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none placeholder:text-slate-700"
                            value={statusForm.role}
                            onChange={e => setStatusForm(prev => ({ ...prev, role: e.target.value }))}
                            placeholder="e.g. Pipeline Lead, Designer"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Current Task</label>
                        <input
                            type="text"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                            value={statusForm.currentTask}
                            onChange={e => setStatusForm(prev => ({ ...prev, currentTask: e.target.value }))}
                        />
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Progress: {statusForm.progress}%</label>
                        <input
                            type="range"
                            min="0" max="100"
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            value={statusForm.progress}
                            onChange={e => setStatusForm(prev => ({ ...prev, progress: parseInt(e.target.value) }))}
                        />
                    </div>

                    <button
                        onClick={handleUpdateStatus}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Check size={14} /> Update Status
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header with "Me" Action */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Users size={12} /> Team Pulse
                </h3>
                {authUser && (
                    myMemberProfile ? (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="text-[10px] font-bold bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/20 transition-colors uppercase tracking-wider"
                        >
                            Update Your Status
                        </button>
                    ) : (
                        <button
                            onClick={handleJoinTeam}
                            className="text-[10px] font-bold bg-green-500/10 text-green-400 px-2 py-1 rounded hover:bg-green-500/20 transition-colors uppercase tracking-wider"
                        >
                            Join Tracking
                        </button>
                    )
                )}
            </div>

            {/* Team List */}
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {team.map(member => (
                    <div key={member.id} className={`group flex items-start gap-3 p-3 rounded-xl border transition-all ${myMemberProfile?.id === member.id ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-500/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                        <div className="relative">
                            <img
                                src={member.avatarUrl || member.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`}
                                alt={member.name}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full border border-zinc-700 object-cover"
                            />
                            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${STATUS_COLORS[member.status as keyof typeof STATUS_COLORS] || 'bg-slate-500'}`}></div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className={`text-xs font-bold truncate ${myMemberProfile?.id === member.id ? 'text-indigo-700 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {member.name} {myMemberProfile?.id === member.id && '(You)'}
                                </h4>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-bold ${PHASE_COLORS[member.currentPhase] || 'text-slate-500 border-slate-800'}`}>
                                    {member.currentPhase}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-tight mb-2 truncate" title={member.role}>{member.role}</p>

                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-950/50 p-1.5 rounded transition-colors group-hover:bg-slate-200 dark:group-hover:bg-slate-950 mb-1.5">
                                <Activity size={10} className="shrink-0 text-indigo-400" />
                                <span className="truncate" title={member.currentTask || "No active task"}>
                                    {member.currentTask || "Idle"}
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                <div
                                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${member.progress || 0}%` }}
                                ></div>
                            </div>
                            <div className="text-[9px] text-right text-slate-500 mt-0.5">{member.progress || 0}%</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit Status Modal */}
            {isEditing && myMemberProfile && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsEditing(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Update Your Status</h3>
                            <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Availability</label>
                                <div className="flex gap-2">
                                    {['online', 'busy', 'offline'].map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusForm(prev => ({ ...prev, status: s as any }))}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${statusForm.status === s
                                                ? 'bg-slate-100 text-slate-900 border-white'
                                                : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-600'
                                                }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Current Pipeline Phase</label>
                                <select
                                    value={statusForm.currentPhase}
                                    onChange={e => setStatusForm(prev => ({ ...prev, currentPhase: e.target.value as any }))}
                                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-3 outline-none focus:border-indigo-500 transition-colors uppercase font-medium"
                                >
                                    <option value="modeling">Modeling</option>
                                    <option value="lighting">Lighting</option>
                                    <option value="material">Material</option>
                                    <option value="rendering">Rendering</option>
                                    <option value="animation">Animation</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Active Task</label>
                                <input
                                    type="text"
                                    value={statusForm.currentTask}
                                    onChange={e => setStatusForm(prev => ({ ...prev, currentTask: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-3 outline-none focus:border-indigo-500 transition-colors font-medium placeholder:text-slate-700"
                                    placeholder="What are you working on?"
                                />
                            </div>

                            <button
                                onClick={handleUpdateStatus}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest mt-2 flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                            >
                                <Check size={14} /> Update Status
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
