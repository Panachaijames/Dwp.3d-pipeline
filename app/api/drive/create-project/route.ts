import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const DEFAULT_PROJECTS_PARENT_FOLDER_ID = '1DlIi30RYezctLobkLupP4TqljkA1tz8r';
const SUBMISSION_TIMEZONE = 'Asia/Bangkok';

const formatSubmissionFolderName = () => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: SUBMISSION_TIMEZONE,
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
    });

    return formatter.format(new Date()).replace(/\//g, '-');
};

export async function POST(req: NextRequest) {
    try {
        const { projectName, parentFolderId } = await req.json();

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
        const targetParentFolderId = parentFolderId || DEFAULT_PROJECTS_PARENT_FOLDER_ID;

        try {
            await drive.files.get({
                fileId: targetParentFolderId,
                fields: 'id',
                supportsAllDrives: true,
            });
        } catch {
            throw new Error(`Parent Drive folder not found or not accessible by the connected Google account: ${targetParentFolderId}`);
        }

        // 1. Create the Main Project Folder
        const projectFolderMetadata = {
            name: projectName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [targetParentFolderId]
        };
        const projectFolderResponse = await drive.files.create({
            requestBody: projectFolderMetadata,
            fields: 'id',
            supportsAllDrives: true,
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
            supportsAllDrives: true,
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
            supportsAllDrives: true,
        });

        const submissionsFolderId = submissionsFolderResponse.data.id;
        if (!submissionsFolderId) {
            throw new Error('Failed to create submissions folder');
        }

        const submissionBatchFolderName = formatSubmissionFolderName();
        const submissionBatchFolderResponse = await drive.files.create({
            requestBody: {
                name: submissionBatchFolderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [submissionsFolderId],
            },
            fields: 'id',
            supportsAllDrives: true,
        });

        const submissionBatchFolderId = submissionBatchFolderResponse.data.id;
        if (!submissionBatchFolderId) {
            throw new Error('Failed to create dated submissions folder');
        }

        return NextResponse.json({
            success: true,
            projectFolderId: projectFolderId,
            resourceFolderId: resourceFolderResponse.data.id,
            submissionFolderId: submissionsFolderId,
            submissionFolderName: 'Submissions',
            submissionBatchFolderId,
            submissionBatchFolderName,
            outsourceFolderId: submissionsFolderId
        });

    } catch (error: any) {
        console.error('Error in create-project API:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
