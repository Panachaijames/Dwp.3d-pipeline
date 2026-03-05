"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { Shield, Trash2, UserPlus, Check, AlertCircle, X } from 'lucide-react';

interface UserRoleData {
    email: string;
    role: UserRole;
    created_at: string;
}

export const SettingsPortal: React.FC = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserRoleData[]>([]);
    const [loading, setLoading] = useState(true);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState<UserRole>('member');
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // const isLeader = user?.role === 'leader';
    const isLeader = true; // Accessible to all for now

    useEffect(() => {
        if (isLeader) {
            fetchUsers();
        } else {
            setLoading(false);
        }
    }, [isLeader]);

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('threed_user_roles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!newUserEmail) return;

        try {
            const { error } = await supabase
                .from('threed_user_roles')
                .upsert({ email: newUserEmail.trim(), role: newUserRole });

            if (error) throw error;

            setMessage({ text: 'User access updated successfully.', type: 'success' });
            setNewUserEmail('');
            fetchUsers();
        } catch (err: any) {
            console.error('Error adding user:', err);
            setMessage({ text: err.message || 'Failed to add user.', type: 'error' });
        }
    };

    const handleRemoveUser = async (email: string) => {
        if (!confirm(`Are you sure you want to remove access for ${email}?`)) return;

        try {
            const { error } = await supabase
                .from('threed_user_roles')
                .delete()
                .eq('email', email);

            if (error) throw error;
            fetchUsers();
        } catch (err: any) {
            console.error('Error removing user:', err);
            alert('Failed to remove user.');
        }
    };

    const [activeTab, setActiveTab] = useState<'users' | 'projects'>('users');
    const [projects, setProjects] = useState<any[]>([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [loadingProjects, setLoadingProjects] = useState(false);

    // Fetch Projects
    useEffect(() => {
        if (isLeader && activeTab === 'projects') {
            fetchProjects();
        }
    }, [isLeader, activeTab]);

    const fetchProjects = async () => {
        try {
            setLoadingProjects(true);
            const { data, error } = await supabase
                .from('threed_projects')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;

            // Also fetch assignments for each project
            const { data: assignments, error: assignError } = await supabase
                .from('threed_outsource_assignments')
                .select('*');

            if (assignError) throw assignError;

            const projectsWithAssignments = data?.map(p => ({
                ...p,
                assignments: assignments?.filter(a => a.project_id === p.id) || []
            })) || [];

            setProjects(projectsWithAssignments);
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoadingProjects(false);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName) return;
        try {
            setLoadingProjects(true);

            // 1. Create Google Drive Folders
            const driveRes = await fetch('/api/drive/create-project', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                },
                body: JSON.stringify({ projectName: newProjectName })
            });

            const driveData = await driveRes.json();

            if (!driveRes.ok) {
                throw new Error(driveData.error || 'Failed to create Drive folders');
            }

            // 2. Save to Supabase
            const { error } = await supabase
                .from('threed_projects')
                .insert({
                    name: newProjectName,
                    created_by: user?.email || 'admin',
                    resource_folder_id: driveData.resourceFolderId,
                    outsource_folder_id: driveData.outsourceFolderId
                });

            if (error) throw error;
            setNewProjectName('');
            fetchProjects();
        } catch (err: any) {
            console.error('Error creating project:', err);
            alert(`Failed to create project: ${err.message}`);
        } finally {
            setLoadingProjects(false);
        }
    };

    const handleAssignOutsource = async (projectId: string, email: string) => {
        if (!email) return;
        try {
            const project = projects.find(p => p.id === projectId);
            if (!project) throw new Error("Project not found");

            setLoadingProjects(true);

            // 1. Assign permissions in Google Drive
            if (project.resource_folder_id && project.outsource_folder_id) {
                const driveRes = await fetch('/api/drive/assign-outsource', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('dwp_access_token')}`
                    },
                    body: JSON.stringify({
                        email: email,
                        resourceFolderId: project.resource_folder_id,
                        outsourceFolderId: project.outsource_folder_id
                    })
                });

                if (!driveRes.ok) {
                    const driveErr = await driveRes.json();
                    throw new Error(driveErr.error || 'Failed to grant Drive permissions');
                }
            }

            // 2. Save assignment to Supabase
            const { error } = await supabase
                .from('threed_outsource_assignments')
                .insert({
                    project_id: projectId,
                    email: email,
                    assigned_by: user?.email || 'admin'
                });
            if (error) throw error;
            fetchProjects();
        } catch (err: any) {
            console.error('Error assigning:', err);
            alert(`Failed to assign user: ${err.message}`);
        } finally {
            setLoadingProjects(false);
        }
    };

    const handleRemoveAssignment = async (assignmentId: string) => {
        try {
            const { error } = await supabase
                .from('threed_outsource_assignments')
                .delete()
                .eq('id', assignmentId);
            if (error) throw error;
            fetchProjects();
        } catch (err: any) {
            console.error('Error removing assignment:', err);
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (!confirm('Are you sure you want to delete this project?')) return;
        try {
            const { error } = await supabase
                .from('threed_projects')
                .delete()
                .eq('id', projectId);
            if (error) throw error;
            fetchProjects();
        } catch (err: any) {
            console.error('Error deleting project:', err);
        }
    };

    if (!isLeader) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-400">
                <Shield size={48} className="mb-4 text-zinc-600" />
                <h2 className="text-xl font-semibold text-white mb-2">Access Restricted</h2>
                <p>You do not have permission to view this page.</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in max-w-4xl mx-auto">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Settings & Access</h1>
                    <p className="text-zinc-500 dark:text-zinc-400">Manage user roles and outsource projects.</p>
                </div>
                <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'}`}
                    >
                        User Access
                    </button>
                    <button
                        onClick={() => setActiveTab('projects')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'projects' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'}`}
                    >
                        Outsource Projects
                    </button>
                </div>
            </div>

            {activeTab === 'users' ? (
                <>
                    {/* Add User Section */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 mb-8">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <UserPlus size={20} className="text-purple-500" />
                            Give Access / Update Role
                        </h3>

                        <form onSubmit={handleAddUser} className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="block text-xs font-medium text-zinc-500 mb-1">User Email</label>
                                <input
                                    type="email"
                                    required
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    placeholder="colleague@example.com"
                                />
                            </div>

                            <div className="w-full md:w-48">
                                <label className="block text-xs font-medium text-zinc-500 mb-1">Role</label>
                                <select
                                    value={newUserRole}
                                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors appearance-none"
                                >
                                    <option value="member">Member</option>
                                    <option value="leader">Leader</option>
                                    <option value="outsource">Outsource</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Check size={18} />
                                Save
                            </button>
                        </form>

                        {message && (
                            <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                                {message.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                                {message.text}
                            </div>
                        )}
                    </div>

                    {/* User List */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                            <h3 className="font-semibold text-zinc-900 dark:text-white">Active Users</h3>
                            <span className="text-xs text-zinc-500">{users.length} users found</span>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-zinc-500">Loading users...</div>
                        ) : (
                            <table className="w-full text-left text-sm text-zinc-400">
                                <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 font-medium border-b border-zinc-200 dark:border-zinc-800">
                                    <tr>
                                        <th className="px-6 py-4">Email</th>
                                        <th className="px-6 py-4">Role</th>
                                        <th className="px-6 py-4">Joined</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {users.map((u) => (
                                        <tr key={u.email} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                            <td className="px-6 py-4 text-zinc-900 dark:text-white">{u.email}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${u.role === 'leader' ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                                                    u.role === 'outsource' ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                                                        'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleRemoveUser(u.email)}
                                                    className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                                                    title="Remove access"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            ) : (
                /* Projects Tab */
                <div className="space-y-6">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Create New Project</h3>
                        <form onSubmit={handleCreateProject} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-1">Project Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-zinc-900 dark:text-white outline-none focus:border-orange-500"
                                    placeholder="e.g. Resort 717"
                                />
                            </div>
                            <button
                                type="submit"
                                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                            >
                                Create
                            </button>
                        </form>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {loadingProjects ? (
                            <div className="text-center py-8 text-zinc-500">Loading projects...</div>
                        ) : projects.length === 0 ? (
                            <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">No projects created yet.</div>
                        ) : (
                            projects.map(project => (
                                <div key={project.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="text-xl font-bold text-white">{project.name}</h4>
                                            <p className="text-xs text-zinc-500 mt-1">ID: {project.id}</p>
                                        </div>
                                        <button onClick={() => handleDeleteProject(project.id)} className="text-zinc-500 hover:text-red-500">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <div className="border-t border-zinc-800 pt-4 mt-4">
                                        <h5 className="text-sm font-semibold mb-3">Assigned Outsource Workers</h5>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {project.assignments.map((assignment: any) => (
                                                <span key={assignment.id} className="inline-flex items-center gap-2 bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-sm">
                                                    {assignment.email}
                                                    <button onClick={() => handleRemoveAssignment(assignment.id)} className="text-zinc-500 hover:text-red-400">
                                                        <X size={14} />
                                                    </button>
                                                </span>
                                            ))}
                                            {project.assignments.length === 0 && <span className="text-xs text-zinc-600 italic">No one assigned</span>}
                                        </div>

                                        <div className="flex gap-2">
                                            <input
                                                id={`assign-${project.id}`}
                                                type="email"
                                                placeholder="outsource@dwp.com"
                                                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                                            />
                                            <button
                                                onClick={() => {
                                                    const el = document.getElementById(`assign-${project.id}`) as HTMLInputElement;
                                                    handleAssignOutsource(project.id, el.value);
                                                    el.value = '';
                                                }}
                                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded text-sm transition-colors"
                                            >
                                                Assign
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
