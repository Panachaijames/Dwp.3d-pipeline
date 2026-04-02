import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const folderId = searchParams.get('folderId');

        if (!folderId) {
            return NextResponse.json({ error: 'Missing folderId parameter' }, { status: 400 });
        }

        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }

        const accessToken = authHeader.split(' ')[1];

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Fetch files inside the given folder
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, webViewLink, webContentLink, iconLink, thumbnailLink, modifiedTime)',
            orderBy: 'name',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
        });

        return NextResponse.json({
            success: true,
            files: response.data.files || []
        });

    } catch (error: any) {
        console.error('Drive list error:', error);
        const status = error.code || error.status || 500;
        const isAuthError = status === 401 || (error.message && error.message.includes('authentication credentials'));
        return NextResponse.json(
            { error: error.message || 'Error listing Drive files' }, 
            { status: isAuthError ? 401 : status }
        );
    }
}
