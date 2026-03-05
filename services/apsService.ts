

const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const APS_CALLBACK_URL = process.env.APS_CALLBACK_URL || 'http://localhost:3000/api/aps/callback';
const APS_BASE_URL = 'https://developer.api.autodesk.com';

interface TokenData {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
}

interface ApsItem {
    id: string;
    type: string;
    attributes: {
        displayName: string;
        createTime: string;
        lastModifiedTime: string;
        storageSize?: number;
        fileType?: string;
        extension?: {
            type: string;
            version: string;
            data?: any;
        };
    };
    relationships?: any;
}

export class ApsService {
    private static tokens: Record<string, { token: string; exp: number }> = {};

    // ── 2-Legged Auth (Service Account) ─────────────────────────────────

    static async getAccessToken(
        scope: string = 'viewables:read data:read'
    ): Promise<TokenData> {
        if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
            throw new Error('Missing APS_CLIENT_ID or APS_CLIENT_SECRET environment variables.');
        }

        const cached = this.tokens[scope];
        if (cached && Date.now() < cached.exp - 30_000) {
            return {
                access_token: cached.token,
                expires_in: Math.floor((cached.exp - Date.now()) / 1000),
            };
        }

        const params = new URLSearchParams();
        params.append('client_id', APS_CLIENT_ID);
        params.append('client_secret', APS_CLIENT_SECRET);
        params.append('grant_type', 'client_credentials');
        params.append('scope', scope);

        const res = await fetch(`${APS_BASE_URL}/authentication/v2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`APS Auth Failed (${res.status}): ${err.reason || err.developerMessage || res.statusText}`);
        }

        const data = await res.json();
        this.tokens[scope] = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };

        return { access_token: data.access_token, expires_in: data.expires_in };
    }

    // ── 3-Legged Auth (User Context) ────────────────────────────────────

    static getAuthorizationUrl(scope: string = 'data:read data:write data:create viewables:read account:read'): string {
        if (!APS_CLIENT_ID) throw new Error('Missing APS_CLIENT_ID');
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: APS_CLIENT_ID,
            redirect_uri: APS_CALLBACK_URL,
            scope: scope,
        });
        return `${APS_BASE_URL}/authentication/v2/authorize?${params.toString()}`;
    }

    static async exchangeCode(code: string): Promise<TokenData> {
        if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('Missing credentials');

        // Use Basic Auth header for this endpoint
        const auth = Buffer.from(`${APS_CLIENT_ID}:${APS_CLIENT_SECRET}`).toString('base64');
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: APS_CALLBACK_URL,
        });

        const res = await fetch(`${APS_BASE_URL}/authentication/v2/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`APS Token Exch Failed (${res.status}): ${err.reason || err.message}`);
        }

        return await res.json();
    }

    // ── Data Management API ─────────────────────────────────────────────

    // Helper: uses provided userToken OR falls back to 2-legged service token
    private static async dmFetch(path: string, userToken?: string) {
        let token = userToken;
        if (!token) {
            const t = await this.getAccessToken('data:read');
            token = t.access_token;
        }

        const res = await fetch(`${APS_BASE_URL}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const body = await res.text();
            // If 401/403 with 2-legged, it means the app is not added to the account.
            throw new Error(`APS DM ${res.status}: ${body}`);
        }
        return res.json();
    }

    static async listHubs(userToken?: string) {
        const data = await this.dmFetch('/project/v1/hubs', userToken);
        return data.data as Array<{
            id: string;
            type: string;
            attributes: { name: string; extension: { type: string } };
        }>;
    }

    static async listProjects(hubId: string, userToken?: string) {
        const data = await this.dmFetch(`/project/v1/hubs/${hubId}/projects`, userToken);
        return data.data as Array<{
            id: string;
            type: string;
            attributes: { name: string };
        }>;
    }

    static async getTopFolders(hubId: string, projectId: string, userToken?: string) {
        const data = await this.dmFetch(`/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`, userToken);
        return data.data as ApsItem[];
    }

    static async listFolderContents(projectId: string, folderId: string, userToken?: string) {
        const data = await this.dmFetch(`/data/v1/projects/${projectId}/folders/${folderId}/contents`, userToken);
        return data.data as ApsItem[];
    }

    static async findFolderByPath(hubId: string, projectId: string, pathSegments: string[], userToken?: string): Promise<string | null> {
        let items = await this.getTopFolders(hubId, projectId, userToken);
        for (const segment of pathSegments) {
            const folder = items.find(
                (it) => it.type === 'folders' && it.attributes.displayName === segment
            );
            if (!folder) return null;
            if (segment === pathSegments[pathSegments.length - 1]) return folder.id;
            items = await this.listFolderContents(projectId, folder.id, userToken);
        }
        return null;
    }

    /**
     * Upload a file to an ACC/BIM360 folder using the 3-step APS flow:
     * 1. Create storage (OSS object slot)
     * 2. PUT file bytes to the signed upload URL
     * 3. Create item (or new version) in the target folder
     */
    static async uploadToFolder(
        projectId: string,
        folderId: string,
        fileName: string,
        fileBuffer: Uint8Array,
        mimeType: string,
        userToken?: string
    ): Promise<{ itemId: string; versionUrn: string; name: string }> {
        let token = userToken;
        if (!token) {
            const t = await this.getAccessToken('data:read data:write data:create');
            token = t.access_token;
        }

        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/vnd.api+json',
        };

        // ── Step 1: Create storage object ───────────────────────────────
        const storageRes = await fetch(`${APS_BASE_URL}/data/v1/projects/${projectId}/storage`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                jsonapi: { version: '1.0' },
                data: {
                    type: 'objects',
                    attributes: { name: fileName },
                    relationships: {
                        target: { data: { type: 'folders', id: folderId } },
                    },
                },
            }),
        });

        if (!storageRes.ok) {
            const body = await storageRes.text();
            throw new Error(`Storage creation failed (${storageRes.status}): ${body}`);
        }

        const storageData = await storageRes.json();
        const objectId: string = storageData.data.id; // urn:adsk.objects:os.object:{bucket}/{key}

        // Parse bucket key and object key from the OSS URN
        const ossPrefix = 'urn:adsk.objects:os.object:';
        const ossRest = objectId.startsWith(ossPrefix)
            ? objectId.slice(ossPrefix.length)
            : objectId;
        const slashIdx = ossRest.indexOf('/');
        const bucketKey = encodeURIComponent(ossRest.slice(0, slashIdx));
        const objectKey = encodeURIComponent(ossRest.slice(slashIdx + 1));

        // ── Step 2a: Get signed S3 upload URL ───────────────────────────
        const signedRes = await fetch(
            `${APS_BASE_URL}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload?minutesExpiration=60`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!signedRes.ok) {
            const body = await signedRes.text();
            throw new Error(`Signed URL request failed (${signedRes.status}): ${body}`);
        }

        const signedData = await signedRes.json();
        const s3Url: string = signedData.urls?.[0];
        const uploadKey: string = signedData.uploadKey;

        if (!s3Url) throw new Error('No S3 upload URL returned from APS');

        // ── Step 2b: PUT file bytes to S3 (no auth header — pre-signed) ─
        const uploadRes = await fetch(s3Url, {
            method: 'PUT',
            headers: { 'Content-Type': mimeType || 'application/octet-stream' },
            body: fileBuffer as unknown as BodyInit,
        });

        if (!uploadRes.ok) {
            const body = await uploadRes.text();
            throw new Error(`S3 upload failed (${uploadRes.status}): ${body}`);
        }

        // ── Step 2c: Complete the upload ─────────────────────────────────
        const completeRes = await fetch(
            `${APS_BASE_URL}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uploadKey }),
            }
        );

        if (!completeRes.ok) {
            const body = await completeRes.text();
            throw new Error(`Upload completion failed (${completeRes.status}): ${body}`);
        }

        // ── Step 3: Create item in folder ────────────────────────────────
        const itemRes = await fetch(`${APS_BASE_URL}/data/v1/projects/${projectId}/items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                jsonapi: { version: '1.0' },
                data: {
                    type: 'items',
                    attributes: {
                        displayName: fileName,
                        extension: {
                            type: 'items:autodesk.bim360:File',
                            version: '1.0',
                        },
                    },
                    relationships: {
                        tip: { data: { type: 'versions', id: '1' } },
                        parent: { data: { type: 'folders', id: folderId } },
                    },
                },
                included: [
                    {
                        type: 'versions',
                        id: '1',
                        attributes: {
                            name: fileName,
                            extension: {
                                type: 'versions:autodesk.bim360:File',
                                version: '1.0',
                            },
                        },
                        relationships: {
                            storage: { data: { type: 'objects', id: objectId } },
                        },
                    },
                ],
            }),
        });

        if (!itemRes.ok) {
            const body = await itemRes.text();
            throw new Error(`Item creation failed (${itemRes.status}): ${body}`);
        }

        const itemData = await itemRes.json();
        const itemId: string = itemData.data.id;
        const versionUrn: string = itemData.included?.[0]?.id ?? objectId;

        return { itemId, versionUrn, name: fileName };
    }

    // ── Model Derivative API ────────────────────────────────────────────

    static async translateFile(urn: string, userToken?: string) {
        // Translation requires write access. If userToken provided, use it.
        // Otherwise try 2-legged with data:write/create.
        let token = userToken;
        if (!token) {
            const t = await this.getAccessToken('data:read data:write data:create');
            token = t.access_token;
        }

        const base64Urn = Buffer.from(urn).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const res = await fetch(`${APS_BASE_URL}/modelderivative/v2/designdata/job`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'x-ads-force': 'true',
            },
            body: JSON.stringify({
                input: { urn: base64Urn },
                output: {
                    destination: { region: 'us' },
                    formats: [{ type: 'svf2', views: ['2d', '3d'] }],
                },
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Translation failed (${res.status}): ${body}`);
        }
        return { urn: base64Urn, ...(await res.json()) };
    }

    static async checkTranslation(base64Urn: string, userToken?: string) {
        let token = userToken;
        if (!token) {
            const t = await this.getAccessToken('data:read');
            token = t.access_token;
        }

        const res = await fetch(`${APS_BASE_URL}/modelderivative/v2/designdata/${base64Urn}/manifest`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Manifest check failed (${res.status}): ${body}`);
        }
        return res.json();
    }

    static async getUserProfile(userToken: string) {
        const res = await fetch(`${APS_BASE_URL}/userprofile/v1/users/@me`, {
            headers: { Authorization: `Bearer ${userToken}` },
        });
        if (!res.ok) throw new Error('Failed to fetch profile');
        return await res.json();
    }

    static encodeUrn(urn: string) {
        return Buffer.from(urn).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
}
