import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export const runtime = 'nodejs'; // Required for Buffer/binary handling

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const projectId = formData.get('projectId') as string | null;
        const folderId = formData.get('folderId') as string | null;

        if (!file || !projectId || !folderId) {
            return NextResponse.json(
                { error: 'file, projectId, and folderId are required' },
                { status: 400 }
            );
        }

        const userToken = request.cookies.get('dwp-aps-token')?.value;

        // Read file into a Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = new Uint8Array(arrayBuffer);

        const result = await ApsService.uploadToFolder(
            projectId,
            folderId,
            file.name,
            fileBuffer,
            file.type || 'application/octet-stream',
            userToken
        );

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[APS Upload]', error);
        return NextResponse.json(
            { error: error.message || 'Upload failed' },
            { status: 500 }
        );
    }
}
