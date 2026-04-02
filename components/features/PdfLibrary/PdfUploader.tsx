import React, { useState, useRef, useCallback } from 'react';
import { usePdfLibraryStore } from '@/store/usePdfLibraryStore';
import { parsePdfToText } from '@/lib/pdfParser';
import { supabase } from '@/services/supabaseClient';
import { UploadCloud, FileText, Trash2, Folder, Loader2 } from 'lucide-react';

interface PdfUploaderProps {
    sectionId: string;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({ sectionId }) => {
    const sections = usePdfLibraryStore(state => state.sections);
    const addPdfToSection = usePdfLibraryStore(state => state.addPdfToSection);
    const removePdfFromSection = usePdfLibraryStore(state => state.removePdfFromSection);

    const section = sections.find(s => s.id === sectionId);
    const [isDragging, setIsDragging] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setIsParsing(true);
        setError(null);

        try {
            for (const file of Array.from(files)) {
                if (file.type !== 'application/pdf') {
                    setError(`File ${file.name} is not a PDF`);
                    continue;
                }

                const reader = new FileReader();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target?.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                // Parse text using our utility for search/context
                const textContent = await parsePdfToText(dataUrl);

                // Upload to Supabase Storage 'pdfs' bucket
                const fileExt = file.name.split('.').pop() || 'pdf';
                const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                const filePath = `${sectionId}/${fileName}`;

                const { error: uploadError, data: uploadData } = await supabase.storage
                    .from('pdfs')
                    .upload(filePath, file);

                if (uploadError) {
                    throw new Error(`Failed to upload to storage: ${uploadError.message}`);
                }

                await addPdfToSection(sectionId, {
                    id: crypto.randomUUID(),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    dataUrl,
                    textContent,
                    storagePath: uploadData.path
                });
            }
        } catch (err: any) {
            setError(err.message || 'Failed to parse PDF');
        } finally {
            setIsParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [sectionId, addPdfToSection]);

    if (!section) {
        return (
            <div className="flex-1 flex items-center justify-center text-neutral-500 bg-white dark:bg-neutral-950 h-full">
                Select a section to manage PDFs
            </div>
        );
    }

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
        handleFileUpload(e.dataTransfer.files);
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white p-6 overflow-y-auto w-full">
            <div className="mb-6 border-b border-neutral-200 dark:border-neutral-800 pb-4">
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                    <Folder size={24} className="text-indigo-500" />
                    {section.name}
                </h2>
                <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
                    Upload and organize reference PDFs for this section.
                </p>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors mb-6 ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900'} ${isParsing ? 'opacity-50 pointer-events-none' : ''}`}
            >
                {isParsing ? (
                    <>
                        <Loader2 size={48} className="text-indigo-500 mb-4 animate-spin" />
                        <h3 className="text-lg font-medium">Parsing Document...</h3>
                        <p className="text-sm text-neutral-500 mt-1">Extracting text content context</p>
                    </>
                ) : (
                    <>
                        <UploadCloud size={48} className="text-neutral-500 mb-4" />
                        <h3 className="text-lg font-medium">Drag & drop PDFs here</h3>
                        <p className="text-sm text-neutral-500 mt-1 mb-4">or click to browse from your computer</p>
                        <input
                            type="file"
                            accept=".pdf"
                            multiple
                            className="hidden"
                            ref={fileInputRef}
                            onChange={(e) => handleFileUpload(e.target.files)}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                            Select Files
                        </button>
                    </>
                )}
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-md mb-6 text-sm">
                    {error}
                </div>
            )}

            {section.pdfs.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Uploaded Documents ({section.pdfs.length})</h3>
                    {section.pdfs.map(pdf => (
                        <div key={pdf.id} className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
                            <div className="flex items-start gap-4">
                                <div className="p-2 bg-neutral-200 dark:bg-neutral-800 rounded-md text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                    <FileText size={24} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-medium text-sm text-neutral-900 dark:text-white line-clamp-1 truncate block">{pdf.name}</h4>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                                        <span>{formatSize(pdf.size)}</span>
                                        <span className="w-1 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-full" />
                                        <span>{pdf.textContent.length.toLocaleString()} chars</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (confirm(`Remove ${pdf.name}?`)) {
                                        removePdfFromSection(section.id, pdf.id);
                                    }
                                }}
                                className="p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400 rounded-md transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 ml-4"
                                title="Delete PDF"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
