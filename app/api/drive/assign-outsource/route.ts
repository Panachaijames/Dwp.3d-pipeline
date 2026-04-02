import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
    try {
        const { email, resourceFolderId, outsourceFolderId } = await req.json();

        if (!email || !resourceFolderId || !outsourceFolderId) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const setPermission = async (fileId: string, role: string) => {
            return await drive.permissions.create({
                fileId: fileId,
                sendNotificationEmail: false,
                supportsAllDrives: true,
                requestBody: {
                    type: 'user',
                    role: role,
                    emailAddress: email,
                },
            });
        };

        // Grant Viewer (Reader) on Resources folder
        await setPermission(resourceFolderId, 'reader');

        // Grant Editor (Writer) on Submissions folder
        await setPermission(outsourceFolderId, 'writer');

        return NextResponse.json({ success: true, message: 'Permissions successfully granted' });

    } catch (error: any) {
        console.error('Error in assign-outsource API:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
