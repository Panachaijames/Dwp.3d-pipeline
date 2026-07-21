// Image auto-tagging core, lifted out of PromptGenWorkspace so the Boards studio
// can tag any image (scene renders, material boards, furniture shots) without a
// Prompt Gen result. Prompts and schedules stay identical to Prompt Gen's copies.

import {
    MaterialAnnotation,
    MATERIAL_BOARD_CATEGORIES,
    FURNITURE_CATEGORIES,
    DD_PHASE_MATERIAL_SCHEDULE,
    FULL_CATEGORY_CATALOG,
} from '../VizWorkflow/constants';

export type TagMode = 'scene' | 'materialBoard' | 'furniture';

// Tolerant JSON-array parser for Gemini responses that may include prose / fences / smart quotes / trailing commas
export const parseTagJSON = (text: string): any[] => {
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

// Auto-number bare category codes so repeated categories stay distinct (WD → WD-01, WD-02).
// Tags with the same code AND the same note describe the same material and share one number,
// so tagging the same finish twice yields qty 2 in the schedule rather than a phantom second
// material. Codes that already carry digits (MT01, GL04+MT02, WD-01) are left untouched.
export const autoNumberAnnotations = (anns: MaterialAnnotation[]): MaterialAnnotation[] => {
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

const MATERIAL_FURNITURE_SYNC_RULES = `Material/furniture sync rules:
- For every furniture or FF&E tag, include the visible material/finish keyword in "note" whenever it can be identified (examples: "walnut lounge chair", "cream boucle sofa", "black metal table", "brass table lamp").
- If a furniture piece uses the same visible material/finish as a material/surface tag in the same image, reuse the exact same material keyword in both notes.
- Keep the code from the requested schedule; put material wording in "note", not in "code".
- If the material is unclear, describe the furniture normally.`;

export interface TagPromptOptions {
    /** Custom code schedule pasted by the user (scene mode only) */
    customSchedule?: string;
    /** Use the DD-phase project schedule when no custom list is given (scene mode only) */
    ddSchedule?: boolean;
}

export const buildTagPrompts = (tagMode: TagMode, opts: TagPromptOptions = {}): { prompt: string; systemPrompt: string } => {
    const customList = (opts.customSchedule || '').trim();
    if (tagMode === 'materialBoard') {
        const activeSchedule = MATERIAL_BOARD_CATEGORIES;
        return {
            systemPrompt: `You are a material board annotator. The image is a flat-lay or moodboard showing physical material samples (swatches of stone, wood, fabric, metal, glass, paint, tile, etc.). Identify every distinct material swatch in the image and tag it with the most appropriate 2-letter category code from the schedule below. Place each tag at the centre of that swatch. Tag every visible swatch — typically 6-15 items. Use ONLY codes from the provided schedule.\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary. Each item: {"code":"WD","x":25,"y":40,"note":"walnut veneer"}. The "note" is a 1-3 word description of the specific swatch (e.g. "walnut veneer", "brushed brass", "honed travertine"). x and y are % positions (0-100) from top-left.`,
            prompt: `Material Categories:\n${activeSchedule}\n\nTag every visible material swatch on this board.`,
        };
    }
    if (tagMode === 'furniture') {
        const activeSchedule = FURNITURE_CATEGORIES;
        return {
            systemPrompt: `You are a furniture / FF&E tagger. The image shows one or more interior furniture pieces. Tag each visible furniture element using ONLY the 2-letter category codes from the schedule below - do not invent any other codes. The "note" should describe the specific piece and visible material/finish keyword (e.g. "walnut lounge chair", "cream boucle sofa", "brass table lamp"). For images of a single isolated piece, place ONE tag at the centre of the piece. For multi-piece scenes, tag every distinct piece.\n\n${MATERIAL_FURNITURE_SYNC_RULES}\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary. Each item: {"code":"SE","x":50,"y":60,"note":"walnut lounge chair"}. x and y are % positions (0-100) from top-left.`,
            prompt: `Furniture Categories (use ONLY these codes):\n${activeSchedule}\n\nTag every furniture piece visible in this image. Use material/finish keywords in furniture notes when visible, and reuse the same material keyword for pieces using the same material.`,
        };
    }
    // 'scene' mode — DD-specific codes when available, otherwise the full generic catalogue
    const activeSchedule = customList.length > 0
        ? customList
        : (opts.ddSchedule ? DD_PHASE_MATERIAL_SCHEDULE : FULL_CATEGORY_CATALOG);
    const isDDProject = customList.length > 0 || !!opts.ddSchedule;
    return {
        systemPrompt: isDDProject
            ? `You are an interior design material code annotator for a DD phase project. Analyse the interior image and match every visible surface, material, finish, and element to the most appropriate code from the provided schedule. For surfaces combining two materials, write "CODE1+CODE2" (e.g. "GL04+MT02"). Tag at least 8 elements. Use ONLY codes from the provided schedule. Omit codes not visible.\n\n${MATERIAL_FURNITURE_SYNC_RULES}\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary, no explanation. Each item: {"code":"MT01","x":25,"y":40,"note":"brushed metal chair frame"}. x and y are % positions (0-100) from top-left.`
            : `You are an interior design tagger. Tag every visible material, furniture piece, plumbing fixture, electrical/lighting element, and finish in this image, using ONLY the 2-letter category codes from the schedule below. Tag at least 8 elements. The "note" should be a 1-3 word description of the specific item (e.g. "walnut floor", "walnut lounge chair", "pendant lamp", "stone wall").\n\n${MATERIAL_FURNITURE_SYNC_RULES}\n\nReply with NOTHING but the JSON array. Start with [ end with ]. No prose, no markdown fences, no commentary. Each item: {"code":"SE","x":25,"y":60,"note":"walnut lounge chair"}. x and y are % positions (0-100) from top-left.`,
        prompt: `Schedule:\n${activeSchedule}\n\nTag every visible element on this image. For furniture tags, include material/finish keywords in note when visible and reuse the same material keyword for furniture using the same material.`,
    };
};

/** Tag an image via /api/gemini. Returns annotations with fresh ids, auto-numbered. */
export async function requestImageTags(imgSrc: string, tagMode: TagMode, opts: TagPromptOptions = {}): Promise<MaterialAnnotation[]> {
    const { prompt, systemPrompt } = buildTagPrompts(tagMode, opts);
    let rawText = '';
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, systemPrompt, imageData: imgSrc }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        rawText = data.response || data.text || '';
        const parsed = parseTagJSON(rawText);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty tag list — model returned no annotations');
        return autoNumberAnnotations(parsed
            .filter(a => a && typeof a.code === 'string' && typeof a.x === 'number' && typeof a.y === 'number')
            .map(a => ({
                code: String(a.code),
                x: Math.max(0, Math.min(100, Number(a.x))),
                y: Math.max(0, Math.min(100, Number(a.y))),
                note: a.note ? String(a.note) : undefined,
                id: Math.random().toString(36).substring(2, 11),
            })));
    } catch (err: any) {
        const snippet = rawText ? ` · raw: ${rawText.slice(0, 160)}` : '';
        throw new Error((err?.message || 'Tagging failed') + snippet);
    }
}

/** Upscale an image to 4K via Nano Banana edit-mode (preserves composition, sharpens detail). */
export async function upscaleImage4K(imgSrc: string): Promise<string> {
    const res = await fetch('/api/imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: "Upscale this exact image to 4K resolution. Maximally sharpen all details, remove blur and softness, enhance fine textures and edges. Preserve the EXACT composition, framing, colors, lighting, materials, and content — every object stays in its original position. Do NOT add, remove, or change anything. Output ONLY a high-resolution version of the same image. No text, no labels, no annotations.",
            targetModel: 'nano-banana',
            singleImage: true,
            imageData: imgSrc,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upscale failed');
    const upscaled = data.images?.[0];
    if (!upscaled) throw new Error('No upscaled image returned');
    return upscaled;
}

// ---------------------------------------------------------------------------
// Annotated-image PNG export (canvas rendering of tags baked into the image)
// ---------------------------------------------------------------------------

export const triggerDownload = (href: string, filename: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const loadCanvasImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be loaded for export'));
    img.src = src;
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
    const code = annotation.code.trim() || 'TAG';
    const note = annotation.note?.trim() || '';
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

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetY = 1 * scale;
    roundedRect(ctx, left, top, labelWidth, labelHeight, radius);
    ctx.fillStyle = '#ccff00';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${codeFontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(code, left + paddingX, top + paddingY);

    if (noteLines.length) {
        ctx.fillStyle = '#222';
        ctx.font = `500 ${noteFontSize}px Arial, sans-serif`;
        noteLines.forEach((line, index) => {
            ctx.fillText(line, left + paddingX, top + paddingY + codeLineHeight + gap + index * noteLineHeight);
        });
    }

    ctx.restore();
};

export const exportAnnotatedImage = async (imageSrc: string, annotations: MaterialAnnotation[], filename: string) => {
    const img = await loadCanvasImage(imageSrc);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error('Image has no exportable dimensions');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas export is not supported in this browser');

    ctx.drawImage(img, 0, 0, width, height);
    annotations.forEach(annotation => drawAnnotationLabel(ctx, annotation, width, height));

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        triggerDownload(blobUrl, filename);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return;
    }

    triggerDownload(canvas.toDataURL('image/png'), filename);
};
