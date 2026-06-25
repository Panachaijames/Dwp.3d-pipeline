import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');

        if (!code) {
            return NextResponse.json({ error: 'No code provided' }, { status: 400 });
        }

        const tokenData = await ApsService.exchangeCode(code);

        // Redirect to home, but set cookie
        // Use configured callback URL base if available to valid incorrect internal container IP (0000:8080)
        let baseUrl = request.nextUrl.origin;
        if (process.env.APS_CALLBACK_URL) {
            try {
                baseUrl = new URL(process.env.APS_CALLBACK_URL).origin;
            } catch (e) {
                console.error('Invalid APS_CALLBACK_URL', e);
            }
        }

        const res = NextResponse.redirect(new URL('/pipeline', baseUrl));

        // 1 hour expiry (matches token usually)
        res.cookies.set('dwp-aps-token', tokenData.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: tokenData.expires_in,
            path: '/',
        });

        return res;
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Auth failed' },
            { status: 500 }
        );
    }
}
