import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const hubId = searchParams.get('hubId') || '';

    if (!hubId) {
        return NextResponse.json({ error: 'hubId required' }, { status: 400 });
    }

    try {
        const userToken = request.cookies.get('dwp-aps-token')?.value;
        const projects = await ApsService.listProjects(hubId, userToken);
        return NextResponse.json({
            projects: projects.map(p => ({ id: p.id, name: p.attributes.name })),
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to list projects', needsLogin: true },
            { status: 500 }
        );
    }
}
