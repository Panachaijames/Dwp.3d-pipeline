"use client";

import React, { useState, useCallback } from 'react';
import { Loader2, Zap, Image as ImageIcon, Type, Sparkles, AlertCircle } from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { AnalysisResultView } from './AnalysisResultView';
import { JsonResultView } from './JsonResultView';
import { analyzeImageStyle, generateStyleFromText } from '../../services/geminiService';
import { StyleAnalysisResult } from '../../types';

type AnalysisMode = 'image' | 'text';

interface StyleLensProps {
    onBack?: () => void;
}

export const StyleLens: React.FC<StyleLensProps> = ({ onBack }) => {
    const [mode, setMode] = useState<AnalysisMode>('image');

    // Image State
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Text State
    const [textPrompt, setTextPrompt] = useState<string>('');

    // Common State
    const [result, setResult] = useState<StyleAnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImageSelected = useCallback((selectedFile: File) => {
        setSelectedImage(selectedFile);
        setError(null);
        setResult(null);

        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
    }, []);

    const handleClearImage = useCallback(() => {
        setSelectedImage(null);
        setImagePreview(null);
        setResult(null);
        setError(null);
    }, []);

    const handleAnalyze = async () => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            let analysisResult: StyleAnalysisResult;

            if (mode === 'image' && selectedImage) {
                // Convert file to base64
                const base64Image = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        // Remove data URL prefix for API
                        const base64 = result.split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(selectedImage);
                });

                analysisResult = await analyzeImageStyle(base64Image, selectedImage.type);
            } else if (mode === 'text' && textPrompt.trim()) {
                analysisResult = await generateStyleFromText(textPrompt);
            } else {
                return;
            }

            setResult(analysisResult);
        } catch (err) {
            console.error(err);
            setError("Failed to analyze. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleModeSwitch = (newMode: 'image' | 'text') => {
        setMode(newMode);
        setResult(null);
        setError(null);
    };


    return (
        <div className="h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Intro Section */}
                <div className="mb-10 text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider">
                        <Sparkles size={14} />
                        <span>AI Style Analysis</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                        Decode Your Design Vision
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto text-lg leading-relaxed">
                        Upload a reference image or describe your concept to extract a precise architectural style DNA, complete with material suggestions and color palettes.
                    </p>
                </div>

                {/* Main Interaction Area */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* INPUT COLUMN */}
                    <div className="lg:col-span-5 space-y-6">

                        {/* Mode Switcher */}
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-2 shadow-sm border border-zinc-200 dark:border-zinc-800">
                            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                                <button
                                    onClick={() => handleModeSwitch('image')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${mode === 'image'
                                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                                        }`}
                                    disabled={isLoading}
                                >
                                    <ImageIcon size={16} />
                                    Analyze Image
                                </button>
                                <button
                                    onClick={() => handleModeSwitch('text')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${mode === 'text'
                                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                                        }`}
                                    disabled={isLoading}
                                >
                                    <Type size={16} />
                                    Describe Space
                                </button>
                            </div>
                        </div>

                        {/* Input Container */}
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-200 dark:border-zinc-800 transition-all duration-300">
                            {mode === 'image' ? (
                                <div className="space-y-4">
                                    <ImageUploader
                                        onImageSelected={handleImageSelected}
                                        selectedImage={imagePreview}
                                        onClear={handleClearImage}
                                        disabled={isLoading}
                                    />
                                    <button
                                        onClick={handleAnalyze}
                                        disabled={!selectedImage || isLoading}
                                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                                            ${!selectedImage || isLoading
                                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                                                : 'bg-zinc-900 dark:bg-white text-white dark:text-black hover:opacity-90 hover:scale-[1.02] shadow-purple-500/20'
                                            }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin" />
                                                Analyzing Style DNA...
                                            </>
                                        ) : (
                                            <>
                                                <Zap size={20} className={selectedImage ? "fill-current" : ""} />
                                                Analyze Visual Style
                                            </>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <textarea
                                            value={textPrompt}
                                            onChange={(e) => setTextPrompt(e.target.value)}
                                            placeholder="Example: A minimalist Scandinavian living room with warm oak wood, floor-to-ceiling windows, and soft beige textiles..."
                                            className="w-full h-64 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none transition-all leadin-relaxed text-sm"
                                            disabled={isLoading}
                                        />
                                        <div className="absolute bottom-4 right-4 text-xs text-zinc-400 pointer-events-none">
                                            {textPrompt.length} chars
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleAnalyze}
                                        disabled={!textPrompt.trim() || isLoading}
                                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                                            ${!textPrompt.trim() || isLoading
                                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                                                : 'bg-zinc-900 dark:bg-white text-white dark:text-black hover:opacity-90 hover:scale-[1.02] shadow-purple-500/20'
                                            }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin" />
                                                Generating Style Profile...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={20} className={textPrompt.trim() ? "fill-current" : ""} />
                                                Generate Style Profile
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400 animate-in slide-in-from-top-2">
                                    <AlertCircle size={20} className="shrink-0 mt-0.5" />
                                    <p className="text-sm font-medium">{error}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RESULTS COLUMN */}
                    <div className="lg:col-span-7 space-y-8">
                        {isLoading ? (
                            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center space-y-6 bg-white dark:bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-purple-500 blur-3xl opacity-20 rounded-full animate-pulse"></div>
                                    <Loader2 size={48} className="text-purple-600 dark:text-purple-400 animate-spin relative z-10" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Analyzing Design Language</h3>
                                    <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto text-sm">
                                        Our AI is deconstructing the visual elements, materials, and atmospheric qualities of your input...
                                    </p>
                                </div>
                            </div>
                        ) : result ? (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <AnalysisResultView result={result} />
                                <JsonResultView result={result} />
                            </div>
                        ) : (
                            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center space-y-6 bg-zinc-50 dark:bg-zinc-900/30 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-12">
                                <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-3xl flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-2">
                                    <Sparkles size={40} />
                                </div>
                                <div className="space-y-2 max-w-md">
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Ready to Analyze</h3>
                                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                                        Select an image or describe a space to begin. The AI will generate a comprehensive style breakdown and technical palette.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
