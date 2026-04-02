"use client";

import React, { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';

interface ImageUploaderProps {
    onImageSelected: (file: File) => void;
    selectedImage: string | null;
    onClear: () => void;
    disabled: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected, selectedImage, onClear, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                onImageSelected(file);
            }
        }
    }, [onImageSelected, disabled]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onImageSelected(e.target.files[0]);
        }
    }, [onImageSelected]);

    if (selectedImage) {
        return (
            <div className="relative w-full h-96 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 shadow-sm group">
                <img
                    src={selectedImage}
                    alt="Selected for analysis"
                    className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                        onClick={onClear}
                        disabled={disabled}
                        className="bg-white/10 hover:bg-red-500 text-white p-3 rounded-full backdrop-blur-md transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
        relative w-full h-96 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden
        ${isDragging
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/10 scale-[1.02]'
                    : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
        >
            <input
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                disabled={disabled}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />

            <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-purple-100 text-purple-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'}`}>
                {isDragging ? <ImageIcon size={48} /> : <Upload size={48} />}
            </div>

            <div className="text-center px-6">
                <p className="text-lg font-medium text-zinc-900 dark:text-zinc-200">
                    {isDragging ? "Drop image here" : "Drag & drop an image to analyze"}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                    or click to browse from your device
                </p>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Supports JPG, PNG, WEBP</p>
        </div>
    );
};
