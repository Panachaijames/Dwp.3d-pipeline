import { NextRequest, NextResponse } from 'next/server';

const APS_BASE_URL = 'https://developer.api.autodesk.com';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level cache (persists across requests in same container)
const cache = new Map<string, { cachedAt: number; payload: any }>();

function normalizeProjectId(id: string): string {
    return id?.trim() || '';
}

function buildSheetsUrl(projectId: string): string | null {
    return projectId
        ? `https://acc.autodesk.com/build/sheets/projects/${encodeURIComponent(projectId)}`
        : null;
}

function sortByLatest(sets: any[]): any[] {
    return [...sets].sort((a, b) => {
        const dA = new Date(a.publishedAt || a.createdAt || a.updatedAt || 0).getTime();
        const dB = new Date(b.publishedAt || b.createdAt || b.updatedAt || 0).getTime();
        return dB - dA;
    });
}

function normalizeVersionSet(raw: any) {
    if (!raw) return null;
    return {
        id: raw.id,
        name: raw.name || raw.title || raw.setName || 'Unknown Set',
        publishedAt: raw.publishedAt || raw.createdAt || raw.updatedAt,
        status: raw.status || raw.publishStatus,
        count: raw.count || raw.sheetCount || raw.numberOfSheets,
    };
}

export async function GET(request: NextRequest) {
    const fetchedAt = new Date().toISOString();
    const { searchParams } = new URL(request.url);
    const rawProjectId = searchParams.get('projectId') || '';
    const projectId = normalizeProjectId(rawProjectId);

    if (!projectId) {
        return NextResponse.json({
            status: 'error', latest: null, openUrl: null,
            reason: 'projectId query param required', fetchedAt,
        });
    }

    // Check cache
    const cached = cache.get(projectId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return NextResponse.json({ ...cached.payload, fetchedAt });
    }

    // Get user token from cookie
    const userToken = request.cookies.get('dwp-aps-token')?.value;
    if (!userToken) {
        return NextResponse.json({
            status: 'unauthorized', latest: null,
            openUrl: buildSheetsUrl(projectId),
            reason: 'ACC not connected – please log in first', fetchedAt,
        });
    }

    // Try both b.xxx and xxx forms
    const candidates = projectId.startsWith('b.')
        ? [projectId, projectId.slice(2)]
        : [projectId, `b.${projectId}`];

    let versionSets: any[] = [];
    let lastErr: any = null;
    let resolvedId = candidates[0];

    for (const candidateId of candidates) {
        const url = `${APS_BASE_URL}/construction/sheets/v1/projects/${encodeURIComponent(candidateId)}/version-sets?limit=200&offset=0`;
        try {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${userToken}` },
            });

            if (!res.ok) {
                if (res.status === 404 && candidates.length > 1) { continue; }
                if (res.status === 401 || res.status === 403) {
                    const payload = {
                        status: 'unauthorized', latest: null,
                        openUrl: buildSheetsUrl(projectId),
                        reason: 'Permission denied – check ACC project access', fetchedAt,
                    };
                    cache.set(projectId, { cachedAt: Date.now(), payload });
                    return NextResponse.json(payload);
                }
                lastErr = new Error(`ACC API ${res.status}`);
                break;
            }

            const body = await res.json();
            versionSets = Array.isArray(body?.results) ? body.results
                : Array.isArray(body?.data) ? body.data
                    : Array.isArray(body?.versionSets) ? body.versionSets
                        : [];
            resolvedId = candidateId;
            lastErr = null;
            break;
        } catch (err: any) {
            lastErr = err;
            break;
        }
    }

    if (lastErr) {
        const payload = {
            status: 'error', latest: null,
            openUrl: buildSheetsUrl(projectId),
            reason: lastErr.message || 'Unable to load version sets', fetchedAt,
        };
        cache.set(projectId, { cachedAt: Date.now(), payload });
        return NextResponse.json(payload);
    }

    if (!versionSets.length) {
        const payload = {
            status: 'no_sets', latest: null,
            openUrl: buildSheetsUrl(projectId),
            reason: 'No published sheet sets found in this project', fetchedAt,
        };
        cache.set(projectId, { cachedAt: Date.now(), payload });
        return NextResponse.json(payload);
    }

    const latest = normalizeVersionSet(sortByLatest(versionSets)[0]);
    const payload = {
        status: 'ok', latest,
        openUrl: buildSheetsUrl(projectId),
        resolvedProjectId: resolvedId, fetchedAt,
    };
    cache.set(projectId, { cachedAt: Date.now(), payload });
    return NextResponse.json(payload);
}
