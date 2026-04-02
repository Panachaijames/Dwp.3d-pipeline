"use client";

import React, { useState, useRef } from 'react';
import { Brain, Sparkles, RotateCcw, AlertCircle, UploadCloud, X, ZoomIn, Wand2, Layers, LayoutPanelLeft, Camera, Download, HardDrive, Plus, History, ShieldCheck, Trash2 } from 'lucide-react';
import { analyzeImage, generateArchitecturalRender, generateAlternativeAngle, generateHighResRender } from '../../../services/geminiService';
import { AppState, AnalysisResult, ElementData } from '../../../types';
import { ElementBox } from './ElementBox';

interface WhiteModelDecoderProps {
    onBack?: () => void;
}

export const WhiteModelDecoder: React.FC<WhiteModelDecoderProps> = ({ onBack }) => {
    const [appState, setAppState] = useState<AppState>(AppState.INPUT);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<string[]>([]); // images[0] is latest
    const [customAngle, setCustomAngle] = useState<string>('');

    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDownloading, setIsDownloading] = useState<string | null>(null); // "2K" or "4K"
    const [isImageZoomed, setIsImageZoomed] = useState(false);
    const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);

    // Tab state for left column
    const [activeTab, setActiveTab] = useState<'context' | 'render'>('context');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            setErrorMsg("Please upload a valid image file (JPG, PNG, WebP).");
            return;
        }
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
        setImageFile(file);
        setErrorMsg(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const convertFileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
            };
            reader.onerror = error => reject(error);
        });
    };

    // Utility to resize image before sending to server (to avoid 1MB limit)
    const resizeImage = (base64Str: string, maxWidth = 1024): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // Compress to JPEG 80%
            };
        });
    };

    const handleAnalyze = async () => {
        if (!imageFile) {
            setErrorMsg("Please upload an image to analyze.");
            return;
        }

        setAppState(AppState.LOADING);
        setErrorMsg(null);

        try {
            const fullBase64 = await convertFileToBase64(imageFile);
            const resizedDataUrl = await resizeImage(fullBase64);
            const base64Data = resizedDataUrl.split(',')[1];

            const data = await analyzeImage(base64Data, 'image/jpeg');
            setResult(data);
            setAppState(AppState.EDITOR);
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Failed to analyze image. Please try again.");
            setAppState(AppState.ERROR);
        }
    };

    const handleGenerateRender = async () => {
        if (!imageFile || !result) return;

        setAppState(AppState.GENERATING);
        setErrorMsg(null);
        setActiveTab('render');

        try {
            const fullBase64 = await convertFileToBase64(imageFile);
            const resizedDataUrl = await resizeImage(fullBase64);
            const base64Data = resizedDataUrl.split(',')[1];

            const renderBase64 = await generateArchitecturalRender(
                base64Data,
                'image/jpeg',
                result.category,
                result.elements
            );
            const newImg = `data:image/png;base64,${renderBase64}`;
            setGeneratedImages(prev => [newImg, ...prev]);
            setAppState(AppState.EDITOR);
        } catch (err: any) {
            console.error(err);
            if (err.message?.includes("Requested entity was not found")) {
                setErrorMsg("API Configuration error. Please verify your project settings.");
            } else {
                setErrorMsg(err.message || "Failed to generate render. Please try again.");
            }
            setAppState(AppState.EDITOR);
            setActiveTab('context');
        }
    };

    const handleDownloadHighRes = async (res: "2K" | "4K") => {
        if (generatedImages.length === 0 || !result || !imageFile) return;

        try {
            setIsDownloading(res);
            setErrorMsg(null);

            const sourceBase64 = generatedImages[0];
            const mimeType = "image/png";

            const highResBase64 = await generateHighResRender(
                sourceBase64,
                mimeType,
                result.category,
                result.elements,
                res
            );

            const link = document.createElement('a');
            link.href = `data:image/png;base64,${highResBase64}`;
            link.download = `render_${res.toLowerCase()}_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err: any) {
            console.error(err);
            setErrorMsg(`Failed to generate ${res} render: ${err.message}`);
        } finally {
            setIsDownloading(null);
        }
    };

    const handleGenerateNewAngle = async () => {
        if (generatedImages.length === 0 || !result) return;
        if (!customAngle.trim()) {
            setErrorMsg("Please specify a camera angle (e.g., 'Side view from left').");
            return;
        }

        setAppState(AppState.GENERATING);
        setErrorMsg(null);

        try {
            // Use the latest render as reference to maintain material continuity
            const referenceRender = generatedImages[0];
            const newAngleBase64 = await generateAlternativeAngle(
                referenceRender,
                result.category,
                result.elements,
                customAngle
            );
            const newImg = `data:image/png;base64,${newAngleBase64}`;
            setGeneratedImages(prev => [newImg, ...prev]);
            setAppState(AppState.EDITOR);
            setCustomAngle(''); // Reset field
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Failed to generate a new angle. Try a different camera description.");
            setAppState(AppState.EDITOR);
        }
    };

    const handlePromptUpdate = (id: string, newPrompt: string) => {
        if (!result) return;
        setResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                elements: prev.elements.map(el => el.id === id ? { ...el, userPrompt: newPrompt } : el)
            };
        });
    };

    const handleUpdateElementImage = (id: string, base64Image: string | undefined) => {
        if (!result) return;
        setResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                elements: prev.elements.map(el => el.id === id ? { ...el, referenceImage: base64Image } : el)
            };
        });
    };

    const handleRenameElement = (id: string, newName: string) => {
        if (!result) return;
        setResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                elements: prev.elements.map(el => el.id === id ? { ...el, name: newName } : el)
            };
        });
    };

    const handleDeleteElement = (id: string) => {
        if (!result) return;
        setResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                elements: prev.elements.filter(el => el.id !== id)
            };
        });
    };

    const handleDeleteRender = (index: number) => {
        setGeneratedImages(prev => prev.filter((_, i) => i !== index));
        if (zoomedImageIndex === index) {
            setIsImageZoomed(false);
            setZoomedImageIndex(null);
        } else if (zoomedImageIndex !== null && zoomedImageIndex > index) {
            setZoomedImageIndex(zoomedImageIndex - 1);
        }
    };

    const handleAddElement = () => {
        if (!result) return;
        const newId = `el-${Date.now()}`;
        const newElement: ElementData = {
            id: newId,
            name: "New Element",
            description: "Custom added element",
            userPrompt: ""
        };
        setResult(prev => {
            if (!prev) return null;
            return {
                ...prev,
                elements: [...prev.elements, newElement]
            };
        });
    };

    const resetApp = () => {
        setAppState(AppState.INPUT);
        setResult(null);
        setErrorMsg(null);
        setImageFile(null);
        setImagePreview(null);
        setGeneratedImages([]);
        setIsImageZoomed(false);
        setZoomedImageIndex(null);
        setActiveTab('context');
    };

    const openZoom = (index: number | null) => {
        setZoomedImageIndex(index);
        setIsImageZoomed(true);
    };

    const currentZoomImage = isImageZoomed
        ? (activeTab === 'render' && zoomedImageIndex !== null ? generatedImages[zoomedImageIndex] : imagePreview)
        : null;

    return (
        <div className="h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans text-zinc-900 dark:text-zinc-100 overflow-y-auto custom-scrollbar">

            {/* Image Zoom Modal */}
            {isImageZoomed && currentZoomImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300"
                    onClick={() => setIsImageZoomed(false)}
                >
                    <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
                        <img
                            src={currentZoomImage}
                            alt="Zoomed Reference"
                            className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg border border-white/5"
                        />
                        <button
                            className="absolute top-4 right-4 bg-zinc-800/80 hover:bg-zinc-700/80 text-white p-3 rounded-full transition-all border border-white/10"
                            onClick={() => setIsImageZoomed(false)}
                        >
                            <X size={24} />
                        </button>
                        <div className="absolute bottom-6 bg-zinc-900/80 text-white px-5 py-2.5 rounded-full text-xs font-black tracking-widest backdrop-blur-sm flex items-center gap-3 border border-white/10 uppercase">
                            <ShieldCheck size={16} className="text-emerald-400" />
                            {activeTab === 'render' ? `Gallery Node ${zoomedImageIndex !== null ? generatedImages.length - zoomedImageIndex : ''}` : "Original Architectural Geometry Reference"}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">

                {/* INPUT STATE */}
                {appState === AppState.INPUT && (
                    <div className="max-w-2xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="text-center mb-12">
                            <h1 className="text-4xl font-black text-zinc-900 dark:text-white mb-4 tracking-tighter uppercase">
                                Architectural <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400">Studio Decoder</span>
                            </h1>
                            <p className="text-zinc-600 dark:text-zinc-400 text-sm font-medium leading-relaxed max-w-lg mx-auto uppercase tracking-widest">
                                High-fidelity spatial deconstruction and photorealistic 16K material synthesis for architectural white models.
                            </p>
                        </div>

                        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-10 border border-zinc-200 dark:border-zinc-800">
                            {!imagePreview ? (
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`
                                relative border-4 border-dotted rounded-2xl h-72 flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                                ${isDragging
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/10'
                                            : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                        }
                            `}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                    <div className="w-20 h-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm text-purple-600 dark:text-purple-400 rounded-3xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110">
                                        <UploadCloud size={40} />
                                    </div>
                                    <span className="font-black text-zinc-900 dark:text-zinc-200 uppercase tracking-widest text-sm">Upload White Model</span>
                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">White Clay Models / Sketches Only</span>
                                </div>
                            ) : (
                                <div className="relative group rounded-2xl overflow-hidden">
                                    <div className="h-72 w-full bg-zinc-100 dark:bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-inner">
                                        <img
                                            src={imagePreview}
                                            alt="Preview"
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <button
                                        onClick={() => { setImagePreview(null); setImageFile(null); }}
                                        className="absolute top-4 right-4 bg-white/90 dark:bg-zinc-900/90 p-2 rounded-xl text-zinc-500 hover:text-red-500 shadow-lg border border-zinc-200 dark:border-zinc-800 transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            )}

                            {errorMsg && (
                                <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl flex items-center gap-3 border border-red-200 dark:border-red-900/50">
                                    <AlertCircle size={18} />
                                    {errorMsg}
                                </div>
                            )}

                            <button
                                onClick={handleAnalyze}
                                disabled={!imageFile}
                                className="w-full mt-8 flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 rounded-2xl font-black shadow-xl shadow-purple-900/20 transition-all transform active:scale-95 uppercase tracking-[0.2em] text-xs"
                            >
                                <Sparkles size={18} className="text-white/80" />
                                Initialize Analysis
                            </button>
                        </div>
                    </div>
                )}

                {/* LOADING STATE */}
                {appState === AppState.LOADING && (
                    <div className="flex flex-col items-center justify-center py-24 animate-in fade-in duration-1000">
                        <div className="relative mb-10">
                            <div className="w-20 h-20 border-[6px] border-zinc-200 dark:border-zinc-800 border-t-purple-500 rounded-full animate-spin"></div>
                            <Sparkles className="absolute inset-0 m-auto text-purple-600 dark:text-purple-400 animate-pulse" size={28} />
                        </div>
                        <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase">Deconstructing Space</h3>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-xs font-bold uppercase tracking-widest">Segmenting geometry & materials.</p>
                    </div>
                )}

                {/* ERROR STATE */}
                {appState === AppState.ERROR && (
                    <div className="max-w-xl mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-10 text-center shadow-2xl animate-in fade-in zoom-in">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-200 dark:border-red-900/50">
                            <AlertCircle size={32} />
                        </div>
                        <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2 uppercase tracking-tight">System Error</h3>
                        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-8 leading-relaxed font-medium">{errorMsg}</p>
                        <button
                            onClick={() => setAppState(AppState.INPUT)}
                            className="bg-purple-600 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-purple-700 transition-colors"
                        >
                            Reset Workspace
                        </button>
                    </div>
                )}

                {/* EDITOR & GENERATING STATE */}
                {(appState === AppState.EDITOR || appState === AppState.GENERATING) && result && (
                    <div className="flex flex-col lg:flex-row gap-8 h-full pb-10">

                        {/* Left Column: Visual Output Gallery */}
                        <div className="lg:w-7/12 xl:w-1/2 flex flex-col gap-6 animate-in slide-in-from-left-6 duration-700">

                            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col">
                                <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
                                    <button
                                        onClick={() => setActiveTab('context')}
                                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all ${activeTab === 'context' ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-white dark:bg-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                    >
                                        <Layers size={14} /> Analysis Reference
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('render')}
                                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all ${activeTab === 'render' ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400 bg-white dark:bg-zinc-900' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                    >
                                        <LayoutPanelLeft size={14} /> Render Studio
                                    </button>
                                </div>

                                <div className="p-4 bg-zinc-50 dark:bg-zinc-950/30 min-h-[500px] relative flex flex-col">
                                    {activeTab === 'context' ? (
                                        <div
                                            className="flex-1 bg-zinc-100 dark:bg-zinc-950 rounded-2xl overflow-hidden relative cursor-zoom-in border border-zinc-200 dark:border-zinc-800 group shadow-inner"
                                            onClick={() => openZoom(null)}
                                        >
                                            {imagePreview && (
                                                <img src={imagePreview} alt="Reference" className="w-full h-full object-contain" />
                                            )}
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                <div className="bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 p-4 rounded-3xl shadow-2xl transition-all border border-zinc-200 dark:border-zinc-700">
                                                    <ZoomIn size={32} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col h-full gap-6">
                                            {(appState === AppState.GENERATING || isDownloading) ? (
                                                <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                                                    <div className="relative mb-8">
                                                        <div className="w-20 h-20 border-[6px] border-zinc-200 dark:border-zinc-800 border-t-purple-500 rounded-full animate-spin"></div>
                                                        <Sparkles className="absolute inset-0 m-auto text-purple-600 dark:text-purple-400 animate-pulse" size={28} />
                                                    </div>
                                                    <p className="text-zinc-900 dark:text-zinc-100 font-black text-xl tracking-tight uppercase">
                                                        {isDownloading ? `Exporting ${isDownloading} Asset` : 'Processing Synthesis'}
                                                    </p>
                                                    <p className="text-zinc-500 dark:text-zinc-500 text-[10px] mt-2 font-black uppercase tracking-[0.2em]">
                                                        {isDownloading ? 'Preparing high-resolution PBR data...' : 'Executing material pass & re-projection...'}
                                                    </p>
                                                </div>
                                            ) : generatedImages.length > 0 ? (
                                                <div className="flex-1 flex flex-col h-full">
                                                    {/* Primary Comparison View */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                                                        {/* Previous Image Container */}
                                                        <div
                                                            className="aspect-video bg-zinc-100 dark:bg-zinc-950 rounded-2xl overflow-hidden relative cursor-zoom-in group border border-zinc-200 dark:border-zinc-800 shadow-lg"
                                                            onClick={() => openZoom(generatedImages.length > 1 ? 1 : 0)}
                                                        >
                                                            <img
                                                                src={generatedImages.length > 1 ? generatedImages[1] : generatedImages[0]}
                                                                alt="Previous Render"
                                                                className="w-full h-full object-cover"
                                                            />
                                                            <div className="absolute top-3 left-3 bg-white/90 dark:bg-zinc-900/90 text-zinc-500 dark:text-zinc-400 text-[8px] font-black px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 uppercase tracking-widest backdrop-blur-sm">
                                                                Reference View
                                                            </div>
                                                        </div>

                                                        {/* Latest Image Container */}
                                                        <div
                                                            className="aspect-video bg-zinc-100 dark:bg-zinc-950 rounded-2xl overflow-hidden relative cursor-zoom-in group border-2 border-purple-500/20 shadow-lg"
                                                            onClick={() => openZoom(0)}
                                                        >
                                                            <img
                                                                src={generatedImages[0]}
                                                                alt="Latest Render"
                                                                className="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
                                                            />
                                                            <div className="absolute top-3 left-3 bg-purple-600 text-white text-[8px] font-black px-2 py-1 rounded shadow-lg uppercase tracking-widest flex items-center gap-1.5">
                                                                <Sparkles size={10} /> Latest Perspective
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Action Control Panel */}
                                                    <div className="bg-zinc-50 dark:bg-zinc-900/50 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-inner">
                                                        <div className="flex flex-col gap-3">
                                                            <div className="flex items-center justify-between px-1">
                                                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Request Specific Perspective</label>
                                                                <div className="flex items-center gap-2 text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                                    Continuity Engine Active
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-3">
                                                                <div className="relative flex-1">
                                                                    <input
                                                                        type="text"
                                                                        value={customAngle}
                                                                        onChange={(e) => setCustomAngle(e.target.value)}
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleGenerateNewAngle()}
                                                                        placeholder="e.g. 'Diagonal shot from floor level towards windows'..."
                                                                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-5 py-4 text-[12px] outline-none focus:border-purple-500 transition-all placeholder:text-zinc-400 font-medium text-zinc-900 dark:text-zinc-100"
                                                                    />
                                                                    <Camera size={18} className="absolute right-4 top-4 text-zinc-400" />
                                                                </div>
                                                                <button
                                                                    onClick={handleGenerateNewAngle}
                                                                    disabled={!customAngle.trim()}
                                                                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-20 text-white px-8 rounded-2xl transition-all active:scale-95 shadow-xl shadow-purple-900/20 font-black text-[10px] uppercase tracking-[0.2em]"
                                                                >
                                                                    Move Camera
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 pt-2">
                                                            <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mr-2">Export Master:</div>
                                                            <button
                                                                onClick={() => handleDownloadHighRes("2K")}
                                                                className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all group"
                                                            >
                                                                <Download size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                                                                Download 2K
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownloadHighRes("4K")}
                                                                className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all group"
                                                            >
                                                                <HardDrive size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                                                                Download 4K
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Camera Roll (History) */}
                                                    {generatedImages.length > 0 && (
                                                        <div className="mt-2">
                                                            <div className="flex items-center gap-2 mb-3 px-1">
                                                                <History size={14} className="text-zinc-500" />
                                                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Full Render History</span>
                                                            </div>
                                                            <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                                                                {generatedImages.map((img, idx) => (
                                                                    <div
                                                                        key={idx}
                                                                        className={`
                                                                    w-32 aspect-video shrink-0 bg-zinc-100 dark:bg-zinc-950 rounded-xl overflow-hidden border-2 cursor-pointer transition-all shadow-md group relative
                                                                    ${idx === 0 ? 'border-purple-500' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'}
                                                                `}
                                                                    >
                                                                        <img
                                                                            src={img}
                                                                            alt={`Render ${generatedImages.length - idx}`}
                                                                            className="w-full h-full object-cover"
                                                                            onClick={() => openZoom(idx)}
                                                                        />
                                                                        <div
                                                                            className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                                            onClick={() => openZoom(idx)}
                                                                        >
                                                                            <ZoomIn size={16} className="text-white" />
                                                                        </div>

                                                                        {/* Thumbnail Action Controls */}
                                                                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteRender(idx);
                                                                                }}
                                                                                className="bg-red-500/80 hover:bg-red-600 text-white p-1 rounded transition-colors shadow-lg"
                                                                                title="Delete Render"
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </div>

                                                                        <div className="absolute bottom-1 right-1 bg-black/60 text-[7px] text-white px-1 rounded font-black">
                                                                            #{generatedImages.length - idx}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-50 dark:bg-zinc-900 border-2 border-dotted border-zinc-200 dark:border-zinc-800 rounded-3xl">
                                                    <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mb-6 border border-purple-200 dark:border-purple-900/30 shadow-xl">
                                                        <Sparkles size={32} />
                                                    </div>
                                                    <h4 className="font-black text-zinc-900 dark:text-zinc-100 uppercase text-sm tracking-widest">Master Studio Workspace</h4>
                                                    <p className="text-zinc-500 dark:text-zinc-400 text-[10px] mt-2 mb-8 max-w-[280px] font-bold uppercase tracking-wider leading-relaxed">Map your material definitions on the right to trigger the primary architectural synthesis.</p>
                                                    <button
                                                        onClick={handleGenerateRender}
                                                        className="bg-purple-600 hover:bg-purple-700 text-white px-12 py-5 rounded-2xl text-xs font-black transition-all shadow-xl shadow-purple-900/20 active:scale-95 uppercase tracking-[0.25em]"
                                                    >
                                                        Generate First View
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="px-8 py-6 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest block mb-1">Architectural Context</span>
                                            <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 leading-tight uppercase tracking-tight">{result.category}</h2>
                                        </div>
                                        <div className="flex gap-2">
                                            {generatedImages.length > 0 && activeTab === 'render' && appState !== AppState.GENERATING && (
                                                <button
                                                    onClick={handleGenerateRender}
                                                    className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-6 py-3 rounded-2xl text-[10px] font-black flex items-center gap-2 transition-all uppercase tracking-widest shadow-md active:scale-95"
                                                >
                                                    <RotateCcw size={16} /> Sync Materials
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-5 leading-relaxed font-medium italic border-l-4 border-purple-500 pl-5">{result.summary}</p>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Material Node Configuration */}
                        <div className="flex-1 animate-in slide-in-from-right-6 duration-700 delay-100 flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-xl shadow-purple-900/30">
                                        <Sparkles size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-zinc-900 dark:text-zinc-100 text-2xl tracking-tighter uppercase">Material Node Deck</h3>
                                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-black uppercase tracking-widest">Configuring textures for PBR re-projection.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {appState !== AppState.GENERATING && (
                                        <button
                                            onClick={handleGenerateRender}
                                            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-2xl text-[10px] font-black items-center gap-3 shadow-2xl transition-all hover:-translate-y-1 uppercase tracking-[0.2em] active:scale-95"
                                        >
                                            <Wand2 size={16} className="text-white/80" />
                                            Process Render
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-min overflow-y-auto pb-10 pr-2 custom-scrollbar">
                                {result.elements.map((element) => (
                                    <ElementBox
                                        key={element.id}
                                        element={element}
                                        onUpdate={handlePromptUpdate}
                                        onRename={handleRenameElement}
                                        onDelete={handleDeleteElement}
                                        onUpdateImage={handleUpdateElementImage}
                                    />
                                ))}

                                <button
                                    onClick={handleAddElement}
                                    className="flex flex-col items-center justify-center gap-5 p-10 border-4 border-dotted border-zinc-300 dark:border-zinc-700 rounded-3xl hover:border-purple-500 dark:hover:border-purple-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:shadow-xl transition-all group min-h-[260px] bg-white dark:bg-zinc-900/40"
                                >
                                    <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-3xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all shadow-md group-hover:scale-110 text-zinc-400 dark:text-zinc-500">
                                        <Plus size={32} />
                                    </div>
                                    <span className="font-black text-zinc-400 dark:text-zinc-500 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors uppercase tracking-[0.25em] text-[10px]">Add Material Node</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
