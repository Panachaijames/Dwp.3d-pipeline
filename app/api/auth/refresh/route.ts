import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/refresh
 * 
 * Uses a stored refresh token to get a new Google access token.
 * Called automatically by the client when the current token is about to expire.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function OPTIONS() {
    return new Response(null, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400, headers: CORS_HEADERS });
        }

        // Look up stored refresh token
        const { data, error } = await supabaseAdmin
            .from('dwp_refresh_tokens')
            .select('refresh_token')
            .eq('email', email)
            .single();

        if (error || !data?.refresh_token) {
            return NextResponse.json({ error: 'No refresh token found. Please log in again.' }, { status: 401, headers: CORS_HEADERS });
        }

        // Exchange refresh token for a new access token
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: data.refresh_token,
                client_id: process.env.GEMINI_CLIENT_ID!,
                client_secret: process.env.GEMINI_CLIENT_SECRET!,
                grant_type: 'refresh_token',
            }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            // Refresh token may have been revoked
            console.error('Google refresh error:', tokenData);
            // Clean up invalid refresh token
            await supabaseAdmin
                .from('dwp_refresh_tokens')
                .delete()
                .eq('email', email);
            return NextResponse.json({ error: 'Refresh token expired. Please log in again.' }, { status: 401, headers: CORS_HEADERS });
        }

        return NextResponse.json({
            access_token: tokenData.access_token,
            expires_in: tokenData.expires_in || 3599,
        }, { headers: CORS_HEADERS });
    } catch (error) {
        console.error('Auth refresh error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS });
    }
}
