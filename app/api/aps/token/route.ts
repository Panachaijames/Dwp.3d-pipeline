import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function GET(request: NextRequest) {
    try {
        // If user has a 3-legged token, use it!
        const userToken = request.cookies.get('dwp-aps-token')?.value;
        if (userToken) {
            return NextResponse.json({ access_token: userToken, expires_in: 3600 });
        }

        // Fallback to 2-legged (might fail for Dev Hub items, but ok for public/other items)
        const tokenData = await ApsService.getAccessToken('viewables:read data:read');
        return NextResponse.json(tokenData);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to retrieve APS token' },
            { status: 500 }
        );
    }
}
