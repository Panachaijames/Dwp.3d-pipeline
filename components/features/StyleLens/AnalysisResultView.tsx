"use client";

import React, { useState } from 'react';
import { StyleAnalysisResult } from '../../../types';
import { Palette, Sparkles, Layers, Quote, ChevronRight, PieChart, Copy, Check, Armchair, Eye, Sun, MapPin, Wind } from 'lucide-react';

interface AnalysisResultViewProps {
    result: StyleAnalysisResult;
}

const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-all"
            title="Copy content"
        >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
        </button>
    );
};

export const AnalysisResultView: React.FC<AnalysisResultViewProps> = ({ result }) => {
    const elementsText = result.elements ? result.elements.map(item => `${item.name}: ${item.description} - ${item.materialSuggestion}`).join('\n') : '';
    const combinedActionableText = `ARCHITECTURAL ELEMENTS:\n${elementsText}`;

    // Helper for safe color palette access
    const safePalette = result.colorPalette || [];
    const ratioText = safePalette.map(c => `Color: ${c.color} | Usage: ${c.usage}`).join('\n');

    // Helper for safe character description
    const charDesc = result.character || { adjectives: [], mood: 'N/A' };
    const characterText = `Mood: ${charDesc.mood}\nAdjectives: ${charDesc.adjectives.join(', ')}`;

    return (
        <div className="w-full space-y-6 animate-fade-in-up">
            {/* Header Summary */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3 text-purple-600 dark:text-purple-400">
                    <div className="flex items-center gap-3">
                        <Quote size={20} />
                        <h3 className="text-sm font-semibold uppercase tracking-wider">Style Summary</h3>
                    </div>
                    <CopyButton text={result.description} />
                </div>
                <p className="text-zinc-700 dark:text-zinc-100 text-lg leading-relaxed font-serif italic">
                    "{result.description}"
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Character / Vibe */}
                <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 h-full flex flex-col shadow-sm">
                    <div className="flex items-center justify-between mb-6 text-pink-600 dark:text-pink-400">
                        <div className="flex items-center gap-3">
                            <Sparkles size={20} />
                            <h3 className="text-sm font-semibold uppercase tracking-wider">Atmosphere & Character</h3>
                        </div>
                        <CopyButton text={characterText} />
                    </div>

                    <div className="space-y-6 flex-grow">
                        {/* Mood */}
                        <div className="group">
                            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1.5 text-[10px] font-bold uppercase tracking-widest group-hover:text-pink-500 dark:group-hover:text-pink-300 transition-colors">
                                <Wind size={12} />
                                <span>Overall Mood</span>
                            </div>
                            <p className="text-zinc-900 dark:text-zinc-200 font-light leading-relaxed border-l-2 border-zinc-300 dark:border-zinc-700 pl-4">
                                {result.character?.mood || 'N/A'}
                            </p>
                        </div>

                        {/* Adjectives */}
                        <div className="group">
                            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1.5 text-[10px] font-bold uppercase tracking-widest group-hover:text-pink-500 dark:group-hover:text-pink-300 transition-colors">
                                <Eye size={12} />
                                <span>Descriptors</span>
                            </div>
                            <div className="flex flex-wrap gap-2 border-l-2 border-zinc-300 dark:border-zinc-700 pl-4">
                                {result.character?.adjectives.map((adj, idx) => (
                                    <span key={idx} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded text-xs text-zinc-600 dark:text-zinc-300 shadow-sm">
                                        {adj}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Key Elements & Materials */}
                <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 h-full shadow-sm">
                    <div className="flex items-center justify-between mb-4 text-emerald-600 dark:text-emerald-400">
                        <div className="flex items-center gap-3">
                            <Layers size={20} />
                            <h3 className="text-sm font-semibold uppercase tracking-wider">Style Elements</h3>
                        </div>
                        <CopyButton text={combinedActionableText} />
                    </div>
                    <div className="space-y-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                        {result.elements?.map((item, index) => (
                            <div key={index} className="flex flex-col gap-1 pb-3 border-b border-zinc-200 dark:border-zinc-700/50 last:border-0 last:pb-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-200 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                        <span>{item.name}</span>
                                    </div>
                                </div>

                                <p className="text-xs text-zinc-600 dark:text-zinc-400 pl-3.5 mb-1">{item.description}</p>

                                <div className="pl-3.5 flex items-start gap-2 text-purple-700 dark:text-purple-300 text-xs font-mono bg-purple-100 dark:bg-purple-900/20 p-2 rounded">
                                    <span className="font-bold flex-shrink-0">MAT:</span>
                                    <span>{item.materialSuggestion}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Color Palette - Enhanced with separate copying rows */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6 text-amber-600 dark:text-amber-400">
                    <Palette size={20} />
                    <h3 className="text-sm font-semibold uppercase tracking-wider">Computed Palette & Technical Data</h3>
                </div>

                {result.colorPalette && result.colorPalette.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                            Detected Palette
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {result.colorPalette.map((color, index) => (
                                <div key={index} className="flex flex-col rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 transition-colors group">
                                    <div
                                        className="h-12 w-full shadow-inner"
                                        style={{ backgroundColor: color.color }}
                                    />
                                    <div className="p-2 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300 uppercase tracking-wide truncate">{color.color}</span>
                                            {/* Copy Button */}
                                            <button
                                                onClick={() => navigator.clipboard.writeText(color.color)}
                                                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Copy size={12} />
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-zinc-500 leading-tight line-clamp-2" title={color.usage}>
                                            {color.usage}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-zinc-500 italic text-sm">Design palette could not be calculated.</p>
                )}
            </div>
        </div>
    );
};
