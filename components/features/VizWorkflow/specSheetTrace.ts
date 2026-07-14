// Raster → vector tracer for the Spec Sheet / DXF export.
//
// Turns an AI-generated CAD-style line drawing (black lines on a white
// background) into clean, editable vector polylines:
//   • outline  — the object's filled silhouette boundary (flood-filled from the
//                image border so an outlined-but-hollow drawing still yields a
//                single closed profile)
//   • detail   — interior ink strokes (drawer lines, panel joints, etc.)
//
// Pure, dependency-free, browser-only (uses <canvas>). Returns coordinates in
// the down-scaled image pixel space (origin top-left, Y down). The DXF
// assembler is responsible for scaling to real-world mm and flipping Y.

export type Pt = [number, number];

export interface TraceResult {
    outline: Pt[][];
    detail: Pt[][];
    width: number;
    height: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export interface TraceOptions {
    /** Down-scale the longest side to this many px before tracing (perf + smoothing). */
    maxDim?: number;
    /** Luminance ≥ this (0..255) is treated as a background candidate for the flood fill. */
    whiteThreshold?: number;
    /** Luminance ≤ this (0..255) is treated as ink when tracing interior detail. */
    inkThreshold?: number;
    /** Douglas–Peucker tolerance, in px. Higher = fewer vertices. */
    simplifyTol?: number;
    /** Drop contours whose perimeter is below this (px). */
    minPerimeter?: number;
    /** Also trace interior ink strokes. */
    detail?: boolean;
    /** Cap on the number of detail contours kept (largest by perimeter). */
    maxContours?: number;
}

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function perimeter(pl: Pt[]): number {
    let s = 0;
    for (let i = 1; i < pl.length; i++) s += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    return s;
}

// Iterative Douglas–Peucker for an OPEN polyline; keeps the first & last point.
function rdpOpen(points: Pt[], eps: number): Pt[] {
    if (points.length < 3) return points.slice();
    const keep = new Array<boolean>(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const stack: Array<[number, number]> = [[0, points.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop()!;
        if (e <= s + 1) continue;
        const [ax, ay] = points[s];
        const [bx, by] = points[e];
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        let maxD = -1;
        let idx = -1;
        for (let i = s + 1; i < e; i++) {
            const [px, py] = points[i];
            const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > eps && idx > 0) {
            keep[idx] = true;
            stack.push([s, idx], [idx, e]);
        }
    }
    const out: Pt[] = [];
    for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
    return out;
}

// Douglas–Peucker that also handles CLOSED loops (first === last). A closed
// loop has no natural baseline — seeding the open algorithm with the
// first===last (zero-length) baseline collapses the whole loop to a point. So
// split the loop at the vertex farthest from the start, simplify the two arcs
// independently, then re-close.
function rdp(points: Pt[], eps: number): Pt[] {
    const n = points.length;
    if (n < 3) return points.slice();
    const closed = points[0][0] === points[n - 1][0] && points[0][1] === points[n - 1][1];
    if (!closed) return rdpOpen(points, eps);

    const open = points.slice(0, n - 1); // drop duplicate closing vertex
    if (open.length < 3) return points.slice();
    const [ox, oy] = open[0];
    let far = 0;
    let farD = -1;
    for (let i = 1; i < open.length; i++) {
        const d = Math.hypot(open[i][0] - ox, open[i][1] - oy);
        if (d > farD) { farD = d; far = i; }
    }
    const arcA = rdpOpen(open.slice(0, far + 1), eps); // [0 .. far]
    const arcB = rdpOpen(open.slice(far), eps);        // [far .. end]
    const merged = arcA.concat(arcB.slice(1));         // de-dup shared vertex at `far`
    merged.push([open[0][0], open[0][1]]);             // re-close
    return merged;
}

// Flood fill the background (near-white, reachable from any border pixel).
// Everything NOT flagged background becomes the filled object mask.
function backgroundMask(data: Uint8ClampedArray, w: number, h: number, whiteThr: number): Uint8Array {
    const bg = new Uint8Array(w * h);
    const isWhite = (idx: number) => luminance(data[idx * 4], data[idx * 4 + 1], data[idx * 4 + 2]) >= whiteThr;
    const stack: number[] = [];
    const pushIf = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const idx = y * w + x;
        if (bg[idx]) return;
        if (isWhite(idx)) { bg[idx] = 1; stack.push(idx); }
    };
    for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
    for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }
    while (stack.length) {
        const idx = stack.pop()!;
        const x = idx % w;
        const y = (idx / w) | 0;
        pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
    }
    return bg;
}

// Marching squares on a binary mask → a set of (possibly closed) polylines.
function marchingSquares(mask: Uint8Array, w: number, h: number): Pt[][] {
    type Seg = [number, number, number, number];
    const segs: Seg[] = [];
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);

    for (let y = -1; y < h; y++) {
        for (let x = -1; x < w; x++) {
            const tl = at(x, y);
            const tr = at(x + 1, y);
            const br = at(x + 1, y + 1);
            const bl = at(x, y + 1);
            if (tl === tr && tr === br && br === bl) continue; // all in or all out

            const top: Pt = [x + 0.5, y];
            const right: Pt = [x + 1, y + 0.5];
            const bottom: Pt = [x + 0.5, y + 1];
            const left: Pt = [x, y + 0.5];

            const cross: Pt[] = [];
            if (!!tl !== !!tr) cross.push(top);
            if (!!tr !== !!br) cross.push(right);
            if (!!br !== !!bl) cross.push(bottom);
            if (!!bl !== !!tl) cross.push(left);

            if (cross.length === 2) {
                segs.push([cross[0][0], cross[0][1], cross[1][0], cross[1][1]]);
            } else if (cross.length === 4) {
                // Saddle — fixed resolution (top↔left, bottom↔right).
                segs.push([top[0], top[1], left[0], left[1]]);
                segs.push([bottom[0], bottom[1], right[0], right[1]]);
            }
        }
    }
    return stitch(segs);
}

// Join undirected edge segments end-to-end into polylines/loops.
function stitch(segs: Array<[number, number, number, number]>): Pt[][] {
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const nodes = new Map<string, { pt: Pt; links: string[] }>();
    const ensure = (p: Pt) => {
        const k = key(p[0], p[1]);
        if (!nodes.has(k)) nodes.set(k, { pt: p, links: [] });
        return k;
    };
    const edgeId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const segKeys: Array<[string, string]> = [];
    for (const s of segs) {
        const a = ensure([s[0], s[1]]);
        const b = ensure([s[2], s[3]]);
        if (a === b) continue;
        nodes.get(a)!.links.push(b);
        nodes.get(b)!.links.push(a);
        segKeys.push([a, b]);
    }

    const visited = new Set<string>();
    const polylines: Pt[][] = [];
    for (const [a0, b0] of segKeys) {
        const e0 = edgeId(a0, b0);
        if (visited.has(e0)) continue;
        visited.add(e0);
        const line: Pt[] = [nodes.get(a0)!.pt, nodes.get(b0)!.pt];
        let prev = a0;
        let cur = b0;
        while (true) {
            const node = nodes.get(cur)!;
            let next: string | null = null;
            for (const nb of node.links) {
                if (nb === prev) continue;
                const e = edgeId(cur, nb);
                if (visited.has(e)) continue;
                next = nb;
                break;
            }
            if (next === null) break;
            visited.add(edgeId(cur, next));
            line.push(nodes.get(next)!.pt);
            prev = cur;
            cur = next;
            if (cur === a0) break; // closed the loop
        }
        polylines.push(line);
    }
    return polylines;
}

export async function traceImage(src: string, opts: TraceOptions = {}): Promise<TraceResult> {
    const {
        maxDim = 700,
        whiteThreshold = 232,
        inkThreshold = 95,
        simplifyTol = 1.4,
        minPerimeter = 18,
        detail = true,
        maxContours = 800,
    } = opts;

    const img = await loadImage(src);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return { outline: [], detail: [], width: 0, height: 0, bbox: null };

    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return { outline: [], detail: [], width: w, height: h, bbox: null };
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // Filled object silhouette.
    const bg = backgroundMask(data, w, h, whiteThreshold);
    const obj = new Uint8Array(w * h);
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let any = false;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!bg[i]) {
                obj[i] = 1;
                any = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    const bbox = any ? { minX, minY, maxX, maxY } : null;

    const refine = (plines: Pt[][]): Pt[][] =>
        plines
            .map((pl) => rdp(pl, simplifyTol))
            .filter((pl) => pl.length >= 2 && perimeter(pl) >= minPerimeter);

    const outline = refine(marchingSquares(obj, w, h));

    let det: Pt[][] = [];
    if (detail) {
        const ink = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
            ink[i] = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) <= inkThreshold ? 1 : 0;
        }
        det = refine(marchingSquares(ink, w, h));
        if (det.length > maxContours) {
            det = det
                .map((pl) => ({ pl, p: perimeter(pl) }))
                .sort((a, b) => b.p - a.p)
                .slice(0, maxContours)
                .map((e) => e.pl);
        }
    }

    return { outline, detail: det, width: w, height: h, bbox };
}
