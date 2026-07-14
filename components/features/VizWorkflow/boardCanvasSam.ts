"use client";
// Client-side SAM segmentation for the Board Canvas editor.
//
// Pipeline: /api/segment returns labeled bounding boxes (Gemini 3.5 Flash detection),
// then SlimSAM (via transformers.js) turns each box into a pixel mask fully in the
// browser — no GPU server, no per-mask API cost. The image is encoded ONCE (the
// expensive step); each box then only runs the tiny prompt-decoder.
//
// DEVICE = 'wasm' (CPU), deliberately NOT WebGPU. SlimSAM's fp32 mask-decoder fails to
// compile a MatMul compute shader in onnxruntime-web on some real drivers, and — worse —
// once WebGPU is initialized in a page session, a subsequent WASM session is still routed
// through the poisoned WebGPU backend, so a mid-session fallback can't recover. Never
// initializing WebGPU sidesteps this entirely. WASM segments a ~10-piece board in ~15-25s.

export type DetectedItem = { box_2d: [number, number, number, number]; label: string };

export type BoardPiece = {
    id: string;
    label: string;
    /** transparent PNG data URL, cropped to the piece's bounding box (+padding) */
    src: string;
    /** placement in natural image pixels */
    x: number;
    y: number;
    width: number;
    height: number;
    /** true when the mask looks degenerate (near-empty or filling its whole box) */
    lowConfidence: boolean;
};

export type SegmentProgress =
    | { stage: 'loading-model' }
    | { stage: 'embedding' }
    | { stage: 'cutting'; done: number; total: number };

const MODEL_ID = 'Xenova/slimsam-77-uniform';
const CUTOUT_PAD = 3;
const DEVICE = 'wasm'; // see header note — WebGPU is deliberately never initialized
const DTYPE = 'q8';

type SamBundle = { tf: any; model: any; processor: any };

let samPromise: Promise<SamBundle> | null = null;

async function loadSam(): Promise<SamBundle> {
    if (!samPromise) {
        samPromise = (async () => {
            const tf = await import('@huggingface/transformers');
            const { SamModel, AutoProcessor } = tf as any;
            const model = await SamModel.from_pretrained(MODEL_ID, { device: DEVICE, dtype: DTYPE });
            const processor = await AutoProcessor.from_pretrained(MODEL_ID);
            return { tf, model, processor };
        })().catch((err) => {
            samPromise = null; // allow retry on next call
            throw err;
        });
    }
    return samPromise;
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load board image'));
        img.src = src;
    });
}

/** Segment the detected items of a board image into transparent PNG pieces (SlimSAM on WASM). */
export async function segmentBoardPieces(
    imageSrc: string,
    items: DetectedItem[],
    onProgress?: (p: SegmentProgress) => void,
    signal?: AbortSignal
): Promise<{ pieces: BoardPiece[]; width: number; height: number }> {
    onProgress?.({ stage: 'loading-model' });
    const [{ tf, model, processor }, img] = await Promise.all([loadSam(), loadImage(imageSrc)]);
    throwIfAborted(signal);
    const { RawImage, Tensor } = tf as any;
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    // Draw once into a canvas: source of pixels for both RawImage and the cutouts
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = W;
    srcCanvas.height = H;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) throw new Error('Canvas 2D context unavailable');
    srcCtx.drawImage(img, 0, 0);

    onProgress?.({ stage: 'embedding' });
    const rgba = srcCtx.getImageData(0, 0, W, H).data;
    const rgb = new Uint8ClampedArray(W * H * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];
        rgb[j + 1] = rgba[i + 1];
        rgb[j + 2] = rgba[i + 2];
    }
    const image = new RawImage(rgb, W, H, 3);
    const imageInputs = await processor(image);
    const imageEmbeddings = await model.get_image_embeddings(imageInputs);
    const [origH, origW] = imageInputs.original_sizes[0];
    const [reH, reW] = imageInputs.reshaped_input_sizes[0];
    const scaleX = reW / origW;
    const scaleY = reH / origH;

    const pieces: BoardPiece[] = [];
    let done = 0;
    onProgress?.({ stage: 'cutting', done, total: items.length });

    for (const item of items) {
        throwIfAborted(signal);
        const [y0, x0, y1, x1] = item.box_2d;
        const bx0 = (x0 / 1000) * W;
        const by0 = (y0 / 1000) * H;
        const bx1 = (x1 / 1000) * W;
        const by1 = (y1 / 1000) * H;
        if (bx1 - bx0 < 4 || by1 - by0 < 4) { done++; continue; }

        // 5 positive point prompts: center + inset quarters (box prompts are not
        // supported by transformers.js SamProcessor; this matches it closely)
        const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
        const dx = (bx1 - bx0) / 4, dy = (by1 - by0) / 4;
        const pts = [[cx, cy], [cx - dx, cy - dy], [cx + dx, cy - dy], [cx - dx, cy + dy], [cx + dx, cy + dy]];
        const flat = new Float32Array(pts.length * 2);
        pts.forEach(([px, py], i) => {
            flat[i * 2] = px * scaleX;
            flat[i * 2 + 1] = py * scaleY;
        });
        const input_points = new Tensor('float32', flat, [1, 1, pts.length, 2]);
        const input_labels = new Tensor('int64', BigInt64Array.from(pts.map(() => 1n)), [1, 1, pts.length]);

        const outputs = await model({ ...imageEmbeddings, input_points, input_labels });
        const masks = (await processor.post_process_masks(
            outputs.pred_masks, imageInputs.original_sizes, imageInputs.reshaped_input_sizes
        ))[0];
        const scores = outputs.iou_scores.data as Float32Array;
        const numMasks = masks.dims[1] as number;
        const mW = masks.dims[3] as number;
        let best = 0;
        for (let i = 1; i < numMasks; i++) if (scores[i] > scores[best]) best = i;
        const maskData = masks.data;
        const maskOffset = best * (masks.dims[2] as number) * mW;

        // Build the transparent cutout, cropped to the (padded) box
        const left = Math.max(0, Math.floor(bx0) - CUTOUT_PAD);
        const top = Math.max(0, Math.floor(by0) - CUTOUT_PAD);
        const right = Math.min(W, Math.ceil(bx1) + CUTOUT_PAD);
        const bottom = Math.min(H, Math.ceil(by1) + CUTOUT_PAD);
        const cw = right - left, ch = bottom - top;
        const cutCanvas = document.createElement('canvas');
        cutCanvas.width = cw;
        cutCanvas.height = ch;
        const cutCtx = cutCanvas.getContext('2d');
        if (!cutCtx) throw new Error('Canvas 2D context unavailable');
        const cutData = cutCtx.createImageData(cw, ch);
        let on = 0;
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                const gx = left + x, gy = top + y;
                const si = (gy * W + gx) * 4;
                const di = (y * cw + x) * 4;
                if (maskData[maskOffset + gy * mW + gx]) {
                    cutData.data[di] = rgba[si];
                    cutData.data[di + 1] = rgba[si + 1];
                    cutData.data[di + 2] = rgba[si + 2];
                    cutData.data[di + 3] = 255;
                    on++;
                }
            }
        }
        cutCtx.putImageData(cutData, 0, 0);
        const coverage = on / (cw * ch);
        pieces.push({
            id: Math.random().toString(36).substring(2, 11),
            label: item.label,
            src: cutCanvas.toDataURL('image/png'),
            x: left,
            y: top,
            width: cw,
            height: ch,
            lowConfidence: coverage < 0.02 || coverage > 0.985,
        });
        done++;
        onProgress?.({ stage: 'cutting', done, total: items.length });
    }

    return { pieces, width: W, height: H };
}

/** Average the border pixels of an image — used as the editor's background plate color. */
export function sampleBackgroundColor(img: HTMLImageElement): string {
    const canvas = document.createElement('canvas');
    const w = (canvas.width = Math.min(img.naturalWidth, 400));
    const h = (canvas.height = Math.min(img.naturalHeight, 400));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#e8e4dc';
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    const margin = 6;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x > margin && x < w - margin && y > margin && y < h - margin) continue;
            const i = (y * w + x) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
    }
    if (!n) return '#e8e4dc';
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}
