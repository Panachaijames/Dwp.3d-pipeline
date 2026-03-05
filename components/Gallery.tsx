"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { Play, Image as ImageIcon, Maximize2, Download, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Creation {
    id: string;
    type: 'image' | 'video' | 'text';
    url: string;
    prompt: string;
    model: string;
    created_at: string;
}

export const Gallery: React.FC = () => {
    const { user } = useAuth();
    const [creations, setCreations] = useState<Creation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<Creation | null>(null);

    useEffect(() => {
        if (user) fetchCreations();
    }, [user]);

    const fetchCreations = async () => {
        try {
            const { data, error } = await supabase
                .from('creations')
                .select('*')
                .eq('user_id', user?.email)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCreations(data as any || []);
        } catch (err) {
            console.error('Error loading gallery:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            const { error } = await supabase.from('creations').delete().eq('id', id);
            if (error) throw error;
            setCreations(prev => prev.filter(c => c.id !== id));
            if (selectedItem?.id === id) setSelectedItem(null);
        } catch (err) {
            console.error("Delete failed", err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="animate-spin text-purple-500 w-8 h-8" />
            </div>
        );
    }

    return (
        <div className="animate-in fade-in space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">My Portfolio</h2>
                    <p className="text-zinc-500 text-sm">Your history of AI generated concepts and videos.</p>
                </div>
                <div className="text-zinc-500 text-sm font-mono">{creations.length} Items</div>
            </div>

            {creations.length === 0 ? (
                <div className="text-center py-20 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 border-dashed">
                    <ImageIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">No creations yet</h3>
                    <p className="text-zinc-500 text-sm max-w-sm mx-auto mt-2">
                        Use the "New Request" or "Pipeline" tools to generate your first AI masterpiece.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {creations.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className="group relative aspect-square bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 cursor-pointer shadow-sm hover:shadow-xl hover:border-purple-500/50 transition-all"
                        >
                            {/* Media Thumbnail */}
                            {item.type === 'video' ? (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                                    <video src={item.url} className="w-full h-full object-cover opacity-80" muted />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                                            <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <img src={item.url} alt="Creation" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                            )}

                            {/* Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                <p className="text-white text-xs line-clamp-2 font-medium mb-2">{item.prompt}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold bg-white/10 px-2 py-0.5 rounded">{item.type}</span>
                                    <button
                                        onClick={(e) => handleDelete(item.id, e)}
                                        className="p-1.5 hover:bg-red-500/80 text-zinc-400 hover:text-white rounded-lg transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Lightbox / Modal */}
            {selectedItem && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in"
                    onClick={() => setSelectedItem(null)}
                >
                    <button
                        onClick={() => setSelectedItem(null)}
                        className="absolute top-6 right-6 p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"
                    >
                        <Maximize2 size={24} className="rotate-45" /> {/* Use rotate to make X icon from Maximize if needed, or just import X */}
                    </button>

                    <div className="max-w-5xl w-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
                        <div className="relative w-full aspect-video flex-1 bg-black rounded-lg overflow-hidden shadow-2xl border border-zinc-800">
                            {selectedItem.type === 'video' ? (
                                <video src={selectedItem.url} controls autoPlay className="w-full h-full" />
                            ) : (
                                <img src={selectedItem.url} alt="Full view" className="w-full h-full object-contain" />
                            )}
                        </div>

                        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-white font-bold text-lg mb-1">Generated Output</h3>
                                    <p className="text-zinc-400 text-sm font-mono">{selectedItem.prompt}</p>
                                    <div className="flex gap-4 mt-4 text-xs text-zinc-500">
                                        <span>Model: {selectedItem.model}</span>
                                        <span>{new Date(selectedItem.created_at).toLocaleString()}</span>
                                    </div>
                                </div>
                                <a
                                    href={selectedItem.url}
                                    download={`creation-${selectedItem.id}`}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                                >
                                    <Download size={16} /> Download
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
