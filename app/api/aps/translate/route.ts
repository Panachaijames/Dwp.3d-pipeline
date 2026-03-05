import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function POST(request: NextRequest) {
    try {
        const { urn } = await request.json();
        const userToken = request.cookies.get('dwp-aps-token')?.value;

        if (!urn) return NextResponse.json({ error: 'urn is required' }, { status: 400 });

        const result = await ApsService.translateFile(urn, userToken);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Translation failed' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const urn = searchParams.get('urn');
        const userToken = request.cookies.get('dwp-aps-token')?.value;

        if (!urn) return NextResponse.json({ error: 'urn query param is required' }, { status: 400 });

        const manifest = await ApsService.checkTranslation(urn, userToken);
        return NextResponse.json({
            status: manifest.status,
            progress: manifest.progress,
            urn,
            derivatives: manifest.derivatives || [],
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to check translation status' }, { status: 500 });
    }
}
