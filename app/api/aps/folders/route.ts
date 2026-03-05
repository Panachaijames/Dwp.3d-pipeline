import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const folderId = searchParams.get('folderId');
        const hubId = searchParams.get('hubId');
        const path = searchParams.get('path');
        const userToken = request.cookies.get('dwp-aps-token')?.value;

        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        if (path && hubId) {
            const segments = path.split('/').filter(Boolean);
            const targetFolderId = await ApsService.findFolderByPath(hubId, projectId, segments, userToken);
            if (!targetFolderId) {
                return NextResponse.json({ error: `Folder path "${path}" not found` }, { status: 404 });
            }
            const contents = await ApsService.listFolderContents(projectId, targetFolderId, userToken);
            return NextResponse.json({ folderId: targetFolderId, items: contents.map(mapItem) });
        }

        if (folderId) {
            const contents = await ApsService.listFolderContents(projectId, folderId, userToken);
            return NextResponse.json({ folderId, items: contents.map(mapItem) });
        }

        if (hubId) {
            const topFolders = await ApsService.getTopFolders(hubId, projectId, userToken);
            return NextResponse.json({ items: topFolders.map(mapItem) });
        }

        return NextResponse.json({ error: 'Provide hubId or folderId' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to list folder contents' },
            { status: 500 }
        );
    }
}

function mapItem(item: any) {
    const isFolder = item.type === 'folders';
    const versionUrn = item.relationships?.tip?.data?.id || null;

    return {
        id: item.id,
        type: isFolder ? 'folder' : 'file',
        name: item.attributes.displayName,
        createTime: item.attributes.createTime,
        lastModifiedTime: item.attributes.lastModifiedTime,
        size: item.attributes.storageSize || null,
        fileType: item.attributes.fileType || null,
        versionUrn,
    };
}
