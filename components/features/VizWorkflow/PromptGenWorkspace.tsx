"use client";
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { TOOLS, VizProject, VizLog, PhaseKey, freshLog as makeFreshLog, MaterialAnnotation, DD_PHASE_MATERIAL_SCHEDULE, MATERIAL_BOARD_CATEGORIES, FURNITURE_CATEGORIES, FULL_CATEGORY_CATALOG } from './constants';
import AnnotatedRender from '../DDMaterialTagger/AnnotatedRender';

// Konva + in-browser SAM — client-only, loaded on demand when a board is opened in the canvas
const BoardCanvasEditor = dynamic(() => import('./BoardCanvasEditor'), { ssr: false });
import { useAuth } from '../../../contexts/AuthContext';
import { PdfSectionPicker } from '../PdfLibrary/PdfSectionPicker';
import { usePdfLibraryStore, PdfContextSelection } from '@/store/usePdfLibraryStore';

const LLM_PROVIDERS = [
    { id: "gemini", label: "Gemini 3.1 Pro", active: true },
    { id: "claude", label: "Claude Opus", active: true },
    { id: "gpt", label: "GPT-5.4", active: true },
];

interface Props { proj: VizProject; logs: VizLog[]; saveL: (l: VizLog) => void; freshLog: (pid: string, toolName?: string) => VizLog; }
interface PGResult {
    id: string;
    mode: string;
    input: string;
    tools: string;
    content: string;
    llm: string;
    imageData?: string | null;
    feedback?: "good" | "retry" | null;
    retryHint?: string;
    retrying?: boolean;
}

type MBReferenceSource = "override" | "main" | null;
type MBImageEntry = {
    src: string | null;
    styleName: string;
    status?: "complete" | "empty-fallback" | "failed";
    warning?: string;
};

const MATERIAL_BOARD_REFERENCE_ANALYSIS_PROMPT = `Analyze this reference image in detail. The image may be a material/mood board OR an interior room render - handle both cases. Your description will be fed to an image generation model that needs to reproduce the EXACT furniture pieces visible here, so be hyper-specific.

1. IMAGE TYPE - Is this a flat-lay material board, or a 3D interior room render? State which.

2. PRIMARY CHAIR / SEATING - Start with the most prominent chair or seating piece. Describe it like a product listing - at minimum 60 words:
   - Overall silhouette: is it a wing chair, lounge chair, club chair, swivel chair, slipper chair, hooded/cocoon chair, armless, with arms, low/tall back?
   - The back: straight, curved, hooded, scooped, fan-shaped, with or without ears?
   - The seat: square, rounded, deep, shallow, single cushion or none?
   - The arms: integrated, scrolled, flat, missing, curved inward?
   - The base: legs (number, shape, material), plinth, swivel base, sled?
   - Upholstery material: boucle, velvet, leather, fabric, linen, etc.
   - Upholstery colour: precise tone (e.g. "warm taupe boucle", "oxblood velvet", "cream leather").
   - Proportions: tall, wide, low, etc.
   - Any distinctive feature that would let someone identify THIS chair in a lineup of 50 chairs.

3. PRIMARY PLANT / TREE / BOTANICAL - Identify only the single most useful plant, small tree, or botanical accent to pair with the chair. Describe its type, leaf shape, scale, pot if visible, colour, and pose. If no plant/tree is visible, say "No plant/tree visible."

4. DO NOT COPY - Briefly list any visible beds, tables, lamps, ottomans, stools, benches, mirrors, bags, vases, decor accessories, extra chairs, or other objects that should be ignored.
5. LAYOUT & COMPOSITION - how the selected chair and plant/tree can sit together compactly.
6. SURFACE / BACKGROUND - base surface, walls, ground.
7. COLOUR PALETTE - dominant tones and mood.
8. LIGHTING - type, direction, warmth.
9. OVERALL AESTHETIC - minimal, luxurious, coastal, moody, eclectic, etc.

Be specific and descriptive. This analysis will be used together with the image itself to recreate the same furniture/objects in a new flat-lay material concept board.`;

const MATERIAL_BOARD_REFERENCE_ANALYSIS_SYSTEM = "You are an expert interior design analyst. Provide a concise, structured analysis of the uploaded image. The output will be used for a clean material board, so focus only on one primary chair/seating piece and one primary plant/tree/botanical accent. Explicitly ignore beds, tables, lamps, ottomans, stools, benches, mirrors, bags, vases, accessories, extra chairs, and other decor. Avoid brand names. Keep under 300 words.";

const triggerDownload = (href: string, filename: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const loadCanvasImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded for export"));
    img.src = src;
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function compressImage(dataUrl: string, maxPx = 2048, quality = 0.85): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    });
}

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
};

const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
        const nextLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(nextLine).width <= maxWidth || !line) {
            line = nextLine;
        } else {
            lines.push(line);
            line = word;
        }
    }

    if (line) lines.push(line);
    return lines;
};

const drawAnnotationLabel = (
    ctx: CanvasRenderingContext2D,
    annotation: MaterialAnnotation,
    canvasWidth: number,
    canvasHeight: number,
) => {
    const scale = clamp(Math.max(canvasWidth, canvasHeight) / 760, 1, 4);
    const code = annotation.code.trim() || "TAG";
    const note = annotation.note?.trim() || "";
    const paddingX = 6 * scale;
    const paddingY = 3 * scale;
    const gap = 2 * scale;
    const radius = 3 * scale;
    const codeFontSize = 11 * scale;
    const noteFontSize = 8 * scale;
    const codeLineHeight = 14 * scale;
    const noteLineHeight = 10 * scale;
    const maxNoteWidth = 120 * scale;

    ctx.save();
    ctx.font = `700 ${codeFontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const codeWidth = ctx.measureText(code).width;
    ctx.font = `500 ${noteFontSize}px Arial, sans-serif`;
    const noteLines = note ? wrapCanvasText(ctx, note, maxNoteWidth) : [];
    const noteWidth = noteLines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const labelWidth = Math.max(codeWidth, noteWidth) + paddingX * 2;
    const labelHeight = paddingY * 2 + codeLineHeight + (noteLines.length ? gap + noteLines.length * noteLineHeight : 0);
    const centerX = (clamp(annotation.x, 0, 100) / 100) * canvasWidth;
    const centerY = (clamp(annotation.y, 0, 100) / 100) * canvasHeight;
    const left = clamp(centerX - labelWidth / 2, 2 * scale, Math.max(2 * scale, canvasWidth - labelWidth - 2 * scale));
    const top = clamp(centerY - labelHeight / 2, 2 * scale, Math.max(2 * scale, canvasHeight - labelHeight - 2 * scale));

    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetY = 1 * scale;
    roundedRect(ctx, left, top, labelWidth, labelHeight, radius);
    ctx.fillStyle = "#ccff00";
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#000";
    ctx.textBaseline = "top";
    ctx.font = `700 ${codeFontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(code, left + paddingX, top + paddingY);

    if (noteLines.length) {
        ctx.fillStyle = "#222";
        ctx.font = `500 ${noteFontSize}px Arial, sans-serif`;
        noteLines.forEach((line, index) => {
            ctx.fillText(line, left + paddingX, top + paddingY + codeLineHeight + gap + index * noteLineHeight);
        });
    }

    ctx.restore();
};

const exportAnnotatedImage = async (imageSrc: string, annotations: MaterialAnnotation[], filename: string) => {
    const img = await loadCanvasImage(imageSrc);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("Image has no exportable dimensions");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas export is not supported in this browser");

    ctx.drawImage(img, 0, 0, width, height);
    annotations.forEach(annotation => drawAnnotationLabel(ctx, annotation, width, height));

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        triggerDownload(blobUrl, filename);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return;
    }

    triggerDownload(canvas.toDataURL("image/png"), filename);
};

// Auto-number bare category codes so repeated categories stay distinct (WD → WD-01, WD-02).
// Tags with the same code AND the same note describe the same material and share one number,
// so tagging the same finish twice yields qty 2 in the schedule rather than a phantom second
// material. Codes that already carry digits (MT01, GL04+MT02, WD-01) are left untouched.
const autoNumberAnnotations = (anns: MaterialAnnotation[]): MaterialAnnotation[] => {
    const nextNum = new Map<string, number>();            // "WD" → highest number issued
    const issued = new Map<string, string>();             // "WD|walnut veneer" → "WD-01"
    // Seed from any codes the model already numbered, so a bare "WD" can't collide with an
    // existing "WD-01" — and a bare "WD" with the same note reuses it instead of splitting.
    for (const a of anns) {
        const m = a.code.trim().match(/^([A-Za-z]+)-(\d+)$/);
        if (m) {
            const prefix = m[1].toUpperCase();
            nextNum.set(prefix, Math.max(nextNum.get(prefix) ?? 0, parseInt(m[2], 10)));
            issued.set(`${prefix}|${(a.note ?? '').trim().toLowerCase()}`, a.code.trim());
        }
    }
    return anns.map(a => {
        const code = a.code.trim();
        if (!/^[A-Za-z]+$/.test(code)) return a;
        const prefix = code.toUpperCase();
        const groupKey = `${prefix}|${(a.note ?? '').trim().toLowerCase()}`;
        let numbered = issued.get(groupKey);
        if (!numbered) {
            const n = (nextNum.get(prefix) ?? 0) + 1;
            nextNum.set(prefix, n);
            numbered = `${prefix}-${String(n).padStart(2, '0')}`;
            issued.set(groupKey, numbered);
        }
        return { ...a, code: numbered };
    });
};

export default function PromptGenWorkspace({ proj, logs, saveL, freshLog: makeFresh }: Props) {
    const { user, accessToken, requestDriveAccess } = useAuth();
    const [mode, setMode] = useState<"brief" | "image" | "custom">("brief");
    const [briefInput, setBriefInput] = useState("");
    const [imageFile, setImageFile] = useState<string | null>(null);
    const [imageData, setImageData] = useState<string | null>(null);
    const [customCtx, setCustomCtx] = useState("");
    const [targetTools, setTargetTools] = useState<string[]>(["Nano-Banana"]);
    const [llmProvider, setLlmProvider] = useState("gemini");
    const [results, setResults] = useState<PGResult[]>([]);
    const [loading, setLoading] = useState(false);
    // Per-result retry hint state (keyed by result id)
    const [retryHints, setRetryHints] = useState<Record<string, string>>({});
    // Feedback flash states
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());
    const [fullScreenResult, setFullScreenResult] = useState<string | null>(null);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
    const [canvasEditor, setCanvasEditor] = useState<{ src: string; title: string } | null>(null);
    const [showMbImport, setShowMbImport] = useState(false);
    const [mbImportUrl, setMbImportUrl] = useState('');
    const [mbImporting, setMbImporting] = useState(false);
    const mbImportFileRef = useRef<HTMLInputElement | null>(null);

    // Imported boards (Pinterest/URL/file) — persisted per project in IndexedDB so the
    // canvas can be reopened later (its edit session is saved separately by the editor).
    type ImportedBoard = { id: string; title: string; src: string; addedAt: number };
    const [importedBoards, setImportedBoards] = useState<ImportedBoard[]>([]);
    const importsKey = `dwp_mb_imports_${proj.id}`;

    useEffect(() => {
        let alive = true;
        idbGet(importsKey).then((list) => { if (alive && Array.isArray(list)) setImportedBoards(list); }).catch(() => {});
        return () => { alive = false; };
    }, [importsKey]);

    const addImportedBoard = (title: string, src: string) => {
        setImportedBoards(prev => {
            const entry: ImportedBoard = { id: Math.random().toString(36).substring(2, 11), title, src, addedAt: Date.now() };
            const next = [entry, ...prev].slice(0, 12);
            void idbSet(importsKey, next).catch((e) => console.warn('[imports] save failed:', e));
            return next;
        });
    };

    const removeImportedBoard = (id: string) => {
        setImportedBoards(prev => {
            const next = prev.filter(b => b.id !== id);
            void idbSet(importsKey, next).catch(() => {});
            return next;
        });
    };

    // Import an external board (e.g. a Pinterest pin or image URL) into the canvas editor.
    const importBoardFromUrl = async () => {
        const url = mbImportUrl.trim();
        if (!url || mbImporting) return;
        setMbImporting(true);
        try {
            const res = await fetch('/api/fetch-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            let data: any = {};
            try { data = await res.json(); } catch { /* non-JSON */ }
            if (!res.ok || !data.imageData) throw new Error(data.error || `Fetch failed (${res.status})`);
            const title = /pinterest\.|pinimg\./i.test(url) ? 'Pinterest board' : 'Imported board';
            addImportedBoard(title, data.imageData);
            setCanvasEditor({ src: data.imageData, title });
            setMbImportUrl('');
        } catch (err: any) {
            alert(`Import failed: ${err?.message || 'unknown error'}\n\nTip: on Pinterest, right-click the image → "Copy image address" and paste that URL instead.`);
        } finally {
            setMbImporting(false);
        }
    };

    const importBoardFromFile = (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const title = file.name.replace(/\.[^.]+$/, '') || 'Imported board';
            addImportedBoard(title, String(reader.result));
            setCanvasEditor({ src: String(reader.result), title });
        };
        reader.onerror = () => alert('Could not read that file');
        reader.readAsDataURL(file);
    };
    // Direct Image Generation State
    const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
    const [showImageOptions, setShowImageOptions] = useState<Record<string, boolean>>({});
    const [generatedImages, setGeneratedImages] = useState<Record<string, string[]>>({});
    const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
    // Material Board Image Generation State
    const [mbImageLoading, setMbImageLoading] = useState<Record<string, boolean>>({});
    const [mbImageProgress, setMbImageProgress] = useState<Record<string, number>>({});
    const [showMbImageOptions, setShowMbImageOptions] = useState<Record<string, boolean>>({});
    const [mbGeneratedImages, setMbGeneratedImages] = useState<Record<string, MBImageEntry[]>>({});
    const [mbImageErrors, setMbImageErrors] = useState<Record<string, string>>({});
    // Material Board Reference Image state
    const [mbRefImage, setMbRefImage] = useState<string | null>(null);
    const [mbRefFile, setMbRefFile] = useState<string | null>(null);
    const [mbRefAnalysis, setMbRefAnalysis] = useState<string | null>(null);
    const [mbRefAnalyzing, setMbRefAnalyzing] = useState(false);
    // PDF Library Context state
    const [pdfContext, setPdfContext] = useState<PdfContextSelection[]>([]);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    // PDF extraction state
    const [pdfName, setPdfName] = useState<string | null>(null);
    const [pdfExtracting, setPdfExtracting] = useState(false);
    // Furniture Analysis State (per-result)
    const [furnitureLists, setFurnitureLists] = useState<Record<string, string[]>>({});
    const [furnitureAnalyzing, setFurnitureAnalyzing] = useState<Record<string, boolean>>({});
    const [furnitureGenLoading, setFurnitureGenLoading] = useState<Record<string, boolean>>({});
    const [furnitureGenImages, setFurnitureGenImages] = useState<Record<string, string[]>>({});
    const [furnitureGenErrors, setFurnitureGenErrors] = useState<Record<string, string>>({});
    const [showFurnitureGenOptions, setShowFurnitureGenOptions] = useState<Record<string, boolean>>({});

    // Material Code Tagger State (per generated image)
    const [materialCodeList, setMaterialCodeList] = useState<string>("");
    const [imgTagLoading, setImgTagLoading] = useState<Record<string, boolean>>({});
    const [imgAnnotations, setImgAnnotations] = useState<Record<string, MaterialAnnotation[]>>({});
    const [imgTagErrors, setImgTagErrors] = useState<Record<string, string>>({});
    // Per-image 4K upscaled versions (Nano Banana edit-mode enhancement)
    const [imgUpscaled, setImgUpscaled] = useState<Record<string, string>>({});
    const [imgUpscaling, setImgUpscaling] = useState<Record<string, boolean>>({});
    // Per-image Google Sheets export loading state
    const [sheetExporting, setSheetExporting] = useState<Record<string, boolean>>({});

    // Snippet Modals
    const [snippetModal, setSnippetModal] = useState<{ isOpen: boolean, text: string, name: string, type: "global" | "project", mode: string, tools: string, llm: string }>({ isOpen: false, text: "", name: "", type: "global", mode: "", tools: "", llm: "" });
    const [pickerModal, setPickerModal] = useState<{ isOpen: boolean, target: "brief" | "custom", activeTab: "top10" | "project" | "global" }>({ isOpen: false, target: "custom", activeTab: "top10" });
    const [pickerEntries, setPickerEntries] = useState<any[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);

    const outputRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const pdfRef = useRef<HTMLInputElement>(null);
    const mbRefInputRef = useRef<HTMLInputElement>(null);

    // Preserve output-panel scroll position across layout-shifting state updates
    const scrollSaverRef = useRef<number | null>(null);
    const saveScroll = useCallback(() => {
        scrollSaverRef.current = outputRef.current?.scrollTop ?? null;
    }, []);
    useLayoutEffect(() => {
        if (scrollSaverRef.current != null && outputRef.current) {
            outputRef.current.scrollTop = scrollSaverRef.current;
            scrollSaverRef.current = null;
        }
    });

    // Initialize the PDF store so sections are available even if the user hasn't visited the PDF Library tab yet
    useEffect(() => {
        if (proj.id) {
            usePdfLibraryStore.getState().init(proj.id);
        }
    }, [proj.id]);

    // Persist results (incl. reference image) and tag annotations per project so customer-revision workflows survive a refresh
    const persistKeyFor = (id: string) => `dwp_promptgen_${id}`;
    const loadedForProjectRef = useRef<string | null>(null);

    useEffect(() => {
        if (!proj.id) return;
        loadedForProjectRef.current = null;
        try {
            const saved = localStorage.getItem(persistKeyFor(proj.id));
            const data = saved ? JSON.parse(saved) : null;
            setResults(Array.isArray(data?.results) ? data.results : []);
            setImgAnnotations(data?.imgAnnotations && typeof data.imgAnnotations === 'object' ? data.imgAnnotations : {});
        } catch (e) {
            console.warn('[PromptGen] Failed to load saved state:', e);
            setResults([]);
            setImgAnnotations({});
        }
        loadedForProjectRef.current = proj.id;
    }, [proj.id]);

    useEffect(() => {
        if (!proj.id || loadedForProjectRef.current !== proj.id) return;
        try {
            localStorage.setItem(persistKeyFor(proj.id), JSON.stringify({ results, imgAnnotations }));
        } catch (e) {
            console.warn('[PromptGen] Failed to persist state (likely localStorage quota exceeded):', e);
        }
        // proj.id intentionally omitted: see load effect — including it causes a stale-data write during project switch
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, imgAnnotations]);

    const toggleTool = (t: string) => setTargetTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    const externalTools = TOOLS.filter(t => !t.internal && !t.future);

    const handlePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setPdfName(f.name);
        setPdfExtracting(true);
        setBriefInput('');
        try {
            // Dynamically import pdfjs to avoid SSR issues
            const pdfjsLib = await import('pdfjs-dist');
            // Point to the worker bundled with pdfjs-dist
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
            const arrayBuffer = await f.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pages: string[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => ('str' in item ? item.str : ''))
                    .join(' ')
                    .replace(/ {2,}/g, ' ')
                    .trim();
                if (pageText) pages.push(`--- Page ${i} ---\n${pageText}`);
            }
            const fullText = pages.join('\n\n');
            setBriefInput(fullText || '[No readable text found in PDF]');
        } catch (err) {
            setBriefInput('[Error reading PDF — please paste the brief manually]');
            setPdfName(null);
        }
        setPdfExtracting(false);
        // Reset input so same file can be re-uploaded
        if (pdfRef.current) pdfRef.current.value = '';
    };

    const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        setImageFile(f.name);
        const reader = new FileReader();
        reader.onload = async ev => {
            const raw = ev.target?.result as string;
            const compressed = await compressImage(raw);
            setImageData(compressed);
        };
        reader.readAsDataURL(f);
    };

    const tagImage = async (imgSrc: string, key: string, tagMode: 'scene' | 'materialBoard' | 'furniture' = 'scene') => {
        if (imgTagLoading[key]) return;
        saveScroll();
        setImgTagLoading(prev => ({ ...prev, [key]: true }));
        setImgTagErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
        setImgAnnotations(prev => { const n = { ...prev }; delete n[key]; return n; });
        const customList = materialCodeList.trim();
        let activeSchedule: string;
        let systemPrompt: string;
        let prompt: string;
        const materialFurnitureSyncRules = `Material/furniture sync rules:
- For every furniture or FF&E tag, include the visible material/finish keyword in "note" whenever it can be identified (examples: "walnut lounge chair", "cream boucle sofa", "black metal table", "brass table lamp").
- If a furniture piece uses the same visible material/finish as a material/surface tag in the same image, reuse the exact same material keyword in both notes.
- Keep the code from the requested schedule; put material wording in "note", not in "code".
- If the material is unclear, describe the furniture normally.`;
        if (tagMode === 'materialBoard') {
            activeSchedule = MATERIAL_BOARD_CATEGORIES;
            systemPrompt = `You are a material board annotator. The image is a flat-lay or moodboard showing physical material samples (swatches of stone, wood, fabric, metal, glass, paint, tile, etc.). Identify every distinct material swatch in the image and tag it with the most appropriate 2-letter category code from the schedule below. Place each tag at the centre of that swatch. Tag every visible swatch — typically 6-15 items. Use ONLY codes from the provided schedule.\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary. Each item: {"code":"WD","x":25,"y":40,"note":"walnut veneer"}. The "note" is a 1-3 word description of the specific swatch (e.g. "walnut veneer", "brushed brass", "honed travertine"). x and y are % positions (0-100) from top-left.`;
            prompt = `Material Categories:\n${activeSchedule}\n\nTag every visible material swatch on this board.`;
        } else if (tagMode === 'furniture') {
            activeSchedule = FURNITURE_CATEGORIES;
            systemPrompt = `You are a furniture / FF&E tagger. The image shows one or more interior furniture pieces. Tag each visible furniture element using ONLY the 2-letter category codes from the schedule below - do not invent any other codes. The "note" should describe the specific piece and visible material/finish keyword (e.g. "walnut lounge chair", "cream boucle sofa", "brass table lamp"). For images of a single isolated piece, place ONE tag at the centre of the piece. For multi-piece scenes, tag every distinct piece.\n\n${materialFurnitureSyncRules}\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary. Each item: {"code":"SE","x":50,"y":60,"note":"walnut lounge chair"}. x and y are % positions (0-100) from top-left.`;
            prompt = `Furniture Categories (use ONLY these codes):\n${activeSchedule}\n\nTag every furniture piece visible in this image. Use material/finish keywords in furniture notes when visible, and reuse the same material keyword for pieces using the same material.`;
        } else {
            // 'scene' mode — DD-specific codes when available, otherwise the full generic catalogue
            activeSchedule = customList.length > 0
                ? customList
                : (proj.phase === "DD" ? DD_PHASE_MATERIAL_SCHEDULE : FULL_CATEGORY_CATALOG);
            const isDDProject = customList.length > 0 || proj.phase === "DD";
            systemPrompt = isDDProject
                ? `You are an interior design material code annotator for a DD phase project. Analyse the interior image and match every visible surface, material, finish, and element to the most appropriate code from the provided schedule. For surfaces combining two materials, write "CODE1+CODE2" (e.g. "GL04+MT02"). Tag at least 8 elements. Use ONLY codes from the provided schedule. Omit codes not visible.\n\n${materialFurnitureSyncRules}\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary, no explanation. Each item: {"code":"MT01","x":25,"y":40,"note":"brushed metal chair frame"}. x and y are % positions (0-100) from top-left.`
                : `You are an interior design tagger. Tag every visible material, furniture piece, plumbing fixture, electrical/lighting element, and finish in this image, using ONLY the 2-letter category codes from the schedule below. Tag at least 8 elements. The "note" should be a 1-3 word description of the specific item (e.g. "walnut floor", "walnut lounge chair", "pendant lamp", "stone wall").\n\n${materialFurnitureSyncRules}\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary. Each item: {"code":"SE","x":25,"y":60,"note":"walnut lounge chair"}. x and y are % positions (0-100) from top-left.`;
            prompt = `Schedule:\n${activeSchedule}\n\nTag every visible element on this image. For furniture tags, include material/finish keywords in note when visible and reuse the same material keyword for furniture using the same material.`;
        }
        let rawText = '';
        try {
            const res = await fetch("/api/gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, systemPrompt, imageData: imgSrc }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            rawText = data.response || data.text || '';
            console.warn('[tagImage] raw response:', rawText);
            const parsed = parseTagJSON(rawText);
            if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty tag list — model returned no annotations');
            saveScroll();
            setImgAnnotations(prev => ({
                ...prev,
                [key]: autoNumberAnnotations(parsed
                    .filter(a => a && typeof a.code === 'string' && typeof a.x === 'number' && typeof a.y === 'number')
                    .map(a => ({
                        code: String(a.code),
                        x: Math.max(0, Math.min(100, Number(a.x))),
                        y: Math.max(0, Math.min(100, Number(a.y))),
                        note: a.note ? String(a.note) : undefined,
                        id: Math.random().toString(36).substring(2, 11),
                    }))),
            }));
        } catch (err: any) {
            const snippet = rawText ? ` · raw: ${rawText.slice(0, 160)}` : '';
            saveScroll();
            setImgTagErrors(prev => ({ ...prev, [key]: (err.message || 'Tagging failed') + snippet }));
        }
        saveScroll();
        setImgTagLoading(prev => ({ ...prev, [key]: false }));
    };

    // Upscale an image to 4K via Nano Banana edit-mode (preserves composition, sharpens detail).
    const upscaleImage = async (imgSrc: string, key: string) => {
        if (imgUpscaling[key]) return;
        saveScroll();
        setImgUpscaling(prev => ({ ...prev, [key]: true }));
        try {
            const res = await fetch("/api/imagen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "Upscale this exact image to 4K resolution. Maximally sharpen all details, remove blur and softness, enhance fine textures and edges. Preserve the EXACT composition, framing, colors, lighting, materials, and content — every object stays in its original position. Do NOT add, remove, or change anything. Output ONLY a high-resolution version of the same image. No text, no labels, no annotations.",
                    targetModel: 'nano-banana',
                    singleImage: true,
                    imageData: imgSrc,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upscale failed");
            const upscaled = data.images?.[0];
            if (!upscaled) throw new Error("No upscaled image returned");
            saveScroll();
            setImgUpscaled(prev => ({ ...prev, [key]: upscaled }));
        } catch (err: any) {
            console.warn('[upscaleImage] failed:', err);
        }
        saveScroll();
        setImgUpscaling(prev => ({ ...prev, [key]: false }));
    };

    const exportTagsToSheets = async (annotations: MaterialAnnotation[], tagKey: string) => {
        if (!annotations.length) return;
        if (!accessToken) {
            requestDriveAccess();
            return;
        }
        // Open a placeholder tab synchronously so the browser treats it as a user-initiated
        // popup. The fetch below takes a few seconds; by the time it resolves, a deferred
        // window.open would be blocked. We navigate this tab to the sheet URL when ready.
        const pendingTab = window.open('about:blank', '_blank');
        if (pendingTab?.document?.body) {
            pendingTab.document.title = 'Preparing your Google Sheet…';
            pendingTab.document.body.style.cssText = 'font-family:system-ui;padding:32px;color:#333;background:#fafafa';
            pendingTab.document.body.innerHTML =
                '<h2 style="margin:0 0 8px">Preparing your Google Sheet…</h2>' +
                '<p style="color:#666">Building your material schedule. This tab will redirect automatically.</p>';
        }
        setSheetExporting(prev => ({ ...prev, [tagKey]: true }));
        try {
            const res = await fetch('/api/sheets/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ annotations, projectName: proj.name }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) {
                    pendingTab?.close();
                    requestDriveAccess(true);
                    return;
                }
                throw new Error(data.error || 'Failed to export to Google Sheets');
            }
            if (data.url) {
                if (pendingTab && !pendingTab.closed) {
                    pendingTab.location.href = data.url;
                } else {
                    // Popup was blocked or closed — fall back to navigating the current tab.
                    window.open(data.url, '_blank', 'noopener,noreferrer') ?? (window.location.href = data.url);
                }
            } else {
                pendingTab?.close();
            }
        } catch (err: any) {
            console.error('[exportTagsToSheets] failed:', err);
            pendingTab?.close();
            alert(`Sheet export failed: ${err.message || 'Unknown error'}`);
        } finally {
            setSheetExporting(prev => ({ ...prev, [tagKey]: false }));
        }
    };

    // Tolerant JSON-array parser for Gemini responses that may include prose / fences / smart quotes / trailing commas
    const parseTagJSON = (text: string): any[] => {
        if (!text) throw new Error('Empty response from Gemini');
        try { const direct = JSON.parse(text); if (Array.isArray(direct)) return direct; } catch {}
        let cleaned = text
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'");
        const first = cleaned.indexOf('[');
        const last = cleaned.lastIndexOf(']');
        if (first === -1 || last === -1 || last <= first) throw new Error(`No JSON array found in response`);
        cleaned = cleaned.slice(first, last + 1).replace(/,(\s*[\]}])/g, '$1');
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) throw new Error('Parsed value is not an array');
        return parsed;
    };

    // Reusable taggable-image cell — used for both reference image and generated scene images.
    // Renders a 4-state machine (untagged | tagging | error | tagged) sharing imgAnnotations / imgTagLoading / imgTagErrors state by key.
    const renderTaggableImage = (
        imgSrc: string,
        tagKey: string,
        opts: { altText: string; downloadIndex: number; onFullscreen?: () => void; allowUpscale?: boolean; allowSheetExport?: boolean; allowCanvasEdit?: boolean; tagMode?: 'scene' | 'materialBoard' | 'furniture'; }
    ) => {
        const tagged = imgAnnotations[tagKey];
        const tagging = imgTagLoading[tagKey];
        const tagError = imgTagErrors[tagKey];
        const upscaled = imgUpscaled[tagKey];
        const upscaling = imgUpscaling[tagKey];
        const effectiveSrc = upscaled || imgSrc;
        const mode = opts.tagMode || 'scene';
        return (
            <div style={{ position: 'relative', borderRadius: 8, border: '1px solid var(--bdr)', overflow: tagged ? 'visible' : 'hidden' }}>
                {tagged ? (
                    <div style={{ padding: '8px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 5, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#ccff00', textTransform: 'uppercase', letterSpacing: 1 }}>
                                ◩ {tagged.length} tags{upscaled && <span style={{ marginLeft: 6, color: '#a78bfa' }}>· 4K</span>}
                            </span>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => tagImage(effectiveSrc, tagKey, mode)} disabled={tagging}>↻ Re-tag</button>
                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => { saveScroll(); setImgAnnotations(prev => { const n = { ...prev }; delete n[tagKey]; return n; }); }}>Remove tags</button>
                                {opts.allowUpscale && !upscaled && (
                                    <button
                                        className="vw-btn vw-btn-sm"
                                        style={{ fontSize: 9, borderColor: '#a78bfa', color: '#a78bfa', fontWeight: 600 }}
                                        onClick={() => upscaleImage(imgSrc, tagKey)}
                                        disabled={upscaling}
                                        title="Upscale to 4K via Nano Banana — sharpens detail, preserves composition"
                                    >
                                        {upscaling ? 'Upscaling…' : '↑ 4K'}
                                    </button>
                                )}
                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => handleExport(effectiveSrc, opts.downloadIndex, tagged)} title="Download tagged image">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                </button>
                                {opts.allowCanvasEdit && (
                                    <button
                                        className="vw-btn vw-btn-sm"
                                        style={{ fontSize: 9, borderColor: '#c084fc', color: '#c084fc', fontWeight: 600 }}
                                        onClick={() => setCanvasEditor({ src: effectiveSrc, title: opts.altText })}
                                        title="Split this board into pieces and rearrange them on an editable canvas"
                                    >
                                        ✂ Edit in Canvas
                                    </button>
                                )}
                                {opts.allowSheetExport && (
                                    <button
                                        className="vw-btn vw-btn-sm"
                                        style={{ fontSize: 9, borderColor: '#34a853', color: '#34a853', fontWeight: 600 }}
                                        onClick={() => exportTagsToSheets(tagged, tagKey)}
                                        disabled={sheetExporting[tagKey]}
                                        title={accessToken ? 'Build a DWP material schedule from these tags and open it as a formatted Google Sheet' : 'Sign in with Google to export tags to Sheets'}
                                    >
                                        {sheetExporting[tagKey] ? '⊞ Exporting…' : '⊞ Export to Sheets'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <AnnotatedRender
                                imageData={effectiveSrc}
                                annotations={tagged}
                                onUpdateAnnotation={(id, x, y) => setImgAnnotations(prev => ({ ...prev, [tagKey]: prev[tagKey].map(a => a.id === id ? { ...a, x, y } : a) }))}
                                onEditAnnotation={(id, code, note) => setImgAnnotations(prev => ({ ...prev, [tagKey]: prev[tagKey].map(a => a.id === id ? { ...a, code, note } : a) }))}
                                onDeleteAnnotation={(id) => setImgAnnotations(prev => ({ ...prev, [tagKey]: prev[tagKey].filter(a => a.id !== id) }))}
                                onAddAnnotation={(code, x, y, note) => setImgAnnotations(prev => ({ ...prev, [tagKey]: [...prev[tagKey], { id: Math.random().toString(36).substring(2, 11), code, x, y, note }] }))}
                                onFullscreen={opts.onFullscreen}
                            />
                            {upscaling && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8 }}>
                                    <div style={{ fontSize: 22, color: '#a78bfa' }}>↑</div>
                                    <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600 }}>Upscaling to 4K…</div>
                                    <div style={{ fontSize: 8, color: '#888' }}>~10–20s</div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <img
                            src={effectiveSrc}
                            alt={opts.altText}
                            style={{ width: '100%', height: 'auto', display: 'block', cursor: opts.onFullscreen ? 'pointer' : 'default' }}
                            onClick={opts.onFullscreen}
                        />
                        {tagging ? (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <div style={{ fontSize: 20, color: '#ccff00' }}>◩</div>
                                <div style={{ fontSize: 10, color: '#ccff00', fontWeight: 600 }}>Tagging…</div>
                            </div>
                        ) : upscaling ? (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <div style={{ fontSize: 22, color: '#a78bfa' }}>↑</div>
                                <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600 }}>Upscaling to 4K…</div>
                                <div style={{ fontSize: 8, color: '#888' }}>~10–20s</div>
                            </div>
                        ) : tagError ? (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, overflow: 'auto' }}>
                                <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>Tag failed</div>
                                <div style={{ fontSize: 9, color: '#ccc', textAlign: 'center', maxWidth: '90%', wordBreak: 'break-word', lineHeight: 1.4 }}>{tagError}</div>
                                <button className="vw-btn vw-btn-sm" style={{ borderColor: '#ccff00', color: '#ccff00', fontSize: 9 }} onClick={() => tagImage(effectiveSrc, tagKey, mode)}>↻ Retry</button>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => handleExport(effectiveSrc, opts.downloadIndex)}
                                    className="vw-btn vw-btn-p vw-btn-sm"
                                    style={{ position: 'absolute', bottom: 8, right: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: 'rgba(255,255,255,0.1)' }}
                                    title="Download Image"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                </button>
                                <button
                                    onClick={() => tagImage(effectiveSrc, tagKey, mode)}
                                    className="vw-btn vw-btn-sm"
                                    style={{ position: 'absolute', bottom: 8, left: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: '#ccff00', color: '#ccff00', fontWeight: 700, fontSize: 10 }}
                                    title="Tag materials & furniture"
                                >
                                    ◩ Tag
                                </button>
                                {opts.allowCanvasEdit && (
                                    <button
                                        onClick={() => setCanvasEditor({ src: effectiveSrc, title: opts.altText })}
                                        className="vw-btn vw-btn-sm"
                                        style={{ position: 'absolute', top: 8, left: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: '#c084fc', color: '#c084fc', fontWeight: 700, fontSize: 10 }}
                                        title="Split this board into pieces and rearrange them on an editable canvas"
                                    >
                                        ✂ Canvas
                                    </button>
                                )}
                                {opts.allowUpscale && !upscaled && (
                                    <button
                                        onClick={() => upscaleImage(imgSrc, tagKey)}
                                        className="vw-btn vw-btn-sm"
                                        style={{ position: 'absolute', top: 8, right: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: '#a78bfa', color: '#a78bfa', fontWeight: 700, fontSize: 10 }}
                                        title="Upscale to 4K (sharpens detail, preserves composition)"
                                    >
                                        ↑ 4K
                                    </button>
                                )}
                                {upscaled && (
                                    <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 7px', background: 'rgba(167,139,250,0.85)', color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>4K</span>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        );
    };

    const analyzeFurniture = async (r: PGResult) => {
        if (!r.imageData || furnitureAnalyzing[r.id]) return;
        saveScroll();
        setFurnitureAnalyzing(prev => ({ ...prev, [r.id]: true }));
        setFurnitureLists(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setFurnitureGenImages(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setFurnitureGenErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setShowFurnitureGenOptions(prev => ({ ...prev, [r.id]: false }));
        try {
            const res = await fetch("/api/gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "Analyze this interior design image and identify ALL furniture pieces and furnishings visible. For each item provide: name, style description, material/finish, and color. Always include material/finish keywords in each item line so matching furniture can share the same material words. Format as a numbered list - one item per line.",
                    systemPrompt: "You are an expert interior designer and furniture analyst. Identify all furniture and furnishings in the image precisely. Reuse the same material/finish keyword for items that visibly share the same material. Be concise - one line per item. Output a plain numbered list only.",
                    imageData: r.imageData
                }),
            });
            const data = await res.json();
            const text: string = data.response || data.text || '';
            const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
            saveScroll();
            setFurnitureLists(prev => ({ ...prev, [r.id]: lines.length > 0 ? lines : ['No furniture detected — try a clearer image'] }));
        } catch {
            saveScroll();
            setFurnitureLists(prev => ({ ...prev, [r.id]: ['Analysis failed — please try again'] }));
        }
        saveScroll();
        setFurnitureAnalyzing(prev => ({ ...prev, [r.id]: false }));
    };

    const clearFurnitureGenerated = (resultId: string) => {
        setFurnitureGenImages(prev => { const n = { ...prev }; delete n[resultId]; return n; });
        setFurnitureGenErrors(prev => { const n = { ...prev }; delete n[resultId]; return n; });
        setShowFurnitureGenOptions(prev => ({ ...prev, [resultId]: false }));
    };

    const updateFurnitureItem = (resultId: string, index: number, value: string) => {
        saveScroll();
        setFurnitureLists(prev => ({
            ...prev,
            [resultId]: (prev[resultId] || []).map((item, i) => i === index ? value : item),
        }));
        clearFurnitureGenerated(resultId);
    };

    const addFurnitureItem = (resultId: string) => {
        saveScroll();
        setFurnitureLists(prev => ({
            ...prev,
            [resultId]: [...(prev[resultId] || []), 'New furniture item'],
        }));
        clearFurnitureGenerated(resultId);
    };

    const removeFurnitureItem = (resultId: string, index: number) => {
        saveScroll();
        setFurnitureLists(prev => ({
            ...prev,
            [resultId]: (prev[resultId] || []).filter((_, i) => i !== index),
        }));
        clearFurnitureGenerated(resultId);
    };

    const getFurnitureGenerationItems = (resultId: string) => {
        return (furnitureLists[resultId] || [])
            .map(item => item.replace(/^\d+[\.\)]\s*/, '').trim())
            .filter(Boolean);
    };

    // Generate one image per detected furniture item.
    // When `model === 'nano-banana'` and r.imageData is available, uses Nano Banana edit-mode
    // (sends the reference image as input) so each item is rendered in the reference's style.
    // Imagen 4 has no image-conditioning so it falls back to text-only product-photo generation.
    const generateFurnitureScene = async (r: PGResult, model: 'imagen-4' | 'nano-banana') => {
        const list = getFurnitureGenerationItems(r.id);
        if (!list || list.length === 0) return;
        saveScroll();
        setFurnitureGenLoading(prev => ({ ...prev, [r.id]: true }));
        setFurnitureGenErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setFurnitureGenImages(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setShowFurnitureGenOptions(prev => ({ ...prev, [r.id]: false }));

        const useEditMode = model === 'nano-banana' && !!r.imageData;
        const accumulated: string[] = [];

        try {
            // Sequential to stay under rate limits and let images stream in as they arrive
            for (let i = 0; i < list.length; i++) {
                const cleanItem = list[i];
                const prompt = useEditMode
                    ? `Take the supplied reference interior image and produce a focused, photorealistic isolated render of this single furniture piece exactly as it appears in the reference: "${cleanItem}". Match the reference's lighting, materials, color palette, and finish. Plain neutral studio background. Single piece only — no other furniture, no room, no props. 8K resolution, editorial product photography. No text, no numbers, no labels.`
                    : `Photorealistic isolated product photograph of a single piece of interior furniture: "${cleanItem}". Plain neutral studio background, soft even lighting, editorial styling, 8K resolution, no text, no labels, no other objects, single piece only.`;
                const res = await fetch("/api/imagen", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt,
                        targetModel: model,
                        singleImage: true,
                        ...(useEditMode ? { imageData: r.imageData } : {}),
                    }),
                });
                const data = await res.json();
                if (!res.ok) {
                    console.warn(`[generateFurnitureScene] item ${i} failed:`, data.error);
                    continue;
                }
                const newImages: string[] = data.images || (data.image ? [data.image] : []);
                accumulated.push(...newImages);
                // Push partial progress to UI so user sees images appearing one by one
                saveScroll();
                setFurnitureGenImages(prev => ({ ...prev, [r.id]: [...accumulated] }));
            }
            if (accumulated.length === 0) throw new Error('No items could be generated');
        } catch (err: any) {
            saveScroll();
            setFurnitureGenErrors(prev => ({ ...prev, [r.id]: err.message }));
        }
        saveScroll();
        setFurnitureGenLoading(prev => ({ ...prev, [r.id]: false }));
    };

    const analyzeMaterialBoardReference = async (imageSrc: string) => {
        const res = await fetch("/api/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: MATERIAL_BOARD_REFERENCE_ANALYSIS_PROMPT,
                systemPrompt: MATERIAL_BOARD_REFERENCE_ANALYSIS_SYSTEM,
                imageData: imageSrc,
            }),
        });
        const result = await res.json();
        if (!res.ok || result.error) {
            throw new Error(result.error || "Reference analysis failed");
        }
        return (result.response || result.text || null) as string | null;
    };

    const getMaterialBoardReference = (r: PGResult): { imageData: string | null; source: MBReferenceSource; analysis: string | null; label: string } => {
        if (mbRefImage) {
            return { imageData: mbRefImage, source: "override", analysis: mbRefAnalysis, label: "override reference" };
        }
        if (r.mode === "image" && r.imageData) {
            return { imageData: r.imageData, source: "main", analysis: null, label: "main uploaded image" };
        }
        return { imageData: null, source: null, analysis: null, label: "no reference" };
    };

    const handleMbRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        setMbRefFile(f.name);
        setMbRefAnalysis(null);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const raw = ev.target?.result as string;
            const data = await compressImage(raw);
            setMbRefImage(data);
            setMbRefAnalyzing(true);
            try {
                setMbRefAnalysis(await analyzeMaterialBoardReference(data));
            } catch {
                setMbRefAnalysis(null);
            }
            setMbRefAnalyzing(false);
        };
        reader.readAsDataURL(f);
        if (mbRefInputRef.current) mbRefInputRef.current.value = '';
    };

    const callLLM = async (endpoint: string, prompt: string, systemPrompt: string, pdfStoragePaths?: { name: string, path: string }[], imageData?: string | null) => {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, systemPrompt, pdfStoragePaths, ...(imageData ? { imageData } : {}) }),
        });

        if (!res.ok) {
            let errorMsg = `Error ${res.status}: ${res.statusText}`;
            try {
                const text = await res.text();
                try {
                    const data = JSON.parse(text);
                    if (data.error) errorMsg = data.error;
                } catch {
                    // Not valid JSON, probably an HTML error page (e.g. from Cloud Run)
                    if (res.status === 504) {
                        errorMsg = "Gateway Timeout (504): The request took too long. Try fewer PDFs or a shorter prompt.";
                    } else if (text) {
                        // Include a clean snippet of the text response if possible
                        errorMsg += ` - ${text.substring(0, 100).replace(/<[^>]*>?/gm, '').trim()}`;
                    }
                }
            } catch (e) {
                // Ignore text reading errors
            }
            throw new Error(errorMsg);
        }

        const data = await res.json();
        return data.response || data.text || (data.error ? `Error: ${data.error}` : "No response received.");
    };

    const getSystemBase = (toolsStr: string) => `You are a prompt engineering expert for architectural visualization at dwp | design worldwide partnership. Generate optimised prompts for these tools: ${toolsStr}. Project: ${proj.name} (${proj.sector}, ${proj.phase}). Format each tool's prompt clearly with headers.

IMPORTANT: After all tool-specific prompts, you MUST include a final dedicated section titled exactly "## Material Board" at the end of your output. This section must follow the dwp material concept board format:

1. **Material Inventory** — List every key material identified from the brief, reference documents, and/or reference image. For each material include:
   - Material name in CAPS (e.g. FLUTED GOLDEN TEAK, WHITE MACAUBAS QUARTZITE, BRUSHED BRASS)
   - Finish type (e.g. honed, polished, brushed, matte, lacquered, reeded)
   - Colour/tone description
   - Brand or source if known
   - Category (stone, wood, metal, fabric, glass, paint/lacquer, flooring)

2. **Material Board Image Prompt** — Write a single, detailed AI image-generation prompt for a professional dwp-style Material Concept Board image. You MUST structure the prompt exactly like the following "Composition Prompt" template, but REPLACE the specific materials (like Taupe Velvet, Teak Veneer, Carrara Marble, etc.) with the actual materials you identified in your Material Inventory.

**The Composition Prompt Structure:**
Layout Style: A high-end, top-down interior design mood board (flatlay) arranged on a neutral grey stone surface. Use a minimalist, architectural composition with a mix of rectilinear slabs and organic 3D accents.
Background Layers:
Primary Base: A large rectangular swatch of [Replace with your primary fabric/matte material] on the left, acting as a soft anchor.
Secondary Base: On the right, a vertical strip of [Replace with your secondary fabric/textured material], showing a rich texture.
Central Ground: A large square of [Replace with your primary wood/stone] placed centrally to showcase its texture.
Middle Layers (Rectilinear):
Stone Accents: A long, slender plank of [Replace with your accent stone] running vertically to lead the eye.
Wood Accents: Small samples of [Replace with your accent wood/material] placed at the top and bottom corners for balance.
Wallcovering: A clean rectangle of [Replace with your wallcovering/silk] overlapping the central ground.
Foreground Elements (3D & Metallic):
Hardware: A cylindrical rod and a circular knob made of [Replace with your metal/hardware] to provide high-contrast focal points.
Sculptural Shapes: A smooth [Replace with material] sphere and a small sprig of dried eucalyptus to break up the rigid geometry.
Lighting & Atmosphere:
Lighting: Soft, directional studio lighting from the top-left, casting gentle shadows to emphasize the textures.
Mood: Sophisticated, tactile, and grounded, blending organic earth tones with cool, luxurious materials.
Key Design Principles Used:
Rule of Thirds: The "heavy" textures are placed on the outer thirds, while the "detailed" materials occupy the center.
Material Contrast: Pairing rough textures against smooth finishes.
Verticality: Using slatted/linear materials and long planks to make the composition feel taller and "architectural."

3. Keep this section focused purely on materials and finishes — no spatial composition or architectural rendering.`;

    const generate = async () => {
        if (loading) return;
        if (mode === "image" && !imageData) return; // Can't generate without an actual image
        const inputText = mode === "brief" ? briefInput : mode === "image" ? `[Image: ${imageFile}]` : customCtx;
        if (!inputText.trim() && mode !== "image") return;
        setLoading(true);
        const endpoint = llmProvider === "claude" ? "/api/claude" : llmProvider === "gpt" ? "/api/gpt" : "/api/gemini";

        const pdfContextString = pdfContext.map(s => `***${s.sectionName}***\n${s.text}`).join('\n\n');
        const systemBase = getSystemBase(targetTools.join(", "));

        const system = pdfContextString
            ? `${systemBase}\n\nSystem Instructions:\n- You must CAREFULLY read and cross-reference ALL of the provided reference documents.\n- Perform a comprehensive analysis based on the design brief.\n- Create tailored prompts based on the spaces, materials, and constraints described.\n- VERY IMPORTANT: You MUST explicitly include the actual material names, finishes, and brands found in the reference documents in your final generated prompts.\n- Include the actual section name in the generated output to specify the space.\n- Rely heavily on the provided context for materials, lighting, and layout details.`
            : systemBase;

        const contextBlock = pdfContextString ? `\n\n### attached Reference Documentation\n${pdfContextString}\n\n` : "";

        const userMsg = mode === "brief"
            ? `Design Brief:\n${briefInput}${contextBlock}\nGenerate optimised prompts for: ${targetTools.join(", ")}`
            : mode === "image"
                ? `Analyse this reference image and generate prompts for: ${targetTools.join(", ")}.\nContext: ${customCtx || "Analyse architecture, materials, lighting, and atmosphere."}${contextBlock}`
                : `Context: ${customCtx}${contextBlock}\nGenerate prompts for: ${targetTools.join(", ")}`;

        const pdfStoragePaths: { name: string, path: string }[] = [];
        pdfContext.forEach(ctx => {
            if (ctx.pdfs) {
                ctx.pdfs.forEach(p => {
                    if (p.storagePath && !pdfStoragePaths.find(x => x.path === p.storagePath)) {
                        pdfStoragePaths.push({ name: p.name, path: p.storagePath });
                    }
                });
            }
        });

        try {
            const content = await callLLM(endpoint, userMsg, system, pdfStoragePaths, mode === "image" ? imageData : null);
            const id = Math.random().toString(36).substring(2, 11);
            setResults(prev => [{ id, mode, input: inputText.slice(0, 60), tools: targetTools.join(", "), content, llm: llmProvider, imageData: mode === "image" ? imageData : null, feedback: null }, ...prev]);
        } catch (error: any) {
            const errorMsg = error.message || "Error connecting to API.";
            setResults(prev => [{ id: Math.random().toString(36).substring(2, 11), mode, input: inputText.slice(0, 60), tools: targetTools.join(", "), content: errorMsg, llm: llmProvider, imageData: mode === "image" ? imageData : null, feedback: null }, ...prev]);
        }
        setLoading(false);
    };

    const handleFeedback = (id: string, feedback: "good" | "retry") => {
        setResults(prev => prev.map(r => r.id === id ? { ...r, feedback } : r));
    };

    const handleRetry = async (r: PGResult) => {
        const hint = retryHints[r.id] || "";
        const endpoint = r.llm === "claude" ? "/api/claude" : r.llm === "gpt" ? "/api/gpt" : "/api/gemini";

        const pdfContextString = pdfContext.map(s => `***${s.sectionName}***\n${s.text}`).join('\n\n');
        const systemBase = getSystemBase(r.tools);

        const system = pdfContextString
            ? `${systemBase}\n\nSystem Instructions:\n- You must CAREFULLY read and cross-reference ALL of the provided reference documents.\n- Perform a comprehensive analysis based on the design brief.\n- Create tailored prompts based on the spaces, materials, and constraints described.\n- VERY IMPORTANT: You MUST explicitly include the actual material names, finishes, and brands found in the reference documents in your final generated prompts.\n- Include the actual section name in the generated output to specify the space.\n- Rely heavily on the provided context for materials, lighting, and layout details.`
            : systemBase;

        const hintNote = hint.trim()
            ? `The user's specific improvement request: "${hint.trim()}".`
            : "No specific hint provided — use your best judgment to self-improve.";
        const retryPrompt = `The previous generated prompt output was not satisfactory. Please rewrite it to be more specific, better structured, more contextually accurate for architectural visualization, and more optimised for direct use in AI image/render tools.\n\n${hintNote}\n\nPrevious output:\n${r.content}\n\nNow produce an improved version for: ${r.tools}`;

        const pdfStoragePaths: { name: string, path: string }[] = [];
        pdfContext.forEach(ctx => {
            if (ctx.pdfs) {
                ctx.pdfs.forEach(p => {
                    if (p.storagePath && !pdfStoragePaths.find(x => x.path === p.storagePath)) {
                        pdfStoragePaths.push({ name: p.name, path: p.storagePath });
                    }
                });
            }
        });

        // Mark as retrying
        setResults(prev => prev.map(x => x.id === r.id ? { ...x, retrying: true, feedback: null } : x));
        try {
            const content = await callLLM(endpoint, retryPrompt, system, pdfStoragePaths);
            setResults(prev => prev.map(x => x.id === r.id ? { ...x, content, retrying: false, feedback: null, retryHint: hint } : x));
        } catch (error: any) {
            const errorMsg = error.message || "Error during retry.";
            setResults(prev => prev.map(x => x.id === r.id ? { ...x, content: errorMsg, retrying: false } : x));
        }
        // Clear the hint input for this card
        setRetryHints(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    };

    // Extract the Material Board section from a result's content
    const extractMaterialBoard = (content: string): string | null => {
        // Match "## Material Board" header and everything after it until the next ## header or end of string
        const regex = /##\s*Material\s*Board[\s\S]*?(?=\n##\s|$)/i;
        const match = content.match(regex);
        return match ? match[0].trim() : null;
    };

    // Extract only the material inventory list — strips the embedded "Material Board Image Prompt"
    // subsection so its composition instructions don't conflict with the style template prompts
    const extractMaterialInventory = (content: string): string | null => {
        const mbSection = extractMaterialBoard(content);
        if (!mbSection) return null;
        const stripped = mbSection.replace(/#{1,3}\s*Material Board Image Prompt[\s\S]*/i, '').trim();
        return stripped.length > 20 ? stripped : mbSection;
    };

    const generateImage = async (r: PGResult, targetModel: 'imagen-4' | 'nano-banana') => {
        saveScroll();
        setImageLoading(prev => ({ ...prev, [r.id]: true }));
        setImageErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setShowImageOptions(prev => ({ ...prev, [r.id]: false }));

        // For normal scene generation, strip out the Material Board section so it doesn't interfere
        const mbSection = extractMaterialBoard(r.content);
        const scenePrompt = mbSection ? r.content.replace(mbSection, '').trim() : r.content;

        try {
            const res = await fetch("/api/imagen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: scenePrompt, targetModel }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to generate image.");
            }

            saveScroll();
            setGeneratedImages(prev => ({ ...prev, [r.id]: data.images || [data.image] }));
        } catch (err: any) {
            saveScroll();
            setImageErrors(prev => ({ ...prev, [r.id]: err.message }));
        } finally {
            saveScroll();
            setImageLoading(prev => ({ ...prev, [r.id]: false }));
        }
    };

    const MB_NO_TEXT_RULES = "Absolute no-text rule: no readable text anywhere in the image. Do not create title cards, project-name cards, specification headers, collection headers, material legends, numbered lists, detail lists, labels, codes, callouts, captions, UI markers, typography, blank label cards, or engraved plates. Use material names only to choose the appearance of physical swatches; never print those names in the image.";

    // 5 distinct material board style variations inspired by real-world mood board photography
    const MATERIAL_BOARD_STYLES = [
        {
            name: 'Classic Flat-Lay',
            prompt: (projName: string, mbSection: string) =>
                `Professional architectural interior design material board presentation on a clean white background. An asymmetrical collage composition featuring overlapping geometric material swatches — primarily vertical rectangles and squares — arranged in a structured flat lay. Include one organic, rounded paint-blob swatch and a separate circular flooring/rug material swatch, but keep both fully visible. Reserve a blank lower-right foreground display bay on the plain background for furniture; this bay is NOT a material swatch. ${MB_NO_TEXT_RULES} Seamlessly integrate only two photorealistic 3D interior elements inside the blank display bay: one sculptural lounge chair and one styled potted plant/tree or botanical accent. Do not add beds, tables, lamps, stools, ottomans, mirrors, bags, vases, extra chairs, or extra decor. Keep every material sample completely readable and unobstructed; furniture must not overlap any stone, wood, fabric, metal, glass, paint, tile, or circular rug swatch. Leave clear negative space between furniture and all swatches. Soft, diffused studio lighting with no harsh shadows, hyper-realistic textures, clean editorial lines, elegant layout, 8K resolution, photorealistic.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
        },
        {
            name: 'Dark Moody',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of a luxurious interior material sample board on a dark charcoal slate stone surface. Material samples arranged in an overlapping organic composition. Include: polished stone slab cuts, dark stained timber veneer samples, brushed brass and black matte metal hardware, richly textured woven fabric swatches in deep tones, tinted glass pieces, and satin lacquer chips. A dried botanical stem and a small metallic sphere placed as styling props. ${MB_NO_TEXT_RULES} Moody studio lighting with dramatic side light, rich shadows, editorial luxury interiors magazine style. Deep, warm atmosphere, 8K resolution, shot from directly above. Real physical samples only — no digital overlays, no colour wheels, no collages.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
        },
        {
            name: 'Industrial Refined',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of an Industrial Refined interior material sample board. Physical material samples arranged in a structured grid composition on a raw polished concrete surface. Include: honed concrete and basalt slab samples, blackened oak and smoked walnut wood veneer, brushed gunmetal and aged blackened steel hardware, heavyweight wool and leather fabric swatches in charcoal, rust, and oxblood tones, smoked and reeded glass pieces, and matte powder-coat colour chips. Styling accents include a small machined brass cog, an unfinished copper pipe section, and a single dark dried botanical stem. ${MB_NO_TEXT_RULES} Crisp directional studio lighting with controlled shadows, masculine editorial luxury style. Refined, architectural, urban-loft atmosphere, 8K resolution, overhead camera. Only real physical material samples — no digital elements, no abstract circles, no Pinterest-style collage.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
        },
        {
            name: 'Minimalist Nordic',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of a Scandinavian minimalist interior material sample board. Material samples arranged with generous negative space on a pure white matte surface. Include: pale grey stone slab cuts, light ash and birch wood veneer samples, matte black steel and brushed aluminium hardware, undyed raw linen and bouclé fabric swatches, clear and frosted glass samples, and chalk-finish paint colour chips in muted pastels. A single eucalyptus stem as minimal decoration. ${MB_NO_TEXT_RULES} Clean, bright, diffused studio lighting with almost no shadows, ultra-minimal composition. Crisp Nordic aesthetic, 8K resolution, directly overhead. Real physical material swatches only — no graphics, no digital palettes.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
        },
        {
            name: 'Terrazzo Eclectic',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of an eclectic interior material sample board. Material samples arranged in a dynamic layered composition on a white terrazzo surface with subtle coloured chips. Include: veined marble and quartzite slab cuts, rich walnut and teak wood veneer samples, antique brass and rose gold metal hardware pieces, velvet and bouclé fabric swatches in jewel tones, coloured art glass samples, and high-gloss lacquer chips. Styling accents include a small dried flower arrangement, a round stone pebble, and a ceramic tile sample. ${MB_NO_TEXT_RULES} Warm directional studio lighting, artistic composition with overlapping materials at varied angles, luxury residential design magazine style. Rich, curated, eclectic warmth, 8K resolution, overhead shot. Physical material samples only — no digital effects, no abstract shapes.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
        }
    ];

    // Two-pass flow (Pass 1): the Classic Flat-Lay empty board. Pass 2 composites
    // the uploaded/reference chair and plant into that board's reserved display bay.
    const buildEmptyBoardStyles = (): { name: string, prompt: (projName: string, mbSection: string) => string, extra: string }[] => {
        const noFurnitureRules = `IMPORTANT: ${MB_NO_TEXT_RULES} Keep all material swatches completely visible and unobstructed. Reserve a clearly blank lower-right foreground display bay on the plain background; this bay is NOT a material swatch and is the only place where furniture will be added later. Keep the major stone, wood, fabric, metal, glass, paint, tile, and circular flooring/rug swatches outside that blank bay, mostly in the upper, left, and center areas. Leave the blank display bay EMPTY - do NOT add any chair, sofa, bed, bench, stool, table, lamp, sconce, plant, vase, sculpture, standing decor, or any other 3D furniture/decor object. Generate ONLY the flat material samples, separate visible circular rug/flooring swatch, paint/finish swatches, blank display bay, and clean background.`;
        const themes = [
            {
                name: 'Classic Flat-Lay',
                extra: 'Clean white architectural editorial style with an asymmetric structured collage and soft diffused lighting.',
                prompt: (projName: string, mbSection: string) =>
                    `Professional architectural interior design material board presentation on a clean white background. An asymmetrical collage composition featuring overlapping geometric material swatches - primarily vertical rectangles and squares - arranged in a structured flat lay. Include one organic, rounded paint-blob swatch and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nSoft, diffused studio lighting with no harsh shadows, hyper-realistic textures, clean editorial lines, elegant layout, 8K resolution, photorealistic.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
            },
            {
                name: 'Dark Moody',
                extra: 'Dark charcoal slate surface, luxurious moody lighting, rich shadows, and warm metallic accents.',
                prompt: (projName: string, mbSection: string) =>
                    `Professional top-down flat-lay photograph of a luxurious interior material sample board on a dark charcoal slate stone surface. Material samples arranged in an overlapping organic composition, with polished stone slab cuts, dark stained timber veneer samples, brushed brass and black matte metal samples, richly textured woven fabric swatches in deep tones, tinted glass pieces, satin lacquer chips, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nMoody studio lighting with dramatic side light, rich shadows, editorial luxury interiors magazine style, 8K resolution, shot from directly above. Real physical samples only - no digital overlays, no colour wheels, no collages.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
            },
            {
                name: 'Industrial Refined',
                extra: 'Raw polished concrete base, structured grid composition, dark metals, smoked timber, and crisp directional light.',
                prompt: (projName: string, mbSection: string) =>
                    `Professional top-down flat-lay photograph of an Industrial Refined interior material sample board on a raw polished concrete surface. Physical material samples arranged in a structured grid composition, with honed concrete and basalt slab samples, blackened oak and smoked walnut wood veneer, brushed gunmetal and aged blackened steel samples, heavyweight wool and leather fabric swatches, smoked and reeded glass pieces, matte powder-coat colour chips, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nCrisp directional studio lighting with controlled shadows, refined urban-loft atmosphere, 8K resolution, overhead camera. Real physical samples only - no digital elements, no abstract circles, no Pinterest-style collage.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
            },
            {
                name: 'Minimalist Nordic',
                extra: 'Pure white matte surface, generous negative space, pale materials, and bright diffused studio lighting.',
                prompt: (projName: string, mbSection: string) =>
                    `Professional top-down flat-lay photograph of a Scandinavian minimalist interior material sample board on a pure white matte surface. Material samples arranged with generous negative space, including pale grey stone slab cuts, light ash and birch wood veneer samples, matte black steel and brushed aluminium samples, undyed raw linen and boucle fabric swatches, clear and frosted glass samples, chalk-finish paint colour chips in muted pastels, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nClean, bright, diffused studio lighting with almost no shadows, crisp Nordic aesthetic, 8K resolution, directly overhead. Real physical material swatches only - no graphics, no digital palettes.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
            },
            {
                name: 'Terrazzo Eclectic',
                extra: 'White terrazzo surface, dynamic layered composition, rich woods, jewel-tone fabrics, and warm editorial light.',
                prompt: (projName: string, mbSection: string) =>
                    `Professional top-down flat-lay photograph of an eclectic interior material sample board on a white terrazzo surface with subtle coloured chips. Material samples arranged in a dynamic layered composition, with veined marble and quartzite slab cuts, rich walnut and teak wood veneer samples, antique brass and rose gold metal samples, velvet and boucle fabric swatches in jewel tones, coloured art glass samples, high-gloss lacquer chips, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nWarm directional studio lighting, artistic composition with overlapping materials at varied angles, luxury residential magazine style, 8K resolution, overhead shot. Physical material samples only - no digital effects, no abstract graphics.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
            },
        ];
        return themes;
    };

    // Two-pass flow (Pass 2): prompt to composite the actual furniture out of the
    // user's reference image onto the empty board from Pass 1. Kept focused on the
    // CHAIR as the primary object since it's the most identifiable piece — and inject
    // Gemini's specific furniture analysis so the model has detailed descriptors to anchor on.
    const buildCompositePrompt = (analysis: string, _projName: string, _variationExtra: string) =>
        `Combine these two images.

IMAGE 1 = an empty flat-lay material board with material swatches, a separate visible circular rug/flooring swatch, a blank lower-right foreground display bay, clean background, and NO text or labels.
IMAGE 2 = the SOURCE for only TWO possible foreground objects: one primary chair/seating piece and one primary plant/tree/botanical accent. These are the only objects to copy — not inspiration, not a vibe.

═══ CHAIR IS THE HIGHEST PRIORITY ═══
There is a CHAIR in IMAGE 2. You must reproduce THAT chair exactly — its full silhouette from top to bottom (any hood / wing / back curve), its proportions, its upholstery material and texture, its colour, its base, its legs (or absence of legs). Do NOT output a generic curvy boucle lounge chair. Do NOT output a fan-shaped chair. Match the chair from IMAGE 2 specifically. Look at it.

═══ PLANT / TREE IS THE ONLY SECONDARY OBJECT ═══
If IMAGE 2 contains a plant, tree, or botanical accent, reproduce only the most prominent one. Match its leaf shape, density, scale, pot/planter if visible, colour, and pose. If no plant/tree is visible, do not invent one.

═══ OBJECT INVENTORY (from IMAGE 2) — use these descriptions together with the image itself ═══
${analysis}

═══ TASK ═══
Take IMAGE 1. Place only the primary chair/seating piece and the single primary plant/tree from IMAGE 2 inside IMAGE 1's blank lower-right foreground display bay. Do NOT place them on the circular rug/flooring swatch or on top of any material sample. Keep them compact and leave all material swatches fully visible.

Output rules:
- Output no more than TWO foreground objects total: one chair/seating piece and one plant/tree.
- Copy those selected objects from IMAGE 2 by silhouette + material + colour + proportions. No generic substitutes.
- Do NOT copy or add beds, tables, lamps, sconces, stools, ottomans, benches, mirrors, bags, vases, sculptures, accessories, extra chairs, or extra decor.
- ${MB_NO_TEXT_RULES}
- If IMAGE 1 contains any accidental text, title card, legend, specification heading, collection heading, material list, number, or code, erase it and replace it with the same clean background surface.
- Keep IMAGE 1's material swatches, paint blob, circular rug/flooring swatch, blank display bay, and clean background intact.
- Scale the chair and plant/tree smaller if needed so material swatches remain readable.
- Zero overlap with material samples: do not cover any stone, wood, fabric, metal, glass, paint, tile, or circular rug/flooring swatch.
- If the chair/tree would overlap a material swatch, shrink them and move them farther into the blank display bay.
- Leave visible negative space between the chair/tree and every material sample.
- Background stays clean and neutral — no walls, no room scene, no carpeted floor.
- Soft diffused light, subtle contact shadows only.`;

    // When user uploads a reference, build 5 variations based on that reference style
    const buildRefStyles = (analysis: string): { name: string, prompt: (projName: string, mbSection: string) => string }[] => {
        const variations = [
            { name: 'Reference · Variation A', extra: 'Arrange the material samples in a slightly different overlapping pattern while keeping the same overall aesthetic.' },
            { name: 'Reference · Variation B', extra: 'Keep the same surface and lighting but space the samples slightly further apart for a cleaner, more minimal feel.' },
            { name: 'Reference · Variation C', extra: 'Maintain the same composition style but shift the accent props to different positions. Use a slightly warmer colour temperature in the lighting.' },
            { name: 'Reference · Variation D', extra: 'Use the same layout grid but rotate some material samples at slight angles for a more dynamic, editorial feel.' },
            { name: 'Reference · Variation E', extra: 'Follow the same aesthetic but add one or two more decorative styling props (a small ceramic object, a botanical sprig) to enrich the composition.' },
        ];
        return variations.map(v => ({
            name: v.name,
            prompt: (projName: string, mbSection: string) =>
                `TASK: Edit the attached reference image into a flat-lay Material Concept Board, KEEPING ONLY THE PRIMARY CHAIR AND PRIMARY PLANT/TREE from the reference.\n\n=== STEP 1 — IDENTIFY ONLY THESE OBJECTS FROM THE ATTACHED IMAGE ===\nThe attached image may contain many furniture, lighting and decor objects. Below is an inventory focused on the selected chair and plant/tree:\n\n${analysis}\n\nNon-negotiable: output no more than TWO foreground objects total: one primary chair/seating piece and one primary plant/tree/botanical accent. Do NOT copy beds, tables, lamps, sconces, stools, ottomans, benches, mirrors, bags, vases, sculptures, accessories, extra chairs, or extra decor. If the reference shows a specific curved chair with specific legs and upholstery, output THAT chair. If the reference shows a specific plant/tree, output THAT plant/tree. Treat the reference image as the source of TRUTH only for these two selected objects.\n\n=== STEP 2 — PLACE ONLY THOSE TWO OBJECTS INTO THIS FLAT-LAY LAYOUT ===\nLift the identified chair and plant/tree out of the reference and arrange them as compact 3D foreground objects on a flat-lay Material Concept Board with these characteristics:\n• Clean white / light neutral background, professional architectural editorial style, top-down camera with slight perspective allowed for the two 3D objects.\n• Asymmetrical collage of overlapping geometric material swatches — primarily vertical rectangles and squares — laid flat in the upper, left, and center board area.\n• One organic, rounded paint-blob swatch and one separate circular flooring/rug material swatch, both fully visible.\n• A blank lower-right foreground display bay on the plain background, separate from the material swatches.\n• ${MB_NO_TEXT_RULES}\n• Chair and plant/tree must sit inside the blank display bay, not on top of any material swatch or circular rug swatch.\n• Keep every material sample fully visible; there should be zero overlap between the chair/tree and the stone, wood, fabric, metal, glass, paint, tile, or circular rug swatches.\n• Soft, diffused studio lighting with NO harsh shadows. Hyper-realistic textures.\n\n=== STEP 3 — REPLACE THE FLAT 2D SWATCHES WITH THESE MATERIALS ===\nThe ONLY thing that may differ from the reference is which materials appear on the flat 2D swatches. Use these materials for the swatches, but do not print their names or codes in the image:\n${mbSection}\n\n=== VARIATION INSTRUCTION FOR THIS BOARD ===\n${v.extra}\n\nReminder: only the chair and plant/tree should come from the reference image, and they must stay in the blank display bay without covering material samples. No title card, no legend, no list, no readable text. 8K resolution, photorealistic editorial photography.`
        }));
    };

    const generateMaterialBoardImage = async (r: PGResult, targetModel: 'imagen-4' | 'nano-banana') => {
        const mbSection = extractMaterialInventory(r.content);
        if (!mbSection) {
            saveScroll();
            setMbImageErrors(prev => ({ ...prev, [r.id]: 'No Material Board section found in the generated output.' }));
            return;
        }

        const activeReference = getMaterialBoardReference(r);

        const referenceComposite = !!(activeReference.imageData && targetModel === 'nano-banana');
        const emptyStyles = referenceComposite ? buildEmptyBoardStyles() : null;
        const stylesToUse: {
            name: string;
            prompt: (projName: string, mbSection: string) => string;
            extra?: string;
            compositeReference?: boolean;
        }[] = referenceComposite
            ? [
                {
                    name: 'Classic Flat-Lay',
                    prompt: emptyStyles![0].prompt,
                    extra: emptyStyles![0].extra,
                    compositeReference: true,
                },
                ...MATERIAL_BOARD_STYLES
                    .filter(s => s.name !== 'Classic Flat-Lay')
                    .map(s => ({ name: s.name, prompt: s.prompt })),
            ]
            : MATERIAL_BOARD_STYLES.map(s => ({ name: s.name, prompt: s.prompt }));

        saveScroll();
        setMbImageLoading(prev => ({ ...prev, [r.id]: true }));
        setMbImageProgress(prev => ({ ...prev, [r.id]: 0 }));
        setMbImageErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setShowMbImageOptions(prev => ({ ...prev, [r.id]: false }));
        setMbGeneratedImages(prev => ({ ...prev, [r.id]: [] }));

        const allImages: MBImageEntry[] = [];
        let errorOccurred: string | null = null;
        let activeReferenceAnalysis = activeReference.analysis;

        if (referenceComposite && activeReference.imageData && !activeReferenceAnalysis) {
            try {
                activeReferenceAnalysis = await analyzeMaterialBoardReference(activeReference.imageData);
            } catch (err: any) {
                console.warn('[Material Board] Reference analysis failed, relying on the image only:', err.message);
                activeReferenceAnalysis = null;
            }
        }

        for (let i = 0; i < stylesToUse.length; i++) {
            const style = stylesToUse[i];
            const mbPrompt = style.prompt(proj.name, mbSection);
            saveScroll();
            setMbImageProgress(prev => ({ ...prev, [r.id]: i + 1 }));

            try {
                // In reference mode, only Classic Flat-Lay is an empty board that Pass 2
                // fills with the uploaded chair/plant. Other themes remain final boards.
                const pass1Model = referenceComposite ? 'imagen-4' : targetModel;
                const res = await fetch("/api/imagen", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: mbPrompt,
                        targetModel: pass1Model,
                        singleImage: true,
                        // Reference conditioning happens only in Classic Flat-Lay Pass 2.
                    }),
                });
                const data = await res.json();

                if (!res.ok) {
                    console.warn(`[MB Style ${style.name}] Pass 1 failed:`, data.error);
                    allImages.push({ src: null, styleName: style.name, status: "failed", warning: data.detail || data.error || "Pass 1 board generation failed." });
                    saveScroll();
                    setMbGeneratedImages(prev => ({ ...prev, [r.id]: [...allImages] }));
                    continue;
                }

                const pass1Images = data.images || (data.image ? [data.image] : []);
                if (pass1Images.length === 0) {
                    allImages.push({ src: null, styleName: style.name, status: "failed", warning: "Pass 1 returned no board image." });
                    saveScroll();
                    setMbGeneratedImages(prev => ({ ...prev, [r.id]: [...allImages] }));
                    continue;
                }

                // Non-composite themes: pass 1 result IS the final image.
                if (!style.compositeReference) {
                    allImages.push({ src: pass1Images[0], styleName: style.name, status: "complete" });
                    saveScroll();
                    setMbGeneratedImages(prev => ({ ...prev, [r.id]: [...allImages] }));
                    continue;
                }

                // PASS 2 (two-pass mode): composite the reference image's furniture
                // onto the empty board produced by pass 1.
                const emptyBoardDataUrl = pass1Images[0]; // already data:image/jpeg;base64,...
                const compositePrompt = buildCompositePrompt(
                    activeReferenceAnalysis || '(no text analysis available - rely on IMAGE 2 visually.)',
                    proj.name,
                    style.extra || '',
                );
                const res2 = await fetch("/api/imagen", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: compositePrompt,
                        targetModel: 'nano-banana',
                        singleImage: true,
                        imageData: [emptyBoardDataUrl, activeReference.imageData!], // [IMAGE 1, IMAGE 2]
                    }),
                });
                const data2 = await res2.json();

                if (!res2.ok) {
                    console.warn(`[MB Style ${style.name}] Pass 2 failed, falling back to pass-1 result:`, data2.error);
                    allImages.push({
                        src: pass1Images[0],
                        styleName: style.name,
                        status: "empty-fallback",
                        warning: `Furniture composite failed: ${data2.detail || data2.error || "Nano Banana returned no edited image."}`,
                    });
                    saveScroll();
                    setMbGeneratedImages(prev => ({ ...prev, [r.id]: [...allImages] }));
                    continue;
                }

                const pass2Images = data2.images || (data2.image ? [data2.image] : []);
                if (pass2Images.length > 0) {
                    allImages.push({ src: pass2Images[0], styleName: style.name, status: "complete" });
                } else {
                    allImages.push({
                        src: pass1Images[0],
                        styleName: style.name,
                        status: "empty-fallback",
                        warning: "Furniture composite returned no edited image; showing the empty board.",
                    });
                }
                saveScroll();
                setMbGeneratedImages(prev => ({ ...prev, [r.id]: [...allImages] }));
            } catch (err: any) {
                console.warn(`[MB Style ${style.name}] Error:`, err.message);
                if (!errorOccurred) errorOccurred = err.message;
                allImages.push({ src: null, styleName: style.name, status: "failed", warning: err.message || "Board generation failed." });
                saveScroll();
                setMbGeneratedImages(prev => ({ ...prev, [r.id]: [...allImages] }));
            }
        }

        if (allImages.every(e => e.src === null) && errorOccurred) {
            saveScroll();
            setMbImageErrors(prev => ({ ...prev, [r.id]: errorOccurred! }));
        }

        saveScroll();
        setMbImageLoading(prev => ({ ...prev, [r.id]: false }));
        setMbImageProgress(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    };

    const handleExport = async (base64Url: string, index: number, annotations?: MaterialAnnotation[]) => {
        const hasAnnotations = !!annotations?.length;
        const filename = `PromptGen-Concept-${index + 1}${hasAnnotations ? '-tagged.png' : '.jpg'}`;
        try {
            if (hasAnnotations) {
                await exportAnnotatedImage(base64Url, annotations, filename);
                return;
            }
            triggerDownload(base64Url, filename);
        } catch (err) {
            console.warn('[handleExport] failed:', err);
            alert(hasAnnotations
                ? "Tagged export failed. The image may be blocked by browser canvas security; try downloading the original image instead."
                : "Image export failed. Please try again.");
        }
    };

    const handleSaveSnippetStart = (r: PGResult) => {
        const selection = window.getSelection()?.toString().trim();
        const textToSave = selection || r.content;
        setSnippetModal({
            isOpen: true,
            text: textToSave,
            name: "",
            type: "project",
            mode: r.mode,
            tools: r.tools,
            llm: r.llm
        });
    };

    const submitSnippet = async () => {
        if (!snippetModal.name.trim()) return alert("Please enter a name for this prompt/snippet.");

        const isProject = snippetModal.type === "project";
        const endpoint = isProject ? '/api/project-prompts' : '/api/prompt-library';

        const payload = {
            name: snippetModal.name,
            prompt: snippetModal.text,
            is_snippet: true,
            tool: snippetModal.tools,
            phase: proj.phase,
            mode: snippetModal.mode,
            llm: snippetModal.llm,
            project_name: proj.name || proj.projectId || 'Untitled',
            saved_by: user?.name || user?.email || 'Unknown',
            ...(isProject && { project_id: proj.id })
        };

        try {
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            setSnippetModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error("Error saving snippet", error);
            alert("Failed to save snippet.");
        }
    };

    const openPicker = (target: "brief" | "custom") => {
        setPickerModal({ isOpen: true, target, activeTab: "top10" });
    };

    const loadPickerEntries = useCallback(async () => {
        setPickerLoading(true);
        try {
            let endpoint = '';
            if (pickerModal.activeTab === 'top10') endpoint = '/api/prompt-library/top';
            else if (pickerModal.activeTab === 'global') endpoint = '/api/prompt-library';
            else endpoint = `/api/project-prompts?projectId=${proj.id}`;

            const res = await fetch(endpoint);
            const data = await res.json();
            setPickerEntries(data.entries || []);
        } catch {
            setPickerEntries([]);
        }
        setPickerLoading(false);
    }, [pickerModal.activeTab, proj.id]);

    useEffect(() => {
        if (pickerModal.isOpen) {
            loadPickerEntries();
        }
    }, [pickerModal.isOpen, pickerModal.activeTab, loadPickerEntries]);

    const selectPickerEntry = (promptText: string) => {
        if (pickerModal.target === "brief") {
            setBriefInput(prev => prev + (prev.trim() ? '\n\n' : '') + promptText);
        } else {
            setCustomCtx(prev => prev + (prev.trim() ? '\n\n' : '') + promptText);
        }
        setPickerModal(prev => ({ ...prev, isOpen: false }));
    };

    const logResult = (r: PGResult) => {
        // Save to local prompt log
        const log = makeFresh(proj.id, "Prompt Generator");
        log.prompt = r.content; log.phase = proj.phase;
        log.notes = `Mode: ${r.mode} | Tools: ${r.tools} | LLM: ${r.llm}`;
        log.publishTarget = 'none'; // Default to not published
        saveL(log);

        setSavedIds(prev => new Set(prev).add(r.id));
        setTimeout(() => setSavedIds(prev => { const n = new Set(prev); n.delete(r.id); return n; }), 1800);
    };
    const copyText = (t: string, id: string) => {
        navigator.clipboard.writeText(t);
        setCopiedIds(prev => new Set(prev).add(id));
        setTimeout(() => setCopiedIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 1800);
    };

    return (
        <div className="vw-pg-ws">
            <div className="vw-pg-left">
                <div className="vw-pg-left-hd">
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--or)", fontWeight: 600 }}>Prompt Generator</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>AI Prompt Engineering</div>
                    <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 2 }}>{proj.name} · {proj.phase}</div>
                </div>
                <div className="vw-pg-left-body">
                    {/* Mode select */}
                    {([["brief", "◇", "From Brief", "Paste a design brief. AI generates optimised prompts for each platform.", "brief"] as const,
                    ["image", "◐", "From Image", "Upload a reference. AI analyses architecture, materials, atmosphere.", "image"] as const,
                    ["custom", "◫", "Custom", "General-purpose prompt generation from any context.", "custom"] as const]).map(([id, ic, lb, d]) => (
                        <div key={id} className={`vw-pg-mode ${mode === id ? "on" : ""}`} onClick={() => setMode(id)}>
                            <div className="pm-icon">{ic}</div><div className="pm-l">{lb}</div><div className="pm-d">{d}</div>
                        </div>
                    ))}
                    {/* Input */}
                    {mode === "brief" && (
                        <>
                            {/* PDF Upload row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                                <input
                                    type="file"
                                    ref={pdfRef}
                                    accept="application/pdf"
                                    style={{ display: 'none' }}
                                    onChange={handlePdf}
                                />
                                <button
                                    className="vw-btn vw-btn-g vw-btn-sm"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}
                                    onClick={() => pdfRef.current?.click()}
                                    disabled={pdfExtracting}
                                >
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M2 10.5h8M6 1.5v7M3.5 6l2.5 2.5L8.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {pdfExtracting ? 'Extracting…' : 'Upload PDF Brief'}
                                </button>
                                {pdfName && !pdfExtracting && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        <span style={{ fontSize: 9, color: 'var(--tx3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfName}</span>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--tx3)', padding: 0 }} onClick={() => { setPdfName(null); setBriefInput(''); }}>×</button>
                                    </div>
                                )}
                                {pdfExtracting && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>Reading pages…</span>}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button onClick={() => openPicker("brief")} className="vw-btn vw-btn-g vw-btn-sm" style={{ fontSize: 9 }}>
                                    + Insert Prompts / Snippets
                                </button>
                            </div>
                            <textarea
                                className="vw-ft"
                                value={briefInput}
                                onChange={e => setBriefInput(e.target.value)}
                                placeholder={pdfName ? 'Extracted text will appear here — you can edit it before generating…' : 'Paste design brief here, or upload a PDF above…'}
                                style={{ marginTop: 8, fontFamily: 'var(--m)', fontSize: 10, minHeight: 120, width: '100%', boxSizing: 'border-box' }}
                            />
                        </>
                    )}
                    {mode === "image" && <>
                        <input type="file" ref={fileRef} accept="image/*" style={{ display: "none" }} onChange={handleImage} />
                        {!imageData ? <div className="vw-pg-dropzone" onClick={() => fileRef.current?.click()} style={{ marginTop: 12 }}><div className="dz-icon">◐</div><div className="dz-t">Upload Reference Image</div><div className="dz-s">PNG, JPG — click or drag</div></div> :
                            <div className="vw-pg-preview"><img src={imageData} alt="ref" /><button className="vw-pg-preview-remove" onClick={() => { setImageFile(null); setImageData(null); }}>×</button></div>}
                        <textarea className="vw-ft" value={customCtx} onChange={e => setCustomCtx(e.target.value)} placeholder="Additional context for image analysis…" style={{ marginTop: 8, fontSize: 10, minHeight: 48, width: '100%', boxSizing: 'border-box' }} />
                    </>}
                    {mode === "custom" && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                <button onClick={() => openPicker("custom")} className="vw-btn vw-btn-g vw-btn-sm" style={{ fontSize: 9 }}>
                                    + Insert Prompts / Snippets
                                </button>
                            </div>
                            <textarea className="vw-ft" value={customCtx} onChange={e => setCustomCtx(e.target.value)} placeholder="Enter context…" style={{ marginTop: 8, fontSize: 10, minHeight: 100, width: '100%', boxSizing: 'border-box' }} />
                        </>
                    )}

                    {/* Reference Docs */}
                    <div style={{ marginTop: 16 }}>
                        <button
                            className="vw-btn vw-btn-g"
                            style={{ width: "100%", justifyContent: "center", display: "flex", gap: 6 }}
                            onClick={() => setIsPickerOpen(true)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                            Attach Reference Docs {pdfContext.length > 0 && `(${pdfContext.length})`}
                        </button>
                        {pdfContext.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {pdfContext.map((ctx, idx) => (
                                    <div key={idx} style={{ background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 4, padding: "2px 6px", fontSize: 9, color: "var(--tx2)", display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.sectionName}</span>
                                        <button
                                            onClick={() => setPdfContext(prev => prev.filter((_, i) => i !== idx))}
                                            style={{ background: "none", border: "none", color: "var(--tx3)", cursor: "pointer", padding: 0 }}
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Material Schedule — optional, used by the ◩ Tag button on generated images */}
                    {proj.phase === "DD" && (
                        <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tx3)', fontWeight: 600, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Material Schedule
                                <span style={{ fontSize: 8, fontWeight: 400, color: '#ccff00', opacity: 0.85, textTransform: 'none', letterSpacing: 0 }}>◩ DD phase codes built-in</span>
                            </div>
                            <textarea
                                className="vw-ft"
                                value={materialCodeList}
                                onChange={e => setMaterialCodeList(e.target.value)}
                                placeholder={"Leave blank to use built-in DD phase schedule (MT01–DB07)\nor paste a custom override…"}
                                style={{ fontSize: 9, minHeight: 56, width: '100%', boxSizing: 'border-box', fontFamily: 'var(--m)' }}
                            />
                        </div>
                    )}

                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--tx3)", fontWeight: 500, margin: "14px 0 6px" }}>LLM Provider</div>
                    <div style={{ display: "flex", gap: 4 }}>{LLM_PROVIDERS.map(p => <button key={p.id} className={`vw-style-chip ${llmProvider === p.id ? "on" : ""}`} onClick={() => p.active && setLlmProvider(p.id)} style={{ opacity: p.active ? 1 : .3 }}>{p.label}</button>)}</div>
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--tx3)", fontWeight: 500, margin: "14px 0 6px" }}>Target Tools</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{externalTools.map(t => <button key={t.id} className={`vw-style-chip ${targetTools.includes(t.name) ? "on" : ""}`} onClick={() => toggleTool(t.name)}>{t.abbr} {t.name}</button>)}</div>
                    <button className="vw-btn vw-btn-p" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={generate} disabled={loading}>
                        {loading ? "Generating…" : "Generate Prompts"}
                    </button>
                </div>
            </div>
            <div className="vw-pg-right">
                <div className="vw-pg-output" ref={outputRef}>
                    {results.length === 0 && !loading && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--tx3)", textAlign: "center" }}>
                            <div style={{ fontSize: 40, opacity: .12 }}>◇</div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tx2)" }}>Prompt Gen</div>
                            <div style={{ fontSize: 11, maxWidth: 380, lineHeight: 1.6 }}>{mode === "brief" ? "Paste a design brief and select target tools." : mode === "image" ? "Upload a reference image for AI analysis." : "Enter context for general prompt generation."}</div>
                        </div>
                    )}
                    {results.map(r => (
                        <div key={r.id} className="vw-pg-result">
                            <div className="vw-pg-result-hd">
                                <div>
                                    <span className="vw-pg-result-label">{r.mode === "brief" ? "From Brief" : r.mode === "image" ? "From Image" : "Custom"}</span>
                                    <span style={{ fontSize: 9, color: "var(--tx3)", marginLeft: 8 }}>{r.input}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 8, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: 1 }}>{r.llm === "claude" ? "Claude Opus" : r.llm === "gemini" ? "Gemini 3.1 Pro" : r.llm === "gpt" ? "GPT-5.4" : r.llm}</span>
                                    <span className="vw-pg-result-tool">{r.tools}</span>
                                </div>
                            </div>
                            {r.retrying ? (
                                <div style={{ fontSize: 11, color: "var(--tx3)", padding: "12px 0", opacity: .6 }}>Refining prompt…</div>
                            ) : (
                                <textarea
                                    className="vw-pg-result-body vw-ft"
                                    value={r.content}
                                    onChange={(e) => {
                                        setResults(prev => prev.map(x => x.id === r.id ? { ...x, content: e.target.value } : x));
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    onFocus={(e) => { e.target.style.borderColor = 'var(--or)'; e.target.style.background = 'var(--bg2)'; }}
                                    onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                                    ref={(el) => {
                                        if (el) {
                                            el.style.height = 'auto';
                                            el.style.height = el.scrollHeight + 'px';
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        resize: 'none',
                                        background: 'transparent',
                                        border: '1px dashed transparent',
                                        padding: '8px',
                                        margin: '8px -8px',
                                        fontFamily: 'var(--m)',
                                        fontSize: '11px',
                                        color: 'var(--tx1)',
                                        lineHeight: '1.6',
                                        borderRadius: '6px',
                                        boxSizing: 'border-box',
                                        overflow: 'hidden',
                                        transition: 'border 0.2s, background 0.2s'
                                    }}
                                    title="Click to edit prompt"
                                />
                            )}
                            <div className="vw-pg-result-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    className={`vw-btn vw-btn-sm ${copiedIds.has(r.id) ? "vw-btn-ok" : "vw-btn-g"}`}
                                    onClick={() => copyText(r.content, r.id)}
                                    style={{ transition: "all 0.2s" }}
                                >
                                    {copiedIds.has(r.id) ? "✓ Copied" : "Copy all"}
                                </button>
                                <button
                                    className={`vw-btn vw-btn-sm ${savedIds.has(r.id) ? "vw-btn-ok" : "vw-btn-g"}`}
                                    onClick={() => logResult(r)}
                                    style={{ transition: "all 0.2s" }}
                                >
                                    {savedIds.has(r.id) ? "✓ Saved" : "Save to log"}
                                </button>
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => handleSaveSnippetStart(r)}
                                >
                                    Save Snippet…
                                </button>
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => handleRetry(r)}
                                    title="Regenerate this prompt"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                                    Retry
                                </button>
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => setFullScreenResult(r.id)}
                                    title="View Fullscreen"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
                                    Fullscreen
                                </button>
                                {/* Scene Image Generation */}
                                {!showImageOptions[r.id] && !imageLoading[r.id] ? (
                                    <button
                                        className="vw-btn vw-btn-sm vw-btn-p"
                                        onClick={() => { saveScroll(); setShowImageOptions(prev => ({ ...prev, [r.id]: true })); }}
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        Generate Scene
                                    </button>
                                ) : showImageOptions[r.id] && !imageLoading[r.id] ? (
                                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                        <button
                                            className="vw-btn vw-btn-sm vw-btn-p"
                                            onClick={() => generateImage(r, 'imagen-4')}
                                        >
                                            Scene · Imagen 4
                                        </button>
                                        <button
                                            className="vw-btn vw-btn-sm"
                                            style={{ background: '#eab308', color: '#000', borderColor: '#eab308', fontWeight: 600 }}
                                            onClick={() => generateImage(r, 'nano-banana')}
                                        >
                                            Scene · Nano Banana 2
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        className="vw-btn vw-btn-sm vw-btn-p"
                                        disabled
                                        style={{ opacity: 0.6, marginLeft: 'auto' }}
                                    >
                                        Generating Scene…
                                    </button>
                                )}
                            </div>

                            {/* Generated Scene Image Output */}
                            {imageErrors[r.id] && (
                                <div style={{ fontSize: 11, color: "#f87171", marginTop: 8 }}>
                                    {imageErrors[r.id]}
                                </div>
                            )}
                            {generatedImages[r.id] && generatedImages[r.id].length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tx3)', marginBottom: 6 }}>Scene Renders</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {generatedImages[r.id].map((imgSrc, imgIndex) => (
                                            <React.Fragment key={imgIndex}>
                                                {renderTaggableImage(imgSrc, `${r.id}-${imgIndex}`, {
                                                    altText: `Concept ${imgIndex + 1}`,
                                                    downloadIndex: imgIndex,
                                                    onFullscreen: () => setFullScreenImage(imgSrc),
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Material Board Section */}
                            {!r.retrying && extractMaterialBoard(r.content) && (() => {
                                const mbReference = getMaterialBoardReference(r);
                                const hasMbReference = !!mbReference.imageData;
                                return (
                                <div style={{ borderTop: '1px solid var(--bdr)', marginTop: 12, paddingTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--or)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--or)' }}>Material Board</span>
                                            {hasMbReference && <span style={{ fontSize: 8, background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '1px 5px', borderRadius: 3, fontWeight: 500 }}>{mbReference.source === "main" ? "MAIN IMAGE REF" : "REF OVERRIDE"}</span>}
                                        </div>
                                    </div>
                                    {/* Reference Material Board Upload */}
                                    <input type="file" ref={mbRefInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleMbRefUpload} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', background: 'var(--card)', border: '1px dashed var(--bdr)', borderRadius: 6 }}>
                                        {!mbRefImage ? (
                                            <button
                                                className="vw-btn vw-btn-sm vw-btn-g"
                                                onClick={() => mbRefInputRef.current?.click()}
                                                style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                                                {mbReference.source === "main" ? "Upload Different Reference" : "Upload Reference Board"}
                                            </button>
                                        ) : (
                                            <>
                                                <img src={mbRefImage} alt="Reference" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--bdr)' }} onClick={() => setFullScreenImage(mbRefImage)} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mbRefFile}</div>
                                                    {mbRefAnalyzing && <div style={{ fontSize: 8, color: '#a78bfa', marginTop: 2 }}>Analyzing layout…</div>}
                                                    {mbRefAnalysis && <div style={{ fontSize: 8, color: '#4ade80', marginTop: 2 }}>Analysis ready - using override reference</div>}
                                                    {!mbRefAnalyzing && !mbRefAnalysis && <div style={{ fontSize: 8, color: '#f87171', marginTop: 2 }}>Analysis failed - will rely on the image only</div>}
                                                </div>
                                                <button onClick={() => mbRefInputRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', padding: '2px 4px' }} title="Change reference">↻</button>
                                                <button onClick={() => { setMbRefImage(null); setMbRefFile(null); setMbRefAnalysis(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--tx3)', padding: '2px 4px' }} title="Remove reference">×</button>
                                            </>
                                        )}
                                        {!mbRefImage && <span style={{ fontSize: 8, color: mbReference.source === "main" ? '#4ade80' : 'var(--tx3)', fontStyle: 'italic' }}>{mbReference.source === "main" ? "Using main uploaded image for furniture; upload here only to override." : "Optional - upload a reference to preserve furniture."}</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <button
                                                className="vw-btn vw-btn-sm vw-btn-g"
                                                onClick={() => {
                                                    const mb = extractMaterialBoard(r.content);
                                                    if (mb) copyText(mb, `mb-${r.id}`);
                                                }}
                                                style={{ fontSize: 9 }}
                                            >
                                                {copiedIds.has(`mb-${r.id}`) ? '✓ Copied' : 'Copy Material Board'}
                                            </button>
                                            <input type="file" accept="image/*" ref={mbImportFileRef} style={{ display: 'none' }} onChange={(e) => { importBoardFromFile(e.target.files); e.target.value = ''; }} />
                                            <button
                                                className="vw-btn vw-btn-sm"
                                                style={{ fontSize: 9, borderColor: '#c084fc', color: '#c084fc', fontWeight: 600 }}
                                                onClick={() => setShowMbImport(v => !v)}
                                                title="Import an external board image (Pinterest pin link, image URL, or file) as an editable canvas template"
                                            >
                                                ✂ Import Board
                                            </button>
                                            {/* Material Board Image Generation Buttons */}
                                            {!showMbImageOptions[r.id] && !mbImageLoading[r.id] ? (
                                                <button
                                                    className="vw-btn vw-btn-sm"
                                                    style={{ background: 'linear-gradient(135deg, #c084fc, #818cf8)', color: '#fff', borderColor: '#a78bfa', fontWeight: 600, fontSize: 9 }}
                                                    onClick={() => { saveScroll(); setShowMbImageOptions(prev => ({ ...prev, [r.id]: true })); }}
                                                >
                                                    Generate Material Board
                                                </button>
                                            ) : showMbImageOptions[r.id] && !mbImageLoading[r.id] ? (
                                                <>
                                                    <button
                                                        className="vw-btn vw-btn-sm"
                                                        style={{ background: 'linear-gradient(135deg, #c084fc, #818cf8)', color: '#fff', borderColor: '#a78bfa', fontWeight: 600, fontSize: 9, opacity: hasMbReference ? 0.4 : 1, cursor: hasMbReference ? 'not-allowed' : 'pointer' }}
                                                        onClick={() => { if (!hasMbReference) generateMaterialBoardImage(r, 'imagen-4'); }}
                                                        disabled={hasMbReference}
                                                        title={hasMbReference ? 'Imagen 4 cannot read reference images. Use Nano Banana to preserve furniture from the source image.' : undefined}
                                                    >
                                                        MB · Imagen 4{hasMbReference ? ' (no ref support)' : ''}
                                                    </button>
                                                    <button
                                                        className="vw-btn vw-btn-sm"
                                                        style={{ background: '#eab308', color: '#000', borderColor: '#eab308', fontWeight: 600, fontSize: 9 }}
                                                        onClick={() => generateMaterialBoardImage(r, 'nano-banana')}
                                                        title={hasMbReference ? `Uses the ${mbReference.source === "main" ? "main uploaded image" : "override reference"} to preserve furniture.` : undefined}
                                                    >
                                                        MB · Nano Banana 2{hasMbReference ? (mbReference.source === "main" ? ' uses main image' : ' uses override') : ''}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    className="vw-btn vw-btn-sm"
                                                    disabled
                                                    style={{ opacity: 0.6, background: 'linear-gradient(135deg, #c084fc, #818cf8)', color: '#fff', borderColor: '#a78bfa', fontSize: 9 }}
                                                >
                                                    Generating Board {mbImageProgress[r.id] ? `${mbImageProgress[r.id]}/5` : ''}…
                                                </button>
                                            )}
                                        </div>
                                    {/* Import external board (Pinterest / URL / file) */}
                                    {showMbImport && (
                                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--card)', border: '1px dashed #c084fc', borderRadius: 6 }}>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <input
                                                    className="vw-ft"
                                                    style={{ flex: 1, minWidth: 220, height: 28, fontSize: 10 }}
                                                    placeholder="Paste a Pinterest pin link or image URL…"
                                                    value={mbImportUrl}
                                                    onChange={e => setMbImportUrl(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') void importBoardFromUrl(); }}
                                                    disabled={mbImporting}
                                                />
                                                <button className="vw-btn vw-btn-sm vw-btn-p" style={{ fontSize: 9 }} onClick={() => void importBoardFromUrl()} disabled={mbImporting || !mbImportUrl.trim()}>
                                                    {mbImporting ? '◌ Fetching…' : '⤵ Import to Canvas'}
                                                </button>
                                                <button className="vw-btn vw-btn-sm vw-btn-g" style={{ fontSize: 9 }} onClick={() => mbImportFileRef.current?.click()} disabled={mbImporting}>
                                                    ⤒ Upload file
                                                </button>
                                            </div>
                                            {importedBoards.length > 0 && (
                                                <div style={{ marginTop: 8 }}>
                                                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--tx3)', marginBottom: 5 }}>
                                                        Imported boards <span style={{ fontWeight: 400, opacity: 0.7 }}>— canvas edits are saved automatically; click to reopen</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        {importedBoards.map(b => (
                                                            <div key={b.id} style={{ position: 'relative', width: 108 }}>
                                                                <img
                                                                    src={b.src}
                                                                    alt={b.title}
                                                                    style={{ width: 108, height: 76, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--bdr)', cursor: 'pointer', display: 'block' }}
                                                                    onClick={() => setCanvasEditor({ src: b.src, title: b.title })}
                                                                    title={`${b.title} — open in canvas (your edits are restored)`}
                                                                />
                                                                <button
                                                                    onClick={() => removeImportedBoard(b.id)}
                                                                    style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#f87171', fontSize: 10, lineHeight: 1, cursor: 'pointer' }}
                                                                    title="Remove from imported boards"
                                                                >
                                                                    ×
                                                                </button>
                                                                <div style={{ fontSize: 8, color: 'var(--tx3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {/* Material Board Errors */}
                                    {mbImageErrors[r.id] && (
                                        <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>{mbImageErrors[r.id]}</div>
                                    )}
                                    {/* Material Board Generated Images */}
                                    {mbGeneratedImages[r.id] && mbGeneratedImages[r.id].length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tx3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                Material Board Variations
                                                <span style={{ fontSize: 8, fontWeight: 400, color: 'var(--tx3)', opacity: 0.7 }}>({mbGeneratedImages[r.id].filter(e => e.src !== null).length}{mbImageLoading[r.id] ? '/5' : ''} generated)</span>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                                                {mbGeneratedImages[r.id].map((entry, imgIndex) => {
                                                    const styleName = entry.styleName;
                                                    if (entry.src === null) {
                                                        return (
                                                            <div key={imgIndex} style={{ position: 'relative', borderRadius: 8, border: '1px dashed rgba(168, 139, 250, 0.3)', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 8px' }}>
                                                                <div style={{ background: 'rgba(139, 92, 246, 0.5)', borderRadius: 4, padding: '2px 6px', fontSize: 8, fontWeight: 600, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase' }}>{styleName}</div>
                                                                <span style={{ fontSize: 9, color: 'var(--tx3)', opacity: 0.8, textAlign: 'center' }}>{entry.warning || "Failed to generate"}</span>
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div key={imgIndex} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            <div style={{ background: entry.status === "empty-fallback" ? 'rgba(234, 179, 8, 0.9)' : 'rgba(139, 92, 246, 0.85)', borderRadius: 4, padding: '2px 6px', fontSize: 8, fontWeight: 600, color: entry.status === "empty-fallback" ? '#000' : '#fff', letterSpacing: 0.5, textTransform: 'uppercase', alignSelf: 'flex-start' }}>{styleName}</div>
                                                            {entry.warning && <div style={{ fontSize: 9, color: '#fbbf24', lineHeight: 1.4, padding: '4px 6px', border: '1px solid rgba(251, 191, 36, 0.35)', borderRadius: 4, background: 'rgba(251, 191, 36, 0.08)' }}>{entry.warning}</div>}
                                                            {renderTaggableImage(entry.src, `${r.id}-mb-${imgIndex}`, {
                                                                altText: `Material Board — ${styleName}`,
                                                                downloadIndex: imgIndex,
                                                                onFullscreen: () => setFullScreenImage(entry.src),
                                                                tagMode: 'materialBoard',
                                                                allowCanvasEdit: true,
                                                            })}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                );
                            })()}

                            {/* Reference Image Section — tag the uploaded reference image */}
                            {!r.retrying && r.mode === "image" && r.imageData && (
                                <div style={{ borderTop: '1px solid var(--bdr)', marginTop: 12, paddingTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#ccff00' }}>Reference Image</span>
                                        <span style={{ fontSize: 9, color: 'var(--tx3)' }}>tag the uploaded image directly</span>
                                    </div>
                                    {renderTaggableImage(r.imageData, `${r.id}-input`, {
                                        altText: 'Reference image',
                                        downloadIndex: 0,
                                        onFullscreen: () => setFullScreenImage(r.imageData!),
                                        allowUpscale: true,
                                        allowSheetExport: true,
                                    })}
                                </div>
                            )}

                            {/* Furniture Analysis Section — image-mode results only */}
                            {!r.retrying && r.mode === "image" && r.imageData && (
                                <div style={{ borderTop: '1px solid var(--bdr)', marginTop: 12, paddingTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 9V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M14 12H4"/><path d="M8 8v8"/><path d="M20 12h-6l2-2m-2 2 2 2"/></svg>
                                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#38bdf8' }}>Furniture Detect</span>
                                        </div>
                                        {!furnitureAnalyzing[r.id] && (
                                            <button
                                                className="vw-btn vw-btn-sm vw-btn-g"
                                                style={{ fontSize: 9 }}
                                                onClick={() => analyzeFurniture(r)}
                                            >
                                                {furnitureLists[r.id] ? '↻ Re-analyse' : 'Analyse Furniture'}
                                            </button>
                                        )}
                                        {furnitureAnalyzing[r.id] && (
                                            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>Analysing…</span>
                                        )}
                                    </div>
                                    {furnitureAnalyzing[r.id] && (
                                        <div style={{ fontSize: 10, color: 'var(--tx3)', padding: '4px 0' }}>Identifying furniture in the reference image…</div>
                                    )}
                                    {furnitureLists[r.id] && (
                                        <>
                                            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--bdr)', borderRadius: 6 }}>
                                                {furnitureLists[r.id].map((item, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 6, padding: '6px 8px', background: i % 2 === 0 ? 'var(--card)' : 'transparent', borderBottom: '1px solid var(--bdr)' }}>
                                                        <textarea
                                                            className="vw-ft"
                                                            value={item}
                                                            onChange={e => updateFurnitureItem(r.id, i, e.target.value)}
                                                            rows={2}
                                                            style={{ flex: 1, minHeight: 38, resize: 'vertical', fontSize: 10, lineHeight: 1.4, padding: '5px 7px', borderRadius: 5, boxSizing: 'border-box' }}
                                                            title="Edit furniture item"
                                                        />
                                                        <button
                                                            onClick={() => removeFurnitureItem(r.id, i)}
                                                            style={{ width: 24, minWidth: 24, border: '1px solid var(--bdr)', borderRadius: 5, background: 'var(--bg3)', color: 'var(--tx3)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                                                            title="Remove furniture item"
                                                        >
                                                            x
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addFurnitureItem(r.id)}
                                                    className="vw-btn vw-btn-sm vw-btn-g"
                                                    style={{ alignSelf: 'flex-start', margin: 8, fontSize: 9 }}
                                                >
                                                    + Add item
                                                </button>
                                            </div>
                                            {/* Per-Item Furniture Generation */}
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                                                {!showFurnitureGenOptions[r.id] && !furnitureGenLoading[r.id] && (
                                                    <>
                                                        <button
                                                            className="vw-btn vw-btn-sm"
                                                            style={{ background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#fff', borderColor: '#38bdf8', fontWeight: 600, fontSize: 9, opacity: getFurnitureGenerationItems(r.id).length === 0 ? 0.5 : 1 }}
                                                            onClick={() => { saveScroll(); setShowFurnitureGenOptions(prev => ({ ...prev, [r.id]: true })); }}
                                                            disabled={getFurnitureGenerationItems(r.id).length === 0}
                                                        >
                                                            Generate Each Item
                                                        </button>
                                                        <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{getFurnitureGenerationItems(r.id).length} item{getFurnitureGenerationItems(r.id).length !== 1 ? 's' : ''} · one image per piece</span>
                                                    </>
                                                )}
                                                {showFurnitureGenOptions[r.id] && !furnitureGenLoading[r.id] && (
                                                    <>
                                                        <button
                                                            className="vw-btn vw-btn-sm"
                                                            style={{ background: '#eab308', color: '#000', borderColor: '#eab308', fontWeight: 600, fontSize: 9 }}
                                                            onClick={() => generateFurnitureScene(r, 'nano-banana')}
                                                            title="Edit-mode: uses the reference image for style consistency"
                                                        >
                                                            Per-Item · Nano Banana ✎ (edit ref)
                                                        </button>
                                                        <button
                                                            className="vw-btn vw-btn-sm"
                                                            style={{ background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#fff', borderColor: '#38bdf8', fontWeight: 600, fontSize: 9 }}
                                                            onClick={() => generateFurnitureScene(r, 'imagen-4')}
                                                            title="Text-only: standalone product photos"
                                                        >
                                                            Per-Item · Imagen 4
                                                        </button>
                                                        <button
                                                            onClick={() => { saveScroll(); setShowFurnitureGenOptions(prev => ({ ...prev, [r.id]: false })); }}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', padding: '2px 4px' }}
                                                        >Cancel</button>
                                                    </>
                                                )}
                                                {furnitureGenLoading[r.id] && (
                                                    <button className="vw-btn vw-btn-sm" disabled style={{ opacity: 0.6, background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#fff', borderColor: '#38bdf8', fontSize: 9 }}>
                                                        Generating {furnitureGenImages[r.id]?.length || 0}/{getFurnitureGenerationItems(r.id).length}…
                                                    </button>
                                                )}
                                            </div>
                                            {furnitureGenErrors[r.id] && (
                                                <div style={{ fontSize: 10, color: '#f87171', marginTop: 6 }}>{furnitureGenErrors[r.id]}</div>
                                            )}
                                            {furnitureGenImages[r.id] && furnitureGenImages[r.id].length > 0 && (
                                                <div style={{ marginTop: 10 }}>
                                                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tx3)', marginBottom: 6 }}>Per-Item Renders ({furnitureGenImages[r.id].length})</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                        {furnitureGenImages[r.id].map((src, i) => {
                                                            const itemLabel = getFurnitureGenerationItems(r.id)[i] || `Item ${i + 1}`;
                                                            return (
                                                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <div style={{ fontSize: 9, color: 'var(--tx2)', fontWeight: 500, lineHeight: 1.3, padding: '0 2px', minHeight: 24, display: 'flex', alignItems: 'center' }}>{itemLabel}</div>
                                                                    {renderTaggableImage(src, `${r.id}-fs-${i}`, {
                                                                        altText: itemLabel,
                                                                        downloadIndex: i,
                                                                        onFullscreen: () => setFullScreenImage(src),
                                                                        tagMode: 'furniture',
                                                                    })}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Satisfaction feedback row */}
                            {!r.retrying && (
                                <div style={{ borderTop: "1px solid var(--bdr)", marginTop: 10, paddingTop: 10 }}>
                                    {r.feedback === "good" ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4ade80" }}>
                                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7L5 10L11 3" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            Marked as helpful
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ fontSize: 10, color: "var(--tx3)" }}>Was this helpful?</span>
                                                <button
                                                    onClick={() => handleFeedback(r.id, "good")}
                                                    title="Yes, looks good"
                                                    style={{ background: "none", border: "1px solid var(--bdr)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 13, color: "var(--tx2)", transition: "all 0.15s" }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ade80"; e.currentTarget.style.color = "#4ade80"; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bdr)"; e.currentTarget.style.color = "var(--tx2)"; }}
                                                >👍</button>
                                                <button
                                                    onClick={() => handleFeedback(r.id, "retry")}
                                                    title="Needs improvement"
                                                    style={{ background: "none", border: "1px solid var(--bdr)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 13, color: "var(--tx2)", transition: "all 0.15s" }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#f87171"; e.currentTarget.style.color = "#f87171"; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bdr)"; e.currentTarget.style.color = "var(--tx2)"; }}
                                                >👎</button>
                                            </div>

                                            {/* Retry panel — shown when 👎 clicked */}
                                            {r.feedback === "retry" && (
                                                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                                    <textarea
                                                        className="vw-ft"
                                                        value={retryHints[r.id] || ""}
                                                        onChange={e => setRetryHints(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                        placeholder="What should be improved? (optional — leave blank to auto-refine)"
                                                        style={{ fontSize: 10, minHeight: 52, resize: "vertical" }}
                                                    />
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <button
                                                            className="vw-btn vw-btn-p vw-btn-sm"
                                                            onClick={() => handleRetry(r)}
                                                            style={{ display: "flex", alignItems: "center", gap: 5 }}
                                                        >
                                                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M9.5 2A5 5 0 1 0 10 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 1V4H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                            Retry
                                                        </button>
                                                        <span style={{ fontSize: 9, color: "var(--tx3)" }}>
                                                            {retryHints[r.id]?.trim() ? "Retry with your hint" : "AI will self-improve"}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && <div className="vw-pg-result" style={{ opacity: .5 }}><div className="vw-pg-result-hd"><span className="vw-pg-result-label">Generating…</span></div><div style={{ fontSize: 11, color: "var(--tx3)", padding: "12px 0" }}>Analysing input via {LLM_PROVIDERS.find(p => p.id === llmProvider)?.label}…</div></div>}
                </div>
            </div>

            <PdfSectionPicker
                isOpen={isPickerOpen}
                projectId={proj.id}
                onClose={() => setIsPickerOpen(false)}
                onConfirm={(selections) => setPdfContext(selections)}
                initialSelectedIds={pdfContext.map(c => c.id)}
            />

            {fullScreenResult && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Full Screen Prompt</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => copyText(results.find(r => r.id === fullScreenResult)?.content || "", fullScreenResult)}
                                className={`vw-btn vw-btn-sm ${copiedIds.has(fullScreenResult) ? "vw-btn-ok" : "vw-btn-g"}`}
                            >
                                {copiedIds.has(fullScreenResult) ? "✓ Copied" : "Copy all"}
                            </button>
                            <button onClick={() => setFullScreenResult(null)} className="vw-btn vw-btn-g vw-btn-sm">
                                Close
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '24px', whiteSpace: 'pre-wrap', fontFamily: 'var(--m)', fontSize: 13, lineHeight: '1.6', color: 'var(--tx1)', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                        {results.find(r => r.id === fullScreenResult)?.content}
                    </div>
                </div>
            )}

            {fullScreenImage && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    onClick={() => setFullScreenImage(null)}
                >
                    <button
                        onClick={() => setFullScreenImage(null)}
                        style={{ position: 'absolute', top: 24, right: 24, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: 40, height: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <img
                        src={fullScreenImage}
                        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                        alt="Fullscreen Concept"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {canvasEditor && (
                <BoardCanvasEditor
                    src={canvasEditor.src}
                    title={canvasEditor.title}
                    onClose={() => setCanvasEditor(null)}
                />
            )}
            {snippetModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setSnippetModal(prev => ({ ...prev, isOpen: false }))}>
                    <div style={{ background: 'var(--bg)', width: 600, maxWidth: '90vw', borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Save Prompt Snippet</div>
                        <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Edit the text below to save only the part you want to reuse.</div>
                        <textarea
                            className="vw-ft"
                            style={{ height: 150, fontFamily: 'var(--m)', fontSize: 11 }}
                            value={snippetModal.text}
                            onChange={e => setSnippetModal(prev => ({ ...prev, text: e.target.value }))}
                        />
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 500 }}>Name</div>
                                <input
                                    className="vw-ft"
                                    style={{ height: 32, fontSize: 12 }}
                                    placeholder="e.g. Modern Living Room Base"
                                    value={snippetModal.name}
                                    onChange={e => setSnippetModal(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 500 }}>Save to Location</div>
                                <select
                                    className="vw-ft"
                                    style={{ height: 32, fontSize: 12 }}
                                    value={snippetModal.type}
                                    onChange={e => setSnippetModal(prev => ({ ...prev, type: e.target.value as "global" | "project" }))}
                                >
                                    <option value="project">Project Prompts ({proj.name})</option>
                                    <option value="global">Global Prompt Library</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button className="vw-btn vw-btn-g" onClick={() => setSnippetModal(prev => ({ ...prev, isOpen: false }))}>Cancel</button>
                            <button className="vw-btn vw-btn-p" onClick={submitSnippet}>Save Snippet</button>
                        </div>
                    </div>
                </div>
            )}

            {pickerModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setPickerModal(prev => ({ ...prev, isOpen: false }))}>
                    <div style={{ background: 'var(--bg)', width: 800, maxWidth: '90vw', height: '80vh', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 600 }}>Insert Prompt Snippet</div>
                            <button onClick={() => setPickerModal(prev => ({ ...prev, isOpen: false }))} className="vw-btn vw-btn-g vw-btn-sm">Close</button>
                        </div>
                        <div style={{ display: 'flex', gap: 16, padding: '16px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--card)' }}>
                            <button
                                className={`vw-style-chip ${pickerModal.activeTab === 'top10' ? 'on' : ''}`}
                                onClick={() => setPickerModal(prev => ({ ...prev, activeTab: 'top10' }))}
                            >Top 10 Global Prompts</button>
                            <button
                                className={`vw-style-chip ${pickerModal.activeTab === 'project' ? 'on' : ''}`}
                                onClick={() => setPickerModal(prev => ({ ...prev, activeTab: 'project' }))}
                            >Project Prompts</button>
                            <button
                                className={`vw-style-chip ${pickerModal.activeTab === 'global' ? 'on' : ''}`}
                                onClick={() => setPickerModal(prev => ({ ...prev, activeTab: 'global' }))}
                            >All Global Library</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {pickerLoading ? (
                                <div style={{ color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading prompts...</div>
                            ) : pickerEntries.length === 0 ? (
                                <div style={{ color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: 40 }}>No prompts found in this category.</div>
                            ) : (
                                pickerEntries.map(entry => (
                                    <div key={entry.id} style={{ border: '1px solid var(--bdr)', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {entry.name || 'Unnamed Prompt'}
                                                {entry.is_snippet && <span style={{ fontSize: 9, background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '2px 6px', borderRadius: 4 }}>Snippet</span>}
                                            </div>
                                            <button className="vw-btn vw-btn-p vw-btn-sm" onClick={() => selectPickerEntry(entry.prompt)}>Insert</button>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--tx3)', display: 'flex', gap: 12 }}>
                                            <span>Uses: {entry.usage_count}</span>
                                            <span>Saved by: {entry.saved_by}</span>
                                            {entry.tool && <span>Tools: {entry.tool}</span>}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--tx2)', fontFamily: 'var(--m)', background: 'var(--bg)', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                            {entry.prompt}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
