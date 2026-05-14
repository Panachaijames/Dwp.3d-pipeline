import React, { useState } from 'react';
import { SectionTree } from './SectionTree';
import { usePdfLibraryStore, PdfContextSelection } from '@/store/usePdfLibraryStore';
import { X, Check } from 'lucide-react';

interface PdfSectionPickerProps {
    isOpen: boolean;
    projectId: string;
    onClose: () => void;
    onConfirm: (selections: PdfContextSelection[]) => void;
    initialSelectedIds?: string[];
}

export const PdfSectionPicker: React.FC<PdfSectionPickerProps> = ({
    isOpen,
    projectId,
    onClose,
    onConfirm,
    initialSelectedIds
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelectedIds ?? []));
    const getSelectedSectionsText = usePdfLibraryStore(state => state.getSelectedSectionsText);

    React.useEffect(() => {
        if (isOpen) setSelectedIds(new Set(initialSelectedIds ?? []));
    }, [isOpen]);

    if (!isOpen) return null;

    const handleToggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleConfirm = () => {
        const selections = getSelectedSectionsText(Array.from(selectedIds));
        onConfirm(selections);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Attach Reference Context</h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">Select sections to provide context to the AI</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto bg-white dark:bg-neutral-900" style={{ minHeight: '300px' }}>
                    <SectionTree
                        projectId={projectId}
                        selectable
                        selectedIds={selectedIds}
                        onToggleSelect={handleToggleSelect}
                        onSelectSection={() => { }} // Not used in selectable mode
                    />
                </div>

                <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors flex items-center gap-2"
                    >
                        <Check size={16} />
                        {selectedIds.size > 0 ? `Attach (${selectedIds.size})` : 'Clear All'}
                    </button>
                </div>
            </div>
        </div>
    );
};
