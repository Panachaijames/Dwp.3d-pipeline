import React, { useState, useEffect } from 'react';
import { SectionTree } from './SectionTree';
import { usePdfLibraryStore } from '@/store/usePdfLibraryStore';
import { PdfUploader } from './PdfUploader';
import { Folder as FolderIcon } from 'lucide-react';

interface PdfLibraryProps {
    projectId: string;
}

export const PdfLibrary: React.FC<PdfLibraryProps> = ({ projectId }) => {
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const { init, isLoading, error } = usePdfLibraryStore();

    useEffect(() => {
        if (projectId) {
            init(projectId);
            setSelectedSectionId(null); // Reset selection on project change
        }
    }, [projectId, init]);

    return (
        <div className="flex h-full w-full bg-white dark:bg-neutral-950 overflow-hidden text-neutral-900 dark:text-white">
            <div className="w-[300px] flex-shrink-0">
                <SectionTree
                    projectId={projectId}
                    selectedSectionId={selectedSectionId}
                    onSelectSection={setSelectedSectionId}
                />
            </div>
            <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-neutral-950">
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 h-full">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-300">Loading Library...</h3>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-red-500 h-full p-8 text-center">
                        <h3 className="text-lg font-medium mb-2">Error Loading Library</h3>
                        <p className="text-sm opacity-80">{error}</p>
                    </div>
                ) : selectedSectionId ? (
                    <PdfUploader sectionId={selectedSectionId} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 h-full">
                        <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center mb-4">
                            <FolderIcon size={32} className="text-neutral-400 dark:text-neutral-700" />
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-300">No Section Selected</h3>
                        <p className="text-sm mt-2 max-w-sm text-center">
                            Select a section from the library sidebar or create a new one to start uploading reference documents.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
