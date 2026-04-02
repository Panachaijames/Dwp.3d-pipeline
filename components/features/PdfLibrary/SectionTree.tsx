import React, { useState } from 'react';
import { usePdfLibraryStore, PdfSection } from '@/store/usePdfLibraryStore';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Trash2, Edit2, Check, X } from 'lucide-react';

interface SectionTreeProps {
    onSelectSection: (id: string) => void;
    selectedSectionId?: string | null;
    selectable?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    projectId: string;
}

export const SectionTree: React.FC<SectionTreeProps> = ({
    onSelectSection,
    selectedSectionId,
    selectable = false,
    selectedIds,
    onToggleSelect,
    projectId
}) => {
    const sections = usePdfLibraryStore((state) => state.sections);
    const addSection = usePdfLibraryStore((state) => state.addSection);

    // Get root sections (no parentId)
    const projectSections = sections.filter(s => s.projectId === projectId);
    const rootSections = projectSections.filter(s => !s.parentId);

    return (
        <div className="w-full text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Library</h2>
                    <button
                        onClick={() => addSection('New Section', undefined, projectId)}
                        className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors"
                        title="Add Root Section"
                    >
                        <Plus size={18} />
                    </button>
                </div>

                {rootSections.length === 0 ? (
                    <div className="text-neutral-400 dark:text-neutral-500 text-sm text-center mt-10">
                        No sections yet. Add one to get started.
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {rootSections.map(section => (
                            <SectionNode
                                key={section.id}
                                section={section}
                                allSections={projectSections}
                                selectedSectionId={selectedSectionId}
                                onSelectSection={onSelectSection}
                                selectable={selectable}
                                selectedIds={selectedIds}
                                onToggleSelect={onToggleSelect}
                                level={0}
                                projectId={projectId}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

interface SectionNodeProps {
    section: PdfSection;
    allSections: PdfSection[];
    selectedSectionId?: string | null;
    onSelectSection: (id: string) => void;
    selectable: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    level: number;
    projectId: string;
}

const SectionNode: React.FC<SectionNodeProps> = ({
    section,
    allSections,
    selectedSectionId,
    onSelectSection,
    selectable,
    selectedIds,
    onToggleSelect,
    level,
    projectId
}) => {
    const [expanded, setExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(section.name);

    const renameSection = usePdfLibraryStore(state => state.renameSection);
    const deleteSection = usePdfLibraryStore(state => state.deleteSection);
    const addSection = usePdfLibraryStore(state => state.addSection);

    const children = allSections.filter(s => s.parentId === section.id);
    const hasChildren = children.length > 0;
    const isSelected = selectedSectionId === section.id;

    const handleSaveRename = () => {
        if (editName.trim()) {
            renameSection(section.id, editName.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSaveRename();
        if (e.key === 'Escape') {
            setIsEditing(false);
            setEditName(section.name);
        }
    };

    return (
        <div className="flex flex-col">
            <div
                className={`group flex items-center justify-between py-1.5 px-2 rounded-md transition-colors ${isSelected && !selectable ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-400' : 'hover:bg-neutral-200 dark:hover:bg-neutral-800'}`}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className={`p-0.5 rounded-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 ${!hasChildren && 'invisible'}`}
                    >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {selectable && onToggleSelect && (
                        <input
                            type="checkbox"
                            checked={selectedIds?.has(section.id) || false}
                            onChange={() => onToggleSelect(section.id)}
                            className="mt-0.5"
                        />
                    )}

                    <div
                        className="flex items-center gap-2 cursor-pointer truncate"
                        onClick={() => !selectable && onSelectSection(section.id)}
                    >
                        {expanded ? <FolderOpen size={16} className={isSelected && !selectable ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'} /> : <Folder size={16} className={isSelected && !selectable ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'} />}

                        {isEditing ? (
                            <div className="flex items-center" onClick={e => e.stopPropagation()}>
                                <input
                                    autoFocus
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="bg-white dark:bg-neutral-800 border border-indigo-500 rounded px-1 py-0.5 text-sm w-32 outline-none text-neutral-900 dark:text-white"
                                />
                                <button onClick={handleSaveRename} className="p-1 ml-1 text-green-400"><Check size={14} /></button>
                                <button onClick={() => setIsEditing(false)} className="p-1 text-red-400"><X size={14} /></button>
                            </div>
                        ) : (
                            <span className="text-sm truncate select-none">{section.name}</span>
                        )}

                        {!isEditing && section.pdfs.length > 0 && (
                            <span className="ml-2 text-[10px] bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full text-neutral-600 dark:text-neutral-400">
                                {section.pdfs.length}
                            </span>
                        )}
                    </div>
                </div>

                {!selectable && (
                    <div className="flex items-center gap-1 opacity-40 flex-shrink-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); addSection('New Sub-section', section.id, projectId); setExpanded(true); }}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                            title="Add Sub-section"
                        >
                            <Plus size={14} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
                            title="Rename"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Are you sure you want to delete "${section.name}" and all sub-sections?`)) {
                                    deleteSection(section.id);
                                    if (isSelected) onSelectSection(''); // clear selection if deleted
                                }
                            }}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                            title="Delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>

            {expanded && hasChildren && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                    {children.map(child => (
                        <SectionNode
                            key={child.id}
                            section={child}
                            allSections={allSections}
                            selectedSectionId={selectedSectionId}
                            onSelectSection={onSelectSection}
                            selectable={selectable}
                            selectedIds={selectedIds}
                            onToggleSelect={onToggleSelect}
                            level={level + 1}
                            projectId={projectId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
