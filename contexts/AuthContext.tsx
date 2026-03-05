"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { googleLogout, useGoogleLogin } from '@react-oauth/google';
import { supabase } from '../services/supabaseClient';

// Define User Interface matching Google OAuth response
export type UserRole = 'leader' | 'member' | 'outsource';

export interface User {
    email: string;
    name: string;
    picture: string;
    sub: string; // Google ID
    role?: UserRole;
}

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    login: () => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Check for existing session
    useEffect(() => {
        const checkUser = async () => {
            const storedUser = localStorage.getItem('dwp_user');
            const storedToken = localStorage.getItem('dwp_access_token');
            const storedExpiry = localStorage.getItem('dwp_token_expiry');

            if (storedToken && storedExpiry) {
                const now = Date.now();
                // Check if token is expired (or close to expiring, e.g., within 5 minutes)
                if (now > parseInt(storedExpiry) - 300000) {
                    console.warn("Token expired, clearing session");
                    localStorage.removeItem('dwp_access_token');
                    localStorage.removeItem('dwp_token_expiry');
                    localStorage.removeItem('dwp_user');
                    setUser(null);
                    setAccessToken(null);
                    setLoading(false);
                    return;
                }
                setAccessToken(storedToken);
            } else if (storedToken) {
                // Backward compatibility or missing expiry
                // Assume valid for now, but service might fail
                setAccessToken(storedToken);
            }

            if (storedUser) {
                try {
                    const parsedUser = JSON.parse(storedUser);
                    setUser(parsedUser);

                    // Refresh role in background
                    const { data } = await supabase
                        .from('threed_user_roles')
                        .select('role')
                        .eq('email', parsedUser.email)
                        .single();

                    if (data) {
                        const updatedUser = { ...parsedUser, role: data.role };
                        if (parsedUser.role !== data.role || !parsedUser.role) {
                            setUser(updatedUser);
                            localStorage.setItem('dwp_user', JSON.stringify(updatedUser));
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse stored user", e);
                    localStorage.removeItem('dwp_user');
                }
            }
            setLoading(false);
        };
        checkUser();
    }, []);

    const login = useGoogleLogin({
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
        onSuccess: async (tokenResponse) => {
            try {
                setAccessToken(tokenResponse.access_token);
                localStorage.setItem('dwp_access_token', tokenResponse.access_token);

                // Calculate and store expiry
                const expiresIn = tokenResponse.expires_in || 3599; // Default to 1 hour if not provided
                const expiryTime = Date.now() + expiresIn * 1000;
                localStorage.setItem('dwp_token_expiry', expiryTime.toString());

                // Fetch user info using the access token
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const userInfo = await userInfoResponse.json();

                // Fetch role from Supabase
                const { data: roleData } = await supabase
                    .from('threed_user_roles')
                    .select('role')
                    .eq('email', userInfo.email)
                    .single();

                const role: UserRole = roleData?.role || 'member'; // Default to member

                const userData: User = {
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    sub: userInfo.sub,
                    role: role
                };

                setUser(userData);
                localStorage.setItem('dwp_user', JSON.stringify(userData));
            } catch (error) {
                console.error("Failed to fetch user info", error);
            }
        },
        onError: error => console.log('Login Failed:', error)
    });

    const logout = () => {
        googleLogout();
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem('dwp_user');
        localStorage.removeItem('dwp_access_token');
        localStorage.removeItem('dwp_token_expiry');
    };

    return (
        <AuthContext.Provider value={{ user, accessToken, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
