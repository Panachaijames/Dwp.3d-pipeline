"use client";

import React, { useState } from 'react';
import { ProjectRequest, TeamMember } from '../types';
import { PHASE_ICONS } from '../constants';
import { Activity, Clock, CheckCircle2, AlertCircle, Users, X, Save, Edit2 } from 'lucide-react';
import { TeamSidebar } from './TeamStatus/TeamSidebar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';

interface DashboardProps {
  requests: ProjectRequest[];
  team: TeamMember[];
  onRequestClick?: (request: ProjectRequest) => void;
  onNavigate: (view: 'dashboard' | 'requests' | 'pipeline' | 'gallery' | 'settings') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ requests, onRequestClick, onNavigate }) => {
  const { user } = useAuth();
  const [editingProject, setEditingProject] = useState<ProjectRequest | null>(null);
  const [updateForm, setUpdateForm] = useState({
    phase: '',
    progress: 0,
    status: ''
  });

  const submittedCount = requests.filter(r => r.status === 'Submitted').length;
  const inProgressCount = requests.filter(r => r.status === 'In Progress').length;
  const completedCount = requests.filter(r => r.status === 'Completed').length;

  const handleEditClick = (e: React.MouseEvent, req: ProjectRequest) => {
    e.stopPropagation();
    setEditingProject(req);
    setUpdateForm({
      phase: req.currentPhase,
      progress: req.progress,
      status: req.status
    });
  };

  const handleUpdateSave = async () => {
    if (!editingProject) return;
    try {
      const { error } = await supabase
        .from('project_requests')
        .update({
          current_phase: updateForm.phase,
          progress: updateForm.progress,
          status: updateForm.status
        })
        .eq('id', editingProject.id);

      if (error) throw error;
      setEditingProject(null);
      // Ideally trigger a refresh here, but for now relies on parent refetch or subscription
      window.location.reload(); // Simple reload to reflect changes for now
    } catch (e) {
      console.error("Error updating project:", e);
    }
  };

  return (
    <div className="animate-fade-in space-y-8 relative">
      {/* Update Modal */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingProject(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Update Project Status</h3>
              <button onClick={() => setEditingProject(null)}><X className="text-zinc-500 hover:text-white" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Phase</label>
                <select
                  value={updateForm.phase}
                  onChange={e => setUpdateForm(prev => ({ ...prev, phase: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500"
                >
                  {['modeling', 'lighting', 'material', 'rendering', 'animation', 'done'].map(p => (
                    <option key={p} value={p} className="capitalize">{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Progress ({updateForm.progress}%)</label>
                <input
                  type="range" min="0" max="100"
                  value={updateForm.progress}
                  onChange={e => setUpdateForm(prev => ({ ...prev, progress: parseInt(e.target.value) }))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Status</label>
                <select
                  value={updateForm.status}
                  onChange={e => setUpdateForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500"
                >
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <button
                onClick={handleUpdateSave}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl mt-2 flex items-center justify-center gap-2"
              >
                <Save size={18} /> Update Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* ... (KPI cards code same as before) ... */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-mono uppercase">Total Active</span>
            <Activity size={16} className="text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-white">{requests.length}</div>
          <div className="text-xs text-zinc-500 mt-1">Projects in pipeline</div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-mono uppercase">Submitted</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-white">{submittedCount}</div>
          <div className="text-xs text-zinc-500 mt-1">Awaiting assignment</div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-mono uppercase">In Progress</span>
            <AlertCircle size={16} className="text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-white">{inProgressCount}</div>
          <div className="text-xs text-zinc-500 mt-1">Currently processing</div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-mono uppercase">Completed</span>
            <CheckCircle2 size={16} className="text-green-500" />
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-white">{completedCount}</div>
          <div className="text-xs text-zinc-500 mt-1">This quarter</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area - Recent Creations & Quick Actions */}
        <div className="lg:col-span-3 space-y-8">

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              onClick={() => onNavigate('requests')}
              className="p-6 bg-purple-600 dark:bg-gradient-to-br dark:from-purple-900/50 dark:to-purple-800/30 border border-purple-500/30 rounded-2xl flex items-center justify-between group hover:scale-[1.02] transition-all cursor-pointer shadow-lg shadow-purple-500/20 dark:shadow-none"
            >
              <div>
                <div className="text-white dark:text-purple-200 font-bold text-lg mb-1">New Request</div>
                <div className="text-purple-100 dark:text-purple-400/60 text-sm">Start a new project</div>
              </div>
              <div className="w-12 h-12 bg-white/20 dark:bg-purple-600 rounded-full flex items-center justify-center group-hover:bg-white/30 dark:group-hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/20">
                <Users className="text-white w-6 h-6" />
              </div>
            </button>

            <button
              onClick={() => onNavigate('pipeline')}
              className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer"
            >
              <div>
                <div className="text-zinc-800 dark:text-zinc-200 font-bold text-lg mb-1">Pipeline Status</div>
                <div className="text-zinc-500 text-sm">View active workflows</div>
              </div>
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                <Activity className="text-zinc-500 dark:text-zinc-400 w-6 h-6 group-hover:text-zinc-900 dark:group-hover:text-white" />
              </div>
            </button>

            <button
              onClick={() => onNavigate('gallery')}
              className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer"
            >
              <div>
                <div className="text-zinc-800 dark:text-zinc-200 font-bold text-lg mb-1">My Portfolio</div>
                <div className="text-zinc-500 text-sm">View your past work</div>
              </div>
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                <CheckCircle2 className="text-zinc-500 dark:text-zinc-400 w-6 h-6 group-hover:text-zinc-900 dark:group-hover:text-white" />
              </div>
            </button>
          </div>


          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl text-zinc-900 dark:text-white flex items-center gap-2">
                <Users size={20} className="text-purple-400" />
                Recent Creations
              </h3>
              <button
                onClick={() => onNavigate('gallery')}
                className="text-sm text-purple-400 hover:text-purple-300 font-medium"
              >
                View Gallery →
              </button>
            </div>

            {/* Recent Creations Grid */}
            <RecentCreationsGrid />
          </div>
        </div>
      </div>
    </div>
  );
};


// Sub-component for data fetching to keep main component clean
function RecentCreationsGrid() {
  const [creations, setCreations] = useState<any[]>([]);
  const { user } = useAuth();

  React.useEffect(() => {
    if (user) {
      supabase
        .from('creations')
        .select('*')
        .eq('user_id', user.email)
        .order('created_at', { ascending: false })
        .limit(4)
        .then(({ data }) => setCreations(data || []));
    }
  }, [user]);

  if (creations.length === 0) {
    return <div className="text-zinc-500 text-sm">No recent creations found.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
      {creations.map((item) => (
        <div key={item.id} className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 hover:border-purple-500/50 transition-all shadow-lg hover:shadow-purple-900/20 cursor-pointer">
          {/* Media */}
          {item.type === 'video' ? (
            <video src={item.url} className="w-full h-full object-cover opacity-80" muted />
          ) : (
            <img src={item.url} alt="Creation" className="w-full h-full object-cover" />
          )}

          {/* Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent translate-y-2 group-hover:translate-y-0 transition-transform">
            <div className="text-white font-semibold text-sm truncate">{item.prompt}</div>
            <div className="text-zinc-400 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(item.created_at).toLocaleDateString()}
            </div>
          </div>

          {/* Badge */}
          <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] font-bold text-white border border-white/10 uppercase">
            {item.type}
          </div>
        </div>
      ))}
    </div>
  );
};

