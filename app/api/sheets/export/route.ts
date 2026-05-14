import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export const maxDuration = 60;

interface Annotation {
    id: string;
    code: string;
    x: number;
    y: number;
    note?: string;
}

interface AggregatedItem {
    code: string;
    description: string;
    quantity: number;
    locations: string;
}

interface PriceEstimate {
    code: string;
    priceLow: number;
    priceHigh: number;
    currency?: string;
    sourceNote: string;
    sources: string[];
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = 'gemini-3.1-pro-preview';
const FALLBACK_MODEL = 'gemini-3-pro-preview';

const escapeCsv = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const aggregateByCode = (annotations: Annotation[]): AggregatedItem[] => {
    const groups = new Map<string, { code: string; descriptions: string[]; count: number; locations: string[] }>();
    for (const a of annotations) {
        const key = (a.code ?? '').trim() || '(unlabeled)';
        if (!groups.has(key)) {
            groups.set(key, { code: key, descriptions: [], count: 0, locations: [] });
        }
        const g = groups.get(key)!;
        g.count++;
        const note = (a.note ?? '').trim();
        if (note && !g.descriptions.includes(note)) g.descriptions.push(note);
        g.locations.push(`(${Number(a.x).toFixed(0)},${Number(a.y).toFixed(0)})`);
    }
    return Array.from(groups.values()).map(g => ({
        code: g.code,
        description: g.descriptions.join(' / ') || g.code,
        quantity: g.count,
        locations: g.locations.join(' '),
    }));
};

const parseJsonArray = (text: string): any[] | null => {
    if (!text) return null;
    let cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .trim();
    const first = cleaned.indexOf('[');
    const last = cleaned.lastIndexOf(']');
    if (first === -1 || last === -1 || last <= first) return null;
    cleaned = cleaned.slice(first, last + 1).replace(/,(\s*[\]}])/g, '$1');
    try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const estimatePrices = async (items: AggregatedItem[]): Promise<Map<string, PriceEstimate>> => {
    const out = new Map<string, PriceEstimate>();
    if (!GEMINI_API_KEY || items.length === 0) return out;

    const prompt = `You are a furniture and interior design pricing assistant for the Thai market. For each item below, use Google Search to find the current typical retail price range in Thai Baht (THB).

Items:
${items.map((it, i) => `${i + 1}. Code "${it.code}" — ${it.description} (qty ${it.quantity})`).join('\n')}

For each item:
- Search the web for the actual product or close equivalents, prioritising Thai retailers (e.g. IKEA Thailand, SB Furniture, Index Living Mall, Modernform, Lazada/Shopee TH) when possible
- If only foreign listings exist, convert to THB at roughly 35 THB per USD and note that in sourceNote
- Provide a price range (low to high) in THB per unit (numeric, no commas, no currency symbol)
- Include a "sources" array containing the actual full URLs (https://...) you used to derive the estimate — at least 1, ideally 2–3
- Briefly explain in "sourceNote": which retailer(s) or sites you checked, whether you found an exact match or estimated from similar items, currency conversion if applicable, and any caveats
- If you truly cannot estimate, set priceLow=0 and priceHigh=0, sources=[] and explain why

Respond with ONLY a JSON array, same order as input, no markdown fences:
[
  { "code": "...", "priceLow": <number>, "priceHigh": <number>, "sources": ["https://...", "https://..."], "sourceNote": "<short explanation>" }
]`;

    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
        },
    };

    const tryModel = async (model: string) => {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
        );
        return res;
    };

    let res = await tryModel(PRIMARY_MODEL);
    if (!res.ok && (res.status === 503 || res.status === 429 || res.status === 504 || res.status === 400)) {
        console.warn(`[Sheets export] Primary model returned ${res.status}, trying fallback`);
        res = await tryModel(FALLBACK_MODEL);
    }
    if (!res.ok) {
        console.warn('[Sheets export] Price estimation failed:', res.status, await res.text());
        return out;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts.map((p: any) => p.text ?? '').join('');

    // Fallback URL pool from Gemini's groundingMetadata (used when LLM omits per-item sources)
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const fallbackUrls: string[] = groundingChunks
        .map((c: any) => c?.web?.uri)
        .filter((u: any) => typeof u === 'string' && /^https?:\/\//.test(u));

    const parsed = parseJsonArray(text);
    if (!parsed) return out;

    for (const row of parsed) {
        if (!row || typeof row.code !== 'string') continue;
        const llmSources: string[] = Array.isArray(row.sources)
            ? row.sources.filter((u: any) => typeof u === 'string' && /^https?:\/\//.test(u))
            : [];
        const sources = llmSources.length > 0 ? llmSources : fallbackUrls.slice(0, 3);
        out.set(row.code, {
            code: row.code,
            priceLow: Number(row.priceLow) || 0,
            priceHigh: Number(row.priceHigh) || 0,
            currency: typeof row.currency === 'string' ? row.currency : 'THB',
            sourceNote: typeof row.sourceNote === 'string' ? row.sourceNote : '',
            sources,
        });
    }
    return out;
};

const formatBaht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;

const formatPrice = (p?: PriceEstimate): string => {
    if (!p || (p.priceLow === 0 && p.priceHigh === 0)) return '—';
    if (p.priceLow === p.priceHigh) return formatBaht(p.priceLow);
    return `${formatBaht(p.priceLow)} – ${formatBaht(p.priceHigh)}`;
};

const formatTotal = (p: PriceEstimate | undefined, qty: number): string => {
    if (!p || (p.priceLow === 0 && p.priceHigh === 0)) return '—';
    const low = p.priceLow * qty;
    const high = p.priceHigh * qty;
    if (low === high) return formatBaht(low);
    return `${formatBaht(low)} – ${formatBaht(high)}`;
};

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        const { annotations, projectName } = (await req.json()) as {
            annotations: Annotation[];
            projectName: string;
        };

        if (!Array.isArray(annotations) || annotations.length === 0) {
            return NextResponse.json({ error: 'No tags to export' }, { status: 400 });
        }

        const safeName = (projectName || 'Project').slice(0, 80);
        const aggregated = aggregateByCode(annotations);
        const priceMap = await estimatePrices(aggregated);

        const headerRow = ['#', 'Code', 'Description', 'Qty', 'Est. Unit Price (THB)', 'Est. Total (THB)', 'Source / Notes', 'Source Links', 'Locations (x,y %)'];
        const csvLines: string[] = [
            `Project,${escapeCsv(safeName)}`,
            `Generated,${escapeCsv(new Date().toISOString().slice(0, 19).replace('T', ' '))}`,
            `Total tags,${annotations.length}`,
            `Unique codes,${aggregated.length}`,
            '',
            headerRow.map(escapeCsv).join(','),
        ];

        aggregated.forEach((item, i) => {
            const price = priceMap.get(item.code);
            const sourceLinks = (price?.sources ?? []).join('\n');
            csvLines.push([
                String(i + 1),
                escapeCsv(item.code),
                escapeCsv(item.description),
                String(item.quantity),
                escapeCsv(formatPrice(price)),
                escapeCsv(formatTotal(price, item.quantity)),
                escapeCsv(price?.sourceNote ?? (priceMap.size === 0 ? 'Price estimation unavailable' : 'No estimate returned')),
                escapeCsv(sourceLinks),
                escapeCsv(item.locations),
            ].join(','));
        });

        const csv = csvLines.join('\n');

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const stream = new Readable();
        stream.push(csv);
        stream.push(null);

        const dateStr = new Date().toISOString().split('T')[0];
        const response = await drive.files.create({
            requestBody: {
                name: `${safeName} — Tags & Pricing (${dateStr})`,
                mimeType: 'application/vnd.google-apps.spreadsheet',
            },
            media: {
                mimeType: 'text/csv',
                body: stream,
            },
            fields: 'id, webViewLink',
        });

        return NextResponse.json({
            url: response.data.webViewLink,
            fileId: response.data.id,
            uniqueCodes: aggregated.length,
            pricesEstimated: priceMap.size,
        });
    } catch (error: any) {
        console.error('Sheets export error:', error);
        const status = error.code || error.status || 500;
        const isAuthError =
            status === 401 ||
            (error.message && String(error.message).toLowerCase().includes('authentication credentials'));
        return NextResponse.json(
            { error: error.message || 'Error exporting to Google Sheets' },
            { status: isAuthError ? 401 : status }
        );
    }
}
