import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
    try {
        const { projectName } = await req.json();

        // Ensure Project name is provided
        if (!projectName) {
            return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        }

        // Get the Google Access Token from the request headers
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }

        const accessToken = authHeader.split(' ')[1];

        // Initialize the Google Drive Client
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // 1. Create the Main Project Folder
        const projectFolderMetadata = {
            name: projectName,
            mimeType: 'application/vnd.google-apps.folder',
        };
        const projectFolderResponse = await drive.files.create({
            requestBody: projectFolderMetadata,
            fields: 'id',
        });
        const projectFolderId = projectFolderResponse.data.id;

        if (!projectFolderId) {
            throw new Error("Failed to create main project folder");
        }

        // 2. Create the "Resources" Subfolder
        const resourceFolderMetadata = {
            name: 'Resources',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [projectFolderId],
        };
        const resourceFolderResponse = await drive.files.create({
            requestBody: resourceFolderMetadata,
            fields: 'id',
        });

        // 3. Create the "Submissions" Subfolder
        const submissionsFolderMetadata = {
            name: 'Submissions',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [projectFolderId],
        };
        const submissionsFolderResponse = await drive.files.create({
            requestBody: submissionsFolderMetadata,
            fields: 'id',
        });

        return NextResponse.json({
            success: true,
            projectFolderId: projectFolderId,
            resourceFolderId: resourceFolderResponse.data.id,
            outsourceFolderId: submissionsFolderResponse.data.id
        });

    } catch (error: any) {
        console.error('Error in create-project API:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
