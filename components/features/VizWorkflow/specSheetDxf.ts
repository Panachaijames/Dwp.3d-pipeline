// DXF (AutoCAD R12 / AC1009 ASCII) writer + FF&E spec-sheet assembler.
//
// R12 is the most universally importable CAD interchange format: no entity
// handles, no OBJECTS/CLASSES sections, opened natively by AutoCAD, Revit,
// SketchUp, LibreCAD, Illustrator, etc. (each can then "Save As .dwg").
// Geometry is emitted in millimetres, Y-up (true CAD orientation).

import type { Pt, TraceResult } from './specSheetTrace';

export type DPt = [number, number];

const ACI = { white: 7, red: 1, yellow: 2, green: 3, cyan: 4, blue: 5, magenta: 6, gray: 8, ltgray: 9 } as const;

const fmt = (n: number): string => {
    if (!Number.isFinite(n)) n = 0;
    return (Math.round(n * 1e6) / 1e6).toString();
};

// DXF TEXT is single-line ASCII; strip newlines and non-ASCII.
const sanitize = (s: string): string =>
    (s || '')
        .replace(/[\r\n]+/g, ' ')
        // eslint-disable-next-line no-control-regex
        .replace(/[^\x20-\x7E]/g, '')
        .trim();

interface LayerDef { name: string; color: number; }

export class DxfBuilder {
    private layers = new Map<string, LayerDef>();
    private body: string[] = [];
    private min: DPt = [Infinity, Infinity];
    private max: DPt = [-Infinity, -Infinity];

    layer(name: string, color: number = ACI.white): string {
        if (!this.layers.has(name)) this.layers.set(name, { name, color });
        return name;
    }

    private bump(x: number, y: number) {
        if (x < this.min[0]) this.min[0] = x;
        if (y < this.min[1]) this.min[1] = y;
        if (x > this.max[0]) this.max[0] = x;
        if (y > this.max[1]) this.max[1] = y;
    }

    private g(code: number, val: string | number) {
        this.body.push(String(code));
        this.body.push(typeof val === 'number' ? fmt(val) : val);
    }

    line(a: DPt, b: DPt, layer = '0') {
        this.layer(layer);
        this.bump(a[0], a[1]);
        this.bump(b[0], b[1]);
        this.g(0, 'LINE');
        this.g(8, layer);
        this.g(10, a[0]); this.g(20, a[1]); this.g(30, 0);
        this.g(11, b[0]); this.g(21, b[1]); this.g(31, 0);
    }

    polyline(pts: DPt[], layer = '0', closed = false) {
        if (pts.length < 2) return;
        this.layer(layer);
        this.g(0, 'POLYLINE');
        this.g(8, layer);
        this.g(66, 1);
        this.g(70, closed ? 1 : 0);
        this.g(10, 0); this.g(20, 0); this.g(30, 0);
        for (const p of pts) {
            this.bump(p[0], p[1]);
            this.g(0, 'VERTEX');
            this.g(8, layer);
            this.g(10, p[0]); this.g(20, p[1]); this.g(30, 0);
        }
        this.g(0, 'SEQEND');
        this.g(8, layer);
    }

    rect(x: number, y: number, w: number, h: number, layer = '0') {
        this.polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], layer, true);
    }

    text(
        pos: DPt,
        height: number,
        value: string,
        layer = '0',
        opts: { rotation?: number; align?: 'left' | 'center' | 'right'; valign?: 'base' | 'bottom' | 'middle' | 'top' } = {},
    ) {
        const v = sanitize(value);
        if (!v) return;
        this.layer(layer);
        this.bump(pos[0], pos[1]);
        const hj = opts.align === 'center' ? 1 : opts.align === 'right' ? 2 : 0;
        const vj = opts.valign === 'bottom' ? 1 : opts.valign === 'middle' ? 2 : opts.valign === 'top' ? 3 : 0;
        this.g(0, 'TEXT');
        this.g(8, layer);
        this.g(10, pos[0]); this.g(20, pos[1]); this.g(30, 0);
        this.g(40, height);
        this.g(1, v);
        if (opts.rotation) this.g(50, opts.rotation);
        if (hj || vj) {
            this.g(72, hj);
            this.g(73, vj);
            this.g(11, pos[0]); this.g(21, pos[1]); this.g(31, 0);
        }
    }

    // Arrowhead at `tip`, barbs opening back toward `from`.
    private arrow(tip: DPt, from: DPt, size: number, layer: string) {
        const dx = tip[0] - from[0];
        const dy = tip[1] - from[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const back: DPt = [tip[0] - ux * size, tip[1] - uy * size];
        const a = Math.PI / 9; // ~20°
        const rot = (ang: number): DPt => {
            const c = Math.cos(ang);
            const s = Math.sin(ang);
            const vx = back[0] - tip[0];
            const vy = back[1] - tip[1];
            return [tip[0] + vx * c - vy * s, tip[1] + vx * s + vy * c];
        };
        this.line(tip, rot(a), layer);
        this.line(tip, rot(-a), layer);
    }

    /** Horizontal linear dimension between x1..x2; object edge at objEdgeY, dim line at dimY. */
    dimH(x1: number, x2: number, objEdgeY: number, dimY: number, value: string, h: number, layer = 'DIMENSIONS') {
        this.line([x1, objEdgeY], [x1, dimY + Math.sign(dimY - objEdgeY) * h * 0.4], layer);
        this.line([x2, objEdgeY], [x2, dimY + Math.sign(dimY - objEdgeY) * h * 0.4], layer);
        this.line([x1, dimY], [x2, dimY], layer);
        const arr = h * 1.1;
        this.arrow([x1, dimY], [x2, dimY], arr, layer);
        this.arrow([x2, dimY], [x1, dimY], arr, layer);
        this.text([(x1 + x2) / 2, dimY + h * 0.5], h, value, layer, { align: 'center', valign: 'bottom' });
    }

    /** Vertical linear dimension between y1..y2; object edge at objEdgeX, dim line at dimX. */
    dimV(y1: number, y2: number, objEdgeX: number, dimX: number, value: string, h: number, layer = 'DIMENSIONS') {
        this.line([objEdgeX, y1], [dimX + Math.sign(dimX - objEdgeX) * h * 0.4, y1], layer);
        this.line([objEdgeX, y2], [dimX + Math.sign(dimX - objEdgeX) * h * 0.4, y2], layer);
        this.line([dimX, y1], [dimX, y2], layer);
        const arr = h * 1.1;
        this.arrow([dimX, y1], [dimX, y2], arr, layer);
        this.arrow([dimX, y2], [dimX, y1], arr, layer);
        this.text([dimX - h * 0.5, (y1 + y2) / 2], h, value, layer, { align: 'center', valign: 'bottom', rotation: 90 });
    }

    toDxf(): string {
        if (this.layers.size === 0) this.layer('0', ACI.white);
        const L: string[] = [];
        const w = (code: number, val: string | number) => {
            L.push(String(code));
            L.push(typeof val === 'number' ? fmt(val) : val);
        };

        w(0, 'SECTION'); w(2, 'HEADER');
        w(9, '$ACADVER'); w(1, 'AC1009');
        if (Number.isFinite(this.min[0])) {
            w(9, '$EXTMIN'); w(10, this.min[0]); w(20, this.min[1]); w(30, 0);
            w(9, '$EXTMAX'); w(10, this.max[0]); w(20, this.max[1]); w(30, 0);
        }
        w(0, 'ENDSEC');

        w(0, 'SECTION'); w(2, 'TABLES');
        w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1);
        w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, 0);
        w(0, 'ENDTAB');
        w(0, 'TABLE'); w(2, 'LAYER'); w(70, this.layers.size);
        for (const ld of this.layers.values()) {
            w(0, 'LAYER'); w(2, ld.name); w(70, 0); w(62, ld.color); w(6, 'CONTINUOUS');
        }
        w(0, 'ENDTAB');
        w(0, 'ENDSEC');

        w(0, 'SECTION'); w(2, 'ENTITIES');
        for (const s of this.body) L.push(s);
        w(0, 'ENDSEC');
        w(0, 'EOF');
        return L.join('\r\n') + '\r\n';
    }
}

// ---------------------------------------------------------------------------
// Spec-sheet assembly
// ---------------------------------------------------------------------------

const TO_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export interface SpecDims {
    width: number | null;
    depth: number | null;
    height: number | null;
    unit: string;
}

export interface BuildDxfOptions {
    title: string;
    project: string;
    area: string;
    note: string;
    materials: string[];
    dims: SpecDims;
    front: TraceResult | null;
    side: TraceResult | null;
    plan: TraceResult | null;
}

// Map a trace's polylines (image px, Y-down) into a target mm box, Y-up,
// scaled uniformly to fit and centred.
function placeTrace(
    builder: DxfBuilder,
    trace: TraceResult | null,
    box: [number, number],
    ox: number,
    oy: number,
    layerOutline: string,
    layerDetail: string,
) {
    if (!trace || !trace.bbox) return;
    const [bw, bh] = box;
    const { minX, minY, maxX, maxY } = trace.bbox;
    const srcW = Math.max(1, maxX - minX);
    const srcH = Math.max(1, maxY - minY);
    const s = Math.min(bw / srcW, bh / srcH);
    const cw = srcW * s;
    const ch = srcH * s;
    const padX = (bw - cw) / 2;
    const padY = (bh - ch) / 2;

    const map = (p: Pt): DPt => {
        const localX = (p[0] - minX) * s + padX;
        const localTop = (p[1] - minY) * s + padY;
        return [ox + localX, oy + (bh - localTop)];
    };
    const emit = (plines: Pt[][], layer: string) => {
        for (const pl of plines) {
            if (pl.length < 2) continue;
            const closed = pl.length > 2
                && Math.abs(pl[0][0] - pl[pl.length - 1][0]) < 1e-6
                && Math.abs(pl[0][1] - pl[pl.length - 1][1]) < 1e-6;
            const pts = (closed ? pl.slice(0, -1) : pl).map(map);
            builder.polyline(pts, layer, closed);
        }
    };
    emit(trace.detail, layerDetail);
    emit(trace.outline, layerOutline);
}

function wrap(text: string, max: number): string[] {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
        if ((cur + ' ' + word).trim().length > max) {
            if (cur) lines.push(cur);
            cur = word;
        } else {
            cur = (cur + ' ' + word).trim();
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

export function buildSpecSheetDxf(opts: BuildDxfOptions): string {
    const b = new DxfBuilder();
    const LO = b.layer('OUTLINE', ACI.white);
    const LD = b.layer('DETAIL', ACI.gray);
    const LDIM = b.layer('DIMENSIONS', ACI.red);
    const LTXT = b.layer('TEXT', ACI.blue);
    const LFRAME = b.layer('TITLEBLOCK', ACI.white);

    const f = TO_MM[opts.dims.unit] ?? 1;
    const W = (opts.dims.width ?? 0) * f;
    const D = (opts.dims.depth ?? 0) * f;
    const H = (opts.dims.height ?? 0) * f;

    // Fallbacks so the sheet still lays out if a dimension is missing.
    const wMM = W || 1000;
    const dMM = D || 600;
    const hMM = H || 760;

    const gap = Math.max(wMM, dMM, hMM) * 0.35;
    const dimText = Math.max(wMM, dMM, hMM) * 0.045;

    // View origins (bottom-left), Y-up.
    // FRONT: bottom-left at (0,0), spans W × H.
    // SIDE : to the right of FRONT, spans D × H.
    // PLAN : below FRONT, spans W × D.
    const frontOx = 0;
    const frontOy = 0;
    const sideOx = wMM + gap;
    const sideOy = 0;
    const planOx = 0;
    const planOy = -(dMM + gap);

    // Draw each view's traced silhouette; fall back to a dimensioned envelope
    // rectangle if vectorisation produced nothing, so the DXF is always a
    // valid, dimensionally-correct drawing.
    const placeView = (trace: TraceResult | null, box: [number, number], ox: number, oy: number) => {
        if (trace && trace.bbox && trace.outline.length) {
            placeTrace(b, trace, box, ox, oy, LO, LD);
        } else {
            b.rect(ox, oy, box[0], box[1], LO);
        }
    };
    placeView(opts.front, [wMM, hMM], frontOx, frontOy);
    placeView(opts.side, [dMM, hMM], sideOx, sideOy);
    placeView(opts.plan, [wMM, dMM], planOx, planOy);

    const unit = opts.dims.unit || 'mm';
    const lbl = (mm: number, raw: number | null) => (raw != null ? `${raw} ${unit}` : `${Math.round(mm)} mm`);

    // FRONT elevation dimensions: W along bottom, H up the left.
    if (W) b.dimH(frontOx, frontOx + wMM, frontOy, frontOy - gap * 0.45, lbl(W, opts.dims.width), dimText, LDIM);
    if (H) b.dimV(frontOy, frontOy + hMM, frontOx, frontOx - gap * 0.45, lbl(H, opts.dims.height), dimText, LDIM);
    b.text([frontOx + wMM / 2, frontOy + hMM + dimText * 1.6], dimText * 1.1, 'FRONT ELEVATION', LTXT, { align: 'center' });

    // SIDE elevation: D along bottom, H up the right.
    if (D) b.dimH(sideOx, sideOx + dMM, sideOy, sideOy - gap * 0.45, lbl(D, opts.dims.depth), dimText, LDIM);
    if (H) b.dimV(sideOy, sideOy + hMM, sideOx + dMM, sideOx + dMM + gap * 0.45, lbl(H, opts.dims.height), dimText, LDIM);
    b.text([sideOx + dMM / 2, sideOy + hMM + dimText * 1.6], dimText * 1.1, 'SIDE ELEVATION', LTXT, { align: 'center' });

    // PLAN view: W along bottom, D up the right.
    if (W) b.dimH(planOx, planOx + wMM, planOy, planOy - gap * 0.45, lbl(W, opts.dims.width), dimText, LDIM);
    if (D) b.dimV(planOy, planOy + dMM, planOx + wMM, planOx + wMM + gap * 0.45, lbl(D, opts.dims.depth), dimText, LDIM);
    b.text([planOx + wMM / 2, planOy + dMM + dimText * 1.6], dimText * 1.1, 'PLAN VIEW', LTXT, { align: 'center' });

    // Title block — a framed band below the lowest view.
    const blockTop = planOy - gap * 1.1;
    const blockW = sideOx + dMM;
    const th = dimText;
    const lineGap = th * 1.7;
    let cursorY = blockTop;

    b.text([0, cursorY], th * 1.8, (opts.title || 'FURNITURE ITEM').toUpperCase(), LTXT, { valign: 'top' });
    cursorY -= th * 2.6;

    const meta: string[] = [];
    if (opts.project) meta.push(`PROJECT: ${opts.project}`);
    if (opts.area) meta.push(`AREA: ${opts.area}`);
    if (W || D || H) meta.push(`OVERALL SIZE: W${opts.dims.width ?? Math.round(W)} x D${opts.dims.depth ?? Math.round(D)} x H${opts.dims.height ?? Math.round(H)} ${unit}`);
    for (const line of meta) {
        b.text([0, cursorY], th, line, LTXT, { valign: 'top' });
        cursorY -= lineGap;
    }

    if (opts.materials.length) {
        b.text([0, cursorY], th, `MATERIALS & FINISHES: ${opts.materials.join(', ')}`, LTXT, { valign: 'top' });
        cursorY -= lineGap;
    }

    if (opts.note) {
        cursorY -= lineGap * 0.4;
        b.text([0, cursorY], th, 'SPECIFICATION NOTE:', LTXT, { valign: 'top' });
        cursorY -= lineGap;
        for (const line of wrap(opts.note, 90)) {
            b.text([0, cursorY], th * 0.9, line, LTXT, { valign: 'top' });
            cursorY -= lineGap * 0.95;
        }
    }

    // Outer frame around the whole sheet.
    const frameMinX = -gap * 0.7;
    const frameMaxX = blockW + gap * 0.7;
    const frameMinY = cursorY - gap * 0.4;
    const frameMaxY = Math.max(hMM, frontOy + hMM) + gap * 0.7;
    b.rect(frameMinX, frameMinY, frameMaxX - frameMinX, frameMaxY - frameMinY, LFRAME);

    return b.toDxf();
}
