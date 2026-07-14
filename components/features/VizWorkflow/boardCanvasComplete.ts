"use client";
// AI piece completion for the Board Canvas editor.
//
// SAM cutouts are only as good as what's visible: overlapped pieces come out with
// bites missing where neighbours covered them, and sloppy masks drag in fragments of
// other items. This module sends each cutout (isolated on white) to Nano Banana with
// instructions to re-create the SAME item COMPLETE — reconstructing hidden parts and
// removing foreign fragments — then flood-fill white-keys the result back into a
// transparent PNG piece for the canvas.

export type CompletedPiece = { src: string; width: number; height: number };

// The object is requested on a MAGENTA background: material boards are full of white,
// cream and light-grey samples, which a white background key would eat into. Nothing
// on a material board is pure magenta, so a chroma key is categorically safe.
//
// Two reference images are sent: the isolated cutout AND the original board with a red
// box marking the piece. Without the board context the model treats big occlusion bites
// (stair-steps, L-shapes) as the item's intended design and faithfully reproduces the
// damage; seeing the overlap on the board lets it reconstruct the true silhouette.
const buildPrompt = (label: string) => `You are restoring ONE damaged item from an interior-design flat-lay material board.
IMAGE 1: an automatic cutout of the item, isolated on white: "${label}". The cutout is DAMAGED.
IMAGE 2: the full original board photo, with a RED BOX marking where this item sits. Other items overlap it there.
The cutout has two kinds of damage — fix BOTH:
1. FOREIGN FRAGMENTS: parts of OTHER items or background that leaked into the cutout. Compare with IMAGE 2 — anything that belongs to a different item on the board must be REMOVED.
2. MISSING AREAS: wherever another item covered this one, the cutout has holes, notches, stair-steps or L-shaped bites. Those are NOT the item's real shape — material samples are simple complete shapes (full rectangles, squares, strips, circles, or natural torn-edge swatches). RECONSTRUCT the item's complete natural silhouette, extending its material seamlessly with the same color, texture, pattern, grain and lighting.
Re-create ONLY the complete, undamaged "${label}", from the same top-down camera angle and the same orientation as on the board. Do NOT restyle it, do NOT change its colors, do NOT include any other item.
Output: the single complete item centered on a SOLID PURE MAGENTA (#FF00FF) background, filling 70-85% of the frame, photorealistic. No shadows, no text, no labels. Return EXACTLY ONE IMAGE.`;

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image failed to load'));
        img.src = src;
    });
}

type KeyMode = 'magenta' | 'white';

// Background tests. JPEG round-trips shift colors, so both have tolerance built in.
// Magenta strict/loose look at how far red AND blue rise above green — white, grey and
// virtually every real material fail that test, so the fill cannot leak into the object.
const isBgPixel = (d: Uint8ClampedArray, i: number, mode: KeyMode, loose: boolean): boolean => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (mode === 'magenta') {
        const margin = loose ? 35 : 70;
        return r - g > margin && b - g > margin;
    }
    const thr = 240;
    return r >= thr && g >= thr && b >= thr;
};

// Key out the background and tight-crop to the object.
// - magenta: GLOBAL chroma key (no connectivity assumption — nothing on a material
//   board is saturated magenta), then two loose-test dilation passes for the JPEG halo.
// - white: border flood fill only, because whites are common INSIDE objects.
function keyAndCrop(el: HTMLImageElement, mode: KeyMode): CompletedPiece {
    const W = el.naturalWidth, H = el.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(el, 0, 0);
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const bg = new Uint8Array(W * H);
    if (mode === 'magenta') {
        for (let i = 0; i < W * H; i++) if (isBgPixel(d, i, 'magenta', false)) bg[i] = 1;
        for (let pass = 0; pass < 2; pass++) {
            const halo: number[] = [];
            for (let i = 0; i < W * H; i++) {
                if (bg[i]) continue;
                const x = i % W, y = (i / W) | 0;
                const nearBg = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]);
                if (nearBg && isBgPixel(d, i, 'magenta', true)) halo.push(i);
            }
            for (const i of halo) bg[i] = 1;
        }
    } else {
        const stack: number[] = [];
        const seed = (i: number) => { if (!bg[i] && isBgPixel(d, i, 'white', false)) { bg[i] = 1; stack.push(i); } };
        for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
        while (stack.length) {
            const i = stack.pop()!;
            const x = i % W, y = (i / W) | 0;
            if (x > 0) seed(i - 1);
            if (x < W - 1) seed(i + 1);
            if (y > 0) seed(i - W);
            if (y < H - 1) seed(i + W);
        }
    }
    let minX = W, minY = H, maxX = -1, maxY = -1, on = 0;
    for (let i = 0; i < W * H; i++) {
        if (bg[i]) {
            d[i * 4 + 3] = 0;
        } else {
            on++;
            const x = i % W, y = (i / W) | 0;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    const coverage = on / (W * H);
    if (maxX < 0 || coverage < 0.02) throw new Error('Completion keying produced an empty image');
    if (coverage > 0.985) throw new Error(`Completion keying failed — background is not ${mode}`);
    ctx.putImageData(imgData, 0, 0);
    const objW = maxX - minX + 1, objH = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = objW;
    out.height = objH;
    const outCtx = out.getContext('2d');
    if (!outCtx) throw new Error('Canvas 2D context unavailable');
    outCtx.drawImage(canvas, minX, minY, objW, objH, 0, 0, objW, objH);
    return { src: out.toDataURL('image/png'), width: objW, height: objH };
}

/** Original board with a red box marking the piece — scaled to keep the payload small. */
function buildAnnotatedBoard(
    board: HTMLImageElement,
    rect: { x: number; y: number; width: number; height: number }
): string {
    const scale = Math.min(1, 1024 / Math.max(board.naturalWidth, board.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(board.naturalWidth * scale);
    canvas.height = Math.round(board.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(board, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = Math.max(3, Math.round(6 * scale));
    ctx.strokeRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
    return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Re-generate one cutout piece as a complete, undamaged object (Nano Banana edit),
 * returning a tight-cropped transparent PNG. Throws on abort or generation failure.
 */
export async function completePiece(
    cutout: HTMLImageElement,
    label: string,
    board: HTMLImageElement,
    boardRect: { x: number; y: number; width: number; height: number },
    signal?: AbortSignal
): Promise<CompletedPiece> {
    // Isolate the cutout on white with a margin so the model sees a clean single item
    const w = cutout.naturalWidth, h = cutout.naturalHeight;
    if (w < 4 || h < 4) throw new Error('Piece too small to complete');
    const mx = Math.round(w * 0.15), my = Math.round(h * 0.15);
    const canvas = document.createElement('canvas');
    canvas.width = w + mx * 2;
    canvas.height = h + my * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cutout, mx, my);
    const maskedJpeg = canvas.toDataURL('image/jpeg', 0.92);
    const annotatedBoard = buildAnnotatedBoard(board, boardRect);

    throwIfAborted(signal);
    const res = await fetch('/api/imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: buildPrompt(label),
            targetModel: 'nano-banana',
            singleImage: true,
            imageData: [maskedJpeg, annotatedBoard],
        }),
        signal,
    });
    if (!res.ok) {
        let msg = `Completion failed (${res.status})`;
        try { msg = (await res.json()).error || msg; } catch { /* non-JSON body */ }
        throw new Error(msg);
    }
    const data = await res.json();
    if (!data.images?.[0]) throw new Error('Completion returned no image');

    const el = await loadImage(data.images[0]);
    throwIfAborted(signal);
    try {
        return keyAndCrop(el, 'magenta');
    } catch {
        // model ignored the magenta-background instruction — try a white key before failing
        return keyAndCrop(el, 'white');
    }
}

const SWAP_PROMPT = (fromLabel: string, toLabel: string) => `The image shows ONE material sample piece from an interior-design flat-lay material board, isolated on white: "${fromLabel}".
Re-create this piece keeping its EXACT same silhouette, shape, size, orientation and top-down camera angle — but made of a COMPLETELY DIFFERENT material: "${toLabel}".
- Render the new material realistically: correct color, texture, pattern, grain and sheen, filling the same shape.
- If the original shape has damage (notches, stair-steps or bites from overlapping items), output the complete natural shape instead.
- Do NOT keep any of the original material's color or pattern, and do NOT add any other objects.
Output: the single piece centered on a SOLID PURE MAGENTA (#FF00FF) background, filling 70-85% of the frame, photorealistic. No shadows, no text, no labels. Return EXACTLY ONE IMAGE.`;

/**
 * Re-render an existing piece in a different material, keeping its shape and pose —
 * turns an imported template's pieces into the project's own materials.
 */
export async function swapPieceMaterial(
    piece: HTMLImageElement,
    fromLabel: string,
    toLabel: string,
    signal?: AbortSignal
): Promise<CompletedPiece> {
    const w = piece.naturalWidth, h = piece.naturalHeight;
    if (w < 4 || h < 4) throw new Error('Piece too small to swap');
    const mx = Math.round(w * 0.15), my = Math.round(h * 0.15);
    const canvas = document.createElement('canvas');
    canvas.width = w + mx * 2;
    canvas.height = h + my * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(piece, mx, my);
    const pieceJpeg = canvas.toDataURL('image/jpeg', 0.92);

    throwIfAborted(signal);
    const res = await fetch('/api/imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: SWAP_PROMPT(fromLabel, toLabel),
            targetModel: 'nano-banana',
            singleImage: true,
            imageData: pieceJpeg,
        }),
        signal,
    });
    if (!res.ok) {
        let msg = `Material swap failed (${res.status})`;
        try { msg = (await res.json()).error || msg; } catch { /* non-JSON body */ }
        throw new Error(msg);
    }
    const data = await res.json();
    if (!data.images?.[0]) throw new Error('Material swap returned no image');

    const el = await loadImage(data.images[0]);
    throwIfAborted(signal);
    try {
        return keyAndCrop(el, 'magenta');
    } catch {
        return keyAndCrop(el, 'white');
    }
}

const MATERIALIZE_PROMPT = (label: string) => `This photo shows a physical material / finish sample: "${label}". It may be photographed at an angle, in a room, on a desk, held in a hand, or under uneven lighting.
Extract the MAIN material in the photo and re-render it as a clean, professional TOP-DOWN FLAT-LAY material swatch for an interior-design material board:
- Preserve the material's true color, texture, pattern, grain and sheen — do NOT restyle or recolor it.
- Give it a natural sample shape: a neat rectangle/square tile, plank, or fabric swatch with a natural edge — whichever suits the material.
- Perfectly flat top-down view, soft even studio lighting. Remove hands, backgrounds, room context, perspective distortion, glare and reflections.
Output: the single swatch centered on a SOLID PURE MAGENTA (#FF00FF) background, filling 70-85% of the frame, photorealistic. No shadows, no text, no labels, no other objects. Return EXACTLY ONE IMAGE.`;

const OBJECTIZE_PROMPT = (label: string) => `This photo shows: "${label}". Isolate the MAIN OBJECT from the photo exactly as it appears — keep its exact appearance, camera angle, pose, colors, materials and lighting. Do NOT restyle it, re-pose it, flatten it, or re-render it from a different angle.
Completely remove the background, any hands, and any surrounding items or context.
Output: the unchanged object centered on a SOLID PURE MAGENTA (#FF00FF) background, filling 70-85% of the frame, photorealistic. No shadows, no text, no labels, no other objects. Return EXACTLY ONE IMAGE.`;

// shared plumbing: downscale a photo, run a Nano Banana edit, chroma-key the result
async function photoToPiece(
    photo: HTMLImageElement,
    prompt: string,
    errLabel: string,
    signal?: AbortSignal
): Promise<CompletedPiece> {
    const scale = Math.min(1, 1280 / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(4, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(4, Math.round(photo.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    const photoJpeg = canvas.toDataURL('image/jpeg', 0.9);

    throwIfAborted(signal);
    const res = await fetch('/api/imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            targetModel: 'nano-banana',
            singleImage: true,
            imageData: photoJpeg,
        }),
        signal,
    });
    if (!res.ok) {
        let msg = `${errLabel} failed (${res.status})`;
        try { msg = (await res.json()).error || msg; } catch { /* non-JSON body */ }
        throw new Error(msg);
    }
    const data = await res.json();
    if (!data.images?.[0]) throw new Error(`${errLabel} returned no image`);

    const el = await loadImage(data.images[0]);
    throwIfAborted(signal);
    try {
        return keyAndCrop(el, 'magenta');
    } catch {
        return keyAndCrop(el, 'white');
    }
}

/**
 * Convert a user-uploaded photo of a material into a clean flat-lay swatch piece
 * (Nano Banana edit + chroma key). Same return contract as completePiece.
 */
export function materializePhoto(photo: HTMLImageElement, label: string, signal?: AbortSignal): Promise<CompletedPiece> {
    return photoToPiece(photo, MATERIALIZE_PROMPT(label), 'Material conversion', signal);
}

/**
 * Cut the main object out of a user-uploaded photo unchanged (furniture, props),
 * removing only the background — the board-friendly version of "upload as-is".
 */
export function objectizePhoto(photo: HTMLImageElement, label: string, signal?: AbortSignal): Promise<CompletedPiece> {
    return photoToPiece(photo, OBJECTIZE_PROMPT(label), 'Object cutout', signal);
}
