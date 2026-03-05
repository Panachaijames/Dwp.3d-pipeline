'use client';

import React from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '../contexts/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
    // Using the environment variable exposed via next.config.ts
    const clientId = process.env.GEMINI_CLIENT_ID || 'placeholder_client_id';

    if (!process.env.GEMINI_CLIENT_ID) {
        console.warn('Providers: GEMINI_CLIENT_ID is missing. Using placeholder.');
    }

    return (
        <GoogleOAuthProvider clientId={clientId}>
            <AuthProvider>
                {children}
            </AuthProvider>
        </GoogleOAuthProvider>
    );
}
