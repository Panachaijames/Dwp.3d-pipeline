import { create } from 'zustand';
import { supabase } from '@/services/supabaseClient';

export interface PdfFile {
    id: string; // This corresponds to the pdf_documents id
    name: string;
    size: number;
    type: string;
    dataUrl?: string; // Kept optional for backwards compatibility, but we no longer save it
    textContent: string;
    storagePath?: string;
}

export interface PdfSection {
    id: string; // UUID from supabase
    projectId?: string;
    name: string;
    parentId?: string; // UUID of parent
    pdfs: PdfFile[];
}

export interface PdfContextSelection {
    id: string;
    sectionName: string;
    text: string;
    pdfs: { name: string; storagePath?: string; textContent: string }[];
}

interface PdfLibraryState {
    sections: PdfSection[];
    isLoading: boolean;
    error: string | null;
    init: (projectId: string) => Promise<void>;
    addSection: (name: string, parentId?: string, projectId?: string) => Promise<void>;
    renameSection: (id: string, newName: string) => Promise<void>;
    deleteSection: (id: string) => Promise<void>;
    addPdfToSection: (sectionId: string, pdf: PdfFile) => Promise<void>;
    removePdfFromSection: (sectionId: string, pdfId: string) => Promise<void>;
    getSelectedSectionsText: (sectionIds: string[]) => PdfContextSelection[];
}

export const usePdfLibraryStore = create<PdfLibraryState>((set, get) => ({
    sections: [],
    isLoading: false,
    error: null,

    init: async (projectId: string) => {
        set({ isLoading: true, error: null });
        try {
            // Fetch sections
            const { data: sectionsData, error: sectionsError } = await supabase
                .from('pdf_sections')
                .select('*')
                .eq('project_id', projectId);

            if (sectionsError) throw sectionsError;

            // Prepare a combined array. First put the empty sections
            const mappedSections: PdfSection[] = (sectionsData || []).map(s => ({
                id: s.id,
                projectId: s.project_id,
                name: s.name,
                parentId: s.parent_id,
                pdfs: []
            }));

            // Fetch documents for the project's sections
            if (mappedSections.length > 0) {
                const sectionIds = mappedSections.map(s => s.id);
                const { data: docsData, error: docsError } = await supabase
                    .from('pdf_documents')
                    .select('id, section_id, name, size, type, text_content, storage_path')
                    .in('section_id', sectionIds);

                if (docsError) throw docsError;

                // Group documents by section
                docsData?.forEach(doc => {
                    const section = mappedSections.find(s => s.id === doc.section_id);
                    if (section) {
                        section.pdfs.push({
                            id: doc.id,
                            name: doc.name,
                            size: Number(doc.size),
                            type: doc.type,
                            textContent: doc.text_content,
                            storagePath: doc.storage_path
                        });
                    }
                });
            }

            set({ sections: mappedSections, isLoading: false });
        } catch (err: any) {
            console.error('Error fetching PDF library:', err);
            set({ error: err.message, isLoading: false });
        }
    },

    addSection: async (name, parentId, projectId) => {
        if (!projectId) return; // Must have a project context

        try {
            const { data, error } = await supabase
                .from('pdf_sections')
                .insert({
                    project_id: projectId,
                    name,
                    parent_id: parentId || null,
                })
                .select()
                .single();

            if (error) throw error;

            set(state => ({
                sections: [...state.sections, {
                    id: data.id,
                    projectId: data.project_id,
                    name: data.name,
                    parentId: data.parent_id,
                    pdfs: []
                }]
            }));
        } catch (err: any) {
            console.error('Error adding section:', err);
            set({ error: err.message });
        }
    },

    renameSection: async (id, newName) => {
        try {
            const { error } = await supabase
                .from('pdf_sections')
                .update({ name: newName })
                .eq('id', id);

            if (error) throw error;

            set(state => ({
                sections: state.sections.map(s => s.id === id ? { ...s, name: newName } : s)
            }));
        } catch (err: any) {
            console.error('Error renaming section:', err);
            set({ error: err.message });
        }
    },

    deleteSection: async (id) => {
        try {
            // Note: Our DB migration has ON DELETE CASCADE, so deleting the parent 
            // will automatically delete child sections and associated documents in the DB.
            const { error } = await supabase
                .from('pdf_sections')
                .delete()
                .eq('id', id);

            if (error) throw error;

            set(state => {
                // To mirror the DB cascade locally, we need to traverse the tree
                const idsToDelete = new Set<string>([id]);
                let added = true;
                while (added) {
                    added = false;
                    for (const s of state.sections) {
                        if (s.parentId && idsToDelete.has(s.parentId) && !idsToDelete.has(s.id)) {
                            idsToDelete.add(s.id);
                            added = true;
                        }
                    }
                }
                return {
                    sections: state.sections.filter((s) => !idsToDelete.has(s.id))
                };
            });
        } catch (err: any) {
            console.error('Error deleting section:', err);
            set({ error: err.message });
        }
    },

    addPdfToSection: async (sectionId, pdf) => {
        try {
            const { data, error } = await supabase
                .from('pdf_documents')
                .insert({
                    section_id: sectionId,
                    name: pdf.name,
                    size: pdf.size,
                    type: pdf.type,
                    text_content: pdf.textContent,
                    storage_path: pdf.storagePath
                    // Intentionally omitting dataUrl, we don't save the actual file to DB
                })
                .select()
                .single();

            if (error) throw error;

            const newPdf: PdfFile = {
                id: data.id,
                name: data.name,
                size: Number(data.size),
                type: data.type,
                textContent: data.text_content,
                storagePath: data.storage_path
            };

            set(state => ({
                sections: state.sections.map(s =>
                    s.id === sectionId ? { ...s, pdfs: [...s.pdfs, newPdf] } : s
                )
            }));
        } catch (err: any) {
            console.error('Error saving PDF:', err);
            throw err; // Re-throw so ui component can catch and show error
        }
    },

    removePdfFromSection: async (sectionId, pdfId) => {
        try {
            const state = get();
            const section = state.sections.find(s => s.id === sectionId);
            const pdf = section?.pdfs.find(p => p.id === pdfId);

            if (pdf && pdf.storagePath) {
                // Delete from Supabase Storage first
                const { error: storageError } = await supabase.storage
                    .from('pdfs')
                    .remove([pdf.storagePath]);

                if (storageError) {
                    console.error('Error deleting PDF from storage:', storageError);
                }
            }

            // Deleting specific document
            const { error } = await supabase
                .from('pdf_documents')
                .delete()
                .eq('id', pdfId);

            if (error) throw error;

            set(state => ({
                sections: state.sections.map(s =>
                    s.id === sectionId ? { ...s, pdfs: s.pdfs.filter(p => p.id !== pdfId) } : s
                )
            }));
        } catch (err: any) {
            console.error('Error deleting PDF:', err);
        }
    },

    getSelectedSectionsText: (sectionIds) => {
        const { sections } = get();
        const getFullPath = (sectionId: string): string => {
            const section = sections.find((s) => s.id === sectionId);
            if (!section) return '';
            if (section.parentId) {
                return `${getFullPath(section.parentId)} > ${section.name}`;
            }
            return section.name;
        };

        return sectionIds
            .map((id) => {
                const section = sections.find((s) => s.id === id);
                if (!section) return null;
                const fullPath = getFullPath(id);
                const concatenatedText = section.pdfs
                    .map((pdf) => `--- [DOCUMENT: ${pdf.name}] ---\n${pdf.textContent}`)
                    .join('\n\n');
                return {
                    id,
                    sectionName: fullPath,
                    text: concatenatedText,
                    pdfs: section.pdfs.map(pdf => ({
                        name: pdf.name,
                        storagePath: pdf.storagePath,
                        textContent: pdf.textContent
                    }))
                };
            })
            .filter(Boolean) as PdfContextSelection[];
    },
}));
