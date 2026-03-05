"use client";

import React, { useState, useRef } from 'react';
import { ElementData } from '../../types';
import { Box, Pencil, Trash2, Check, X, ImagePlus } from 'lucide-react';

interface ElementBoxProps {
    element: ElementData;
    onUpdate: (id: string, newPrompt: string) => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
    onUpdateImage: (id: string, base64Image: string | undefined) => void;
}

export const ElementBox: React.FC<ElementBoxProps> = ({ element, onUpdate, onRename, onDelete, onUpdateImage }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState(element.name);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = () => {
        if (tempName.trim()) {
            onRename(element.id, tempName);
        } else {
            setTempName(element.name); // Revert if empty
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setTempName(element.name);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result as string;
                onUpdateImage(element.id, base64);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col group/box">
            <div className="bg-zinc-50 dark:bg-zinc-950/50 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between min-h-[52px]">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 flex-1 mr-2">
                    <Box size={18} className="shrink-0" />

                    {isEditing ? (
                        <div className="flex items-center gap-1 flex-1">
                            <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                className="w-full text-sm font-semibold uppercase tracking-wide bg-white dark:bg-zinc-900 border border-purple-500 rounded px-2 py-1 outline-none text-zinc-900 dark:text-zinc-100 shadow-sm"
                            />
                        </div>
                    ) : (
                        <span className="font-semibold text-sm uppercase tracking-wide truncate text-zinc-700 dark:text-zinc-200" title={element.name}>
                            {element.name}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/box:opacity-100 transition-opacity">
                    {isEditing ? (
                        <>
                            <button onClick={handleSave} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors">
                                <Check size={16} />
                            </button>
                            <button onClick={handleCancel} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors">
                                <X size={16} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-1.5 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                                title="Rename Element"
                            >
                                <Pencil size={14} />
                            </button>
                            <button
                                onClick={() => onDelete(element.id)}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                title="Delete Element"
                            >
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="flex gap-3">
                    {/* Reference Image Section */}
                    <div className="shrink-0">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                        {element.referenceImage ? (
                            <div className="relative group w-20 h-20 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                <img src={element.referenceImage} className="w-full h-full object-cover" alt="Ref" />
                                <button
                                    onClick={() => onUpdateImage(element.id, undefined)}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-red-400"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-20 h-20 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-400 dark:hover:border-purple-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all bg-zinc-50 dark:bg-transparent"
                            >
                                <ImagePlus size={20} />
                                <span className="text-[8px] font-black uppercase">Ref</span>
                            </button>
                        )}
                    </div>

                    <div className="flex-1 flex flex-col">
                        <p className="text-[10px] text-zinc-500 italic mb-1 font-medium">
                            {element.description || "Custom element"}
                        </p>
                        <div className="relative flex-1">
                            <textarea
                                value={element.userPrompt}
                                onChange={(e) => onUpdate(element.id, e.target.value)}
                                placeholder="Material details..."
                                className="w-full h-full min-h-[60px] p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:bg-white dark:focus:bg-zinc-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none text-[11px] text-zinc-900 dark:text-zinc-200 transition-all placeholder:text-zinc-400 shadow-inner dark:shadow-none"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
