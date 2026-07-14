import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Detection (labeled bounding boxes) works on Gemini 3.x; pixel-mask segmentation does NOT
// (native 2.5 masks currently leak raw <seg_*> tokens), so masks are produced client-side
// with SAM using these boxes as prompts.
const PRIMARY_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash';

const DEFAULT_HINT = 'every individual material sample swatch (stone, marble, wood, metal, fabric, carpet, cane, tile, paint samples) and any styling props (plants, objects)';

export type DetectedItem = { box_2d: [number, number, number, number]; label: string };

const buildPrompt = (hint: string) => `Detect ${hint} in this image. Do NOT detect the background surface itself.
Output a JSON list where each entry contains the 2D bounding box in the key "box_2d" as [ymin, xmin, ymax, xmax] normalized to 0-1000, and a short descriptive label in the key "label". Make each box TIGHT around its item, including any overlapped/partially hidden parts of it. Output ONLY the JSON list.`;

// Tolerant JSON-array extraction: models sometimes wrap output in prose/fences or emit trailing commas
function parseItems(text: string): DetectedItem[] {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const first = cleaned.indexOf('[');
    const last = cleaned.lastIndexOf(']');
    if (first === -1 || last <= first) throw new Error('No JSON array in response');
    cleaned = cleaned.slice(first, last + 1).replace(/,(\s*[\]}])/g, '$1');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Parsed value is not an array');
    // some models emit 0-1 normalized coords despite the 0-1000 instruction — rescale
    const boxed = parsed.filter((it: any) => it && typeof it === 'object' && Array.isArray(it.box_2d));
    if (boxed.length &&
        boxed.every((it: any) => it.box_2d.every((v: any) => typeof v === 'number' && v >= 0 && v <= 1)) &&
        boxed.some((it: any) => it.box_2d.some((v: number) => v > 0 && v < 1))) {
        for (const it of boxed) it.box_2d = it.box_2d.map((v: number) => Math.round(v * 1000));
    }
    return parsed.filter((it: any) =>
        it && typeof it === 'object' &&
        Array.isArray(it.box_2d) && it.box_2d.length === 4 &&
        it.box_2d.every((v: any) => typeof v === 'number' && v >= 0 && v <= 1000) &&
        it.box_2d[2] - it.box_2d[0] >= 4 && it.box_2d[3] - it.box_2d[1] >= 4 &&
        typeof it.label === 'string' && it.label.length > 0
    );
}

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
    }

    try {
        const { imageData, hint }: { imageData: string; hint?: string } = await request.json();
        if (!imageData) {
            return NextResponse.json({ error: 'imageData is required' }, { status: 400 });
        }

        const m = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
        const mimeType = m ? m[1] : 'image/png';
        const base64 = m ? m[2] : imageData;

        const payload = {
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType, data: base64 } },
                    { text: buildPrompt(hint || DEFAULT_HINT) },
                ],
            }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
        };

        let lastError: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            const model = attempt < 3 ? PRIMARY_MODEL : FALLBACK_MODEL;
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(20_000), // bound each attempt; observed healthy calls ~11s
                    }
                );
                if (!response.ok) {
                    const errorText = await response.text();
                    // deterministic client errors won't succeed on retry — fail fast
                    if (response.status < 500 && response.status !== 429) {
                        return NextResponse.json(
                            { error: `Detection failed (HTTP ${response.status}): ${errorText.slice(0, 300)}` },
                            { status: 502 }
                        );
                    }
                    throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 400)}`);
                }
                const result = await response.json();
                const candidate = result.candidates?.[0];
                const text = candidate?.content?.parts?.find((p: any) => p.text)?.text;
                if (!text) throw new Error('Response contained no text part');
                if (candidate?.finishReason === 'MAX_TOKENS') {
                    // truncated array: salvage the complete leading entries rather than
                    // retrying the identical payload into the same truncation
                    const cut = text.lastIndexOf('},');
                    if (cut > 0) {
                        try {
                            const items = parseItems(text.slice(0, cut + 1) + ']');
                            if (items.length > 0) return NextResponse.json({ items, model, truncated: true });
                        } catch { /* fall through to error */ }
                    }
                    return NextResponse.json({ error: 'Detection output exceeded the token limit' }, { status: 502 });
                }
                const items = parseItems(text);
                if (items.length === 0) throw new Error('No valid items detected');
                return NextResponse.json({ items, model });
            } catch (err) {
                lastError = err;
                if (attempt < 4) {
                    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, Math.min(attempt, 2))));
                }
            }
        }

        return NextResponse.json({ error: (lastError as Error)?.message || 'Detection failed after retries' }, { status: 502 });
    } catch (err: any) {
        console.error('Segment API error:', err);
        return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
    }
}
