import { NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function GET() {
    try {
        const url = ApsService.getAuthorizationUrl();
        return NextResponse.redirect(url);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to generate auth url' },
            { status: 500 }
        );
    }
}
