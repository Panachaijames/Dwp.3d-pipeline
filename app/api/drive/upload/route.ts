import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const folderId = formData.get('folderId') as string | null;

        if (!file || !folderId) {
            return NextResponse.json({ error: 'Missing file or folderId' }, { status: 400 });
        }

        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }

        const accessToken = authHeader.split(' ')[1];

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const buffer = Buffer.from(await file.arrayBuffer());
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const fileMetadata = {
            name: file.name,
            parents: [folderId]
        };

        const media = {
            mimeType: file.type,
            body: stream
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink'
        });

        return NextResponse.json({
            success: true,
            fileId: response.data.id,
            fileName: response.data.name,
            webViewLink: response.data.webViewLink
        });

    } catch (error: any) {
        console.error('Drive upload error:', error);
        return NextResponse.json({ error: error.message || 'Error uploading to Drive' }, { status: 500 });
    }
}
