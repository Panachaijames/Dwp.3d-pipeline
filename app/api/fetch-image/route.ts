import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Server-side image fetcher for the Board Canvas "import board" flow.
// Browsers can't fetch cross-origin images (CORS taints the canvas), so this proxies:
// - direct image URLs are fetched and returned as a data URL
// - HTML pages (e.g. a pinterest.com/pin/... link) are fetched and their og:image /
//   twitter:image is resolved first; pinimg URLs are upgraded to /originals/ when available

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_BYTES = 20 * 1024 * 1024;

function isBlockedHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    return (
        h === 'localhost' || h.endsWith('.local') || h === '0.0.0.0' ||
        /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
        /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
        h === '::1' || h.startsWith('fd') || h.startsWith('fe80')
    );
}

function extractMetaImage(html: string): string | null {
    const patterns = [
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];
    for (const p of patterns) {
        const m = html.match(p);
        if (m) return m[1];
    }
    return null;
}

async function fetchWithCap(url: string, accept: string): Promise<Response> {
    return fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
    });
}

export async function POST(request: NextRequest) {
    try {
        const { url }: { url: string } = await request.json();
        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'url is required' }, { status: 400 });
        }
        let parsed: URL;
        try {
            parsed = new URL(url.trim());
        } catch {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        }
        if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) {
            return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
        }

        // resolve HTML pages (pin links etc.) to their preview image
        let imageUrl = parsed.href;
        const first = await fetchWithCap(imageUrl, 'text/html,image/*');
        if (!first.ok) {
            return NextResponse.json({ error: `Source returned HTTP ${first.status}` }, { status: 502 });
        }
        const contentType = first.headers.get('content-type') || '';
        let imageRes: Response | null = null;
        if (contentType.startsWith('image/')) {
            imageRes = first;
        } else if (contentType.includes('text/html')) {
            const html = await first.text();
            const meta = extractMetaImage(html);
            if (!meta) {
                return NextResponse.json({ error: 'No image found on that page. Tip: right-click the image and use "Copy image address" instead.' }, { status: 422 });
            }
            imageUrl = new URL(meta, parsed.href).href;
            // pinimg thumbnails have a full-resolution /originals/ variant
            if (/i\.pinimg\.com\/\d+x\//.test(imageUrl)) {
                const original = imageUrl.replace(/\/\d+x\//, '/originals/');
                const tryOriginal = await fetchWithCap(original, 'image/*');
                if (tryOriginal.ok && (tryOriginal.headers.get('content-type') || '').startsWith('image/')) {
                    imageUrl = original;
                    imageRes = tryOriginal;
                }
            }
            if (!imageRes) {
                const res = await fetchWithCap(imageUrl, 'image/*');
                if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) {
                    return NextResponse.json({ error: 'Could not fetch the page image' }, { status: 502 });
                }
                imageRes = res;
            }
        } else {
            return NextResponse.json({ error: `Unsupported content type: ${contentType.slice(0, 60)}` }, { status: 422 });
        }

        const buf = Buffer.from(await imageRes.arrayBuffer());
        if (buf.length === 0) return NextResponse.json({ error: 'Empty image' }, { status: 502 });
        if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'Image too large (>20MB)' }, { status: 413 });
        const mime = (imageRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
        return NextResponse.json({
            imageData: `data:${mime};base64,${buf.toString('base64')}`,
            sourceUrl: imageUrl,
        });
    } catch (err: any) {
        console.error('fetch-image error:', err);
        const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        return NextResponse.json({ error: timeout ? 'Source timed out' : err?.message || 'Fetch failed' }, { status: 502 });
    }
}
