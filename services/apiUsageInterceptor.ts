import { logUsage } from './usageLogger';

/**
 * Installs a scoped wrapper around window.fetch that records every same-origin
 * `/api/*` request as an `api_call` usage event (method, status, duration),
 * attributed to the currently signed-in user.
 *
 * It is deliberately narrow and non-invasive:
 *   - Only same-origin requests whose path starts with `/api/` are logged.
 *   - Cross-origin calls (Supabase, Google, etc.) are passed straight through,
 *     so there is no risk of recursion from the logger's own Supabase insert.
 *   - The original Request/Response objects are never read or mutated, so
 *     streaming responses are preserved.
 *   - Logging failures never affect the underlying request.
 */

let installed = false;

// '/api/gemini' -> 'api:gemini'; '/api/sheets/export' -> 'api:sheets/export'
function featureFromPath(path: string): string {
    const rest = path.replace(/^\/api\//, '').replace(/\/+$/, '');
    return `api:${rest || 'root'}`;
}

export function installApiUsageInterceptor(): void {
    if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') {
        return;
    }
    installed = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        let apiPath: string | null = null;
        let method = 'GET';

        try {
            const rawUrl =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                        ? input.href
                        : input.url;

            method = (
                init?.method ||
                (typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined) ||
                'GET'
            ).toUpperCase();

            const url = new URL(rawUrl, window.location.origin);
            if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
                apiPath = url.pathname;
            }
        } catch {
            apiPath = null;
        }

        if (!apiPath) {
            return originalFetch(input as RequestInfo, init);
        }

        const startedAt = Date.now();
        try {
            const res = await originalFetch(input as RequestInfo, init);
            logUsage({
                eventType: 'api_call',
                feature: featureFromPath(apiPath),
                detail: { method, status: res.status, ms: Date.now() - startedAt },
            });
            return res;
        } catch (err) {
            logUsage({
                eventType: 'api_call',
                feature: featureFromPath(apiPath),
                detail: { method, status: 0, ms: Date.now() - startedAt, error: true },
            });
            throw err;
        }
    };
}
