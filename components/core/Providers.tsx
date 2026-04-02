'use client';

import React from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '../../contexts/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
    // GoogleOAuthProvider is needed for the secondary Drive/Gmail OAuth flow
    const clientId = process.env.GEMINI_CLIENT_ID || 'placeholder_client_id';

    if (!process.env.GEMINI_CLIENT_ID) {
        console.warn('Providers: GEMINI_CLIENT_ID is missing. Drive features will not work.');
    }

    return (
        <GoogleOAuthProvider clientId={clientId}>
            <AuthProvider>
                {children}
            </AuthProvider>
        </GoogleOAuthProvider>
    );
}
