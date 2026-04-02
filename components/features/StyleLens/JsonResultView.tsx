"use client";

import React, { useState } from 'react';
import { StyleAnalysisResult } from '../../../types';
import { FileJson, Copy, Check } from 'lucide-react';

interface JsonResultViewProps {
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
            className="p-1.5 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-all"
            title="Copy content"
        >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
        </button>
    );
};

export const JsonResultView: React.FC<JsonResultViewProps> = ({ result }) => {
    // Format specific actionable JSON for the prompt box
    const actionableJson = JSON.stringify({
        style: result.description,
        character: result.character,
        elements: result.elements,
        palette: result.colorPalette.map(c => ({ color: c.color, usage: c.usage }))
    }, null, 2);

    return (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-sm animate-fade-in-up">
            <div className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800">
                <div className="flex items-center gap-3 text-purple-400">
                    <div className="bg-purple-500/10 p-1.5 rounded-lg">
                        <FileJson size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider">Developer JSON</h3>
                        <p className="text-xs text-zinc-500">Actionable prompt data</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600 font-mono hidden sm:inline">data.json</span>
                    <CopyButton text={actionableJson} />
                </div>
            </div>
            <div className="p-0 bg-zinc-950">
                {/* whitespace-pre-wrap allows wrapping, break-all breaks long words if needed */}
                <pre className="text-xs font-mono text-zinc-400 leading-relaxed p-6 whitespace-pre-wrap break-words border-l-2 border-purple-500/20">
                    {actionableJson}
                </pre>
            </div>
        </div>
    );
};
