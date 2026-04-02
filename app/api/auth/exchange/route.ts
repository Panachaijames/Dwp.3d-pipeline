import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/exchange
 * 
 * Exchanges a Google authorization code for access_token + refresh_token.
 * Stores the refresh_token server-side in Supabase.
 * Returns { access_token, expires_in, user } to the client.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Server-side Supabase client
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function OPTIONS() {
    return new Response(null, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
    try {
        const { code, redirect_uri } = await req.json();

        if (!code) {
            return NextResponse.json({ error: 'Missing authorization code' }, { status: 400, headers: CORS_HEADERS });
        }

        // Exchange the auth code with Google
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GEMINI_CLIENT_ID!,
                client_secret: process.env.GEMINI_CLIENT_SECRET!,
                redirect_uri: redirect_uri || 'postmessage',
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error('Google token exchange error:', tokenData);
            return NextResponse.json({ error: tokenData.error_description || tokenData.error }, { status: 400, headers: CORS_HEADERS });
        }

        const { access_token, refresh_token, expires_in } = tokenData;

        // Fetch user info
        const userRes = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const userInfo = await userRes.json();

        // Fetch role from Supabase
        const { data: roleData } = await supabaseAdmin
            .from('threed_user_roles')
            .select('role')
            .eq('email', userInfo.email)
            .single();

        const user = {
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            sub: userInfo.sub,
            role: roleData?.role || 'member',
        };

        // Store refresh token in Supabase (only if Google provided one)
        if (refresh_token) {
            await supabaseAdmin
                .from('dwp_refresh_tokens')
                .upsert({
                    email: userInfo.email,
                    refresh_token,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'email' });
        }

        return NextResponse.json({
            access_token,
            expires_in: expires_in || 3599,
            user,
        }, { headers: CORS_HEADERS });
    } catch (error) {
        console.error('Auth exchange error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS });
    }
}
