"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { googleLogout, useGoogleLogin } from '@react-oauth/google';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { logUsage, setUsageActor, clearUsageActor } from '../services/usageLogger';
import { installApiUsageInterceptor } from '../services/apiUsageInterceptor';

const USER_STORAGE_KEY = 'dwp_user';
const DRIVE_TOKEN_KEY = 'dwp_access_token';
const DRIVE_TOKEN_EXPIRY_KEY = 'dwp_token_expiry';
const DRIVE_TOKEN_EMAIL_KEY = 'dwp_access_token_email';
const AUTH_EPOCH_KEY = 'dwp_auth_epoch';
const USAGE_SESSION_KEY = 'dwp_usage_session_logged';

/**
 * Bump this number to force EVERY user to sign out once on their next load.
 * On load, any browser whose stored epoch is below AUTH_EPOCH is signed out and
 * shown the login screen exactly once, then updated to the current epoch.
 * (Sessions are client-side, so this takes effect the next time each person
 * opens or refreshes the site.)
 */
export const AUTH_EPOCH = 1;

export type UserRole = 'leader' | 'member' | 'outsource';
export type AuthProviderName = 'google' | 'password' | 'sso';
const DEFAULT_PASSWORD_ROLE: UserRole = 'member';

export interface SignUpResult {
    requiresEmailConfirmation: boolean;
}

export interface User {
    email: string;
    name: string;
    picture: string;
    sub: string;
    role?: UserRole;
    authProvider: AuthProviderName;
}

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    loginWithGoogle: () => void;
    loginWithPassword: (email: string, password: string) => Promise<void>;
    signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
    resendSignUpConfirmation: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
    authenticating: boolean;
    showDriveAuth: boolean;
    requestDriveAccess: (force?: boolean) => void;
    dismissDriveAuth: () => void;
    driveAuthLoading: boolean;
    driveTokenExpiresAt: number | null;
    driveSessionEmail: string | null;
    driveExpiringSoon: boolean;
    driveNeedsReconnect: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const emailNameFallback = (email: string) => {
    const prefix = email.split('@')[0]?.trim();
    return prefix || 'User';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [authenticating, setAuthenticating] = useState(false);
    const [showDriveAuth, setShowDriveAuth] = useState(false);
    const [driveAuthLoading, setDriveAuthLoading] = useState(false);
    const [driveTokenExpiresAt, setDriveTokenExpiresAt] = useState<number | null>(null);
    const [driveSessionEmail, setDriveSessionEmail] = useState<string | null>(null);
    const [driveRefreshFailed, setDriveRefreshFailed] = useState(false);
    const [driveTimeTick, setDriveTimeTick] = useState(Date.now());
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setDriveTimeTick(Date.now());
        }, 30_000);

        return () => clearInterval(interval);
    }, []);

    const driveExpiringSoon =
        driveTokenExpiresAt !== null &&
        driveTokenExpiresAt > driveTimeTick &&
        driveTokenExpiresAt - driveTimeTick <= 10 * 60 * 1000;
    const driveNeedsReconnect =
        driveRefreshFailed ||
        (driveTokenExpiresAt !== null && driveTokenExpiresAt <= driveTimeTick);

    const persistDriveSession = useCallback((token: string, expiresAt: number | null, email: string | null) => {
        setAccessToken(token);
        setDriveTokenExpiresAt(expiresAt);
        setDriveSessionEmail(email);
        setDriveRefreshFailed(false);
        localStorage.setItem(DRIVE_TOKEN_KEY, token);

        if (expiresAt) {
            localStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY, expiresAt.toString());
        } else {
            localStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);
        }

        if (email) {
            localStorage.setItem(DRIVE_TOKEN_EMAIL_KEY, email);
        } else {
            localStorage.removeItem(DRIVE_TOKEN_EMAIL_KEY);
        }
    }, []);

    const clearDriveSession = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        setAccessToken(null);
        setDriveTokenExpiresAt(null);
        setDriveSessionEmail(null);
        setDriveRefreshFailed(false);
        localStorage.removeItem(DRIVE_TOKEN_KEY);
        localStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);
        localStorage.removeItem(DRIVE_TOKEN_EMAIL_KEY);
    }, []);

    const persistUser = useCallback((nextUser: User | null) => {
        setUser(nextUser);
        if (nextUser) {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
            // Mark this browser as current-epoch so the force-logout gate passes
            // once the user is signed in.
            localStorage.setItem(AUTH_EPOCH_KEY, String(AUTH_EPOCH));
            setUsageActor({ email: nextUser.email, name: nextUser.name, role: nextUser.role });
        } else {
            localStorage.removeItem(USER_STORAGE_KEY);
            clearUsageActor();
        }
    }, []);

    // Log a "came in" event, at most once per browser tab session for resumed
    // sessions. Deliberate sign-ins always log.
    const logSessionStart = useCallback((appUser: User, resumed: boolean) => {
        try {
            if (resumed && sessionStorage.getItem(USAGE_SESSION_KEY) === '1') return;
            sessionStorage.setItem(USAGE_SESSION_KEY, '1');
        } catch {
            // sessionStorage may be unavailable; fall through and still log.
        }
        logUsage({
            eventType: 'login',
            feature: appUser.authProvider,
            detail: { resumed, role: appUser.role || null },
            actor: { email: appUser.email, name: appUser.name, role: appUser.role },
        });
    }, []);

    // Install the /api usage interceptor once, client-side.
    useEffect(() => {
        installApiUsageInterceptor();
    }, []);

    const scheduleRefresh = useCallback((expiresInMs: number, email: string) => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        const refreshIn = Math.max(expiresInMs - 5 * 60 * 1000, 0);

        refreshTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });

                if (!res.ok) {
                    console.warn('Drive token refresh failed');
                    setDriveRefreshFailed(true);
                    return;
                }

                const data = await res.json();
                const newExpiry = Date.now() + data.expires_in * 1000;

                persistDriveSession(data.access_token, newExpiry, email);
                scheduleRefresh(data.expires_in * 1000, email);
                console.log('Drive token refreshed silently');
            } catch (err) {
                setDriveRefreshFailed(true);
                console.error('Silent refresh error:', err);
            }
        }, refreshIn);
    }, [persistDriveSession]);

    const resolveRole = useCallback(async (
        userData: User,
        options?: { autoAssignPasswordRole?: boolean }
    ): Promise<User> => {
        try {
            const { data, error } = await supabase
                .from('threed_user_roles')
                .select('role')
                .eq('email', userData.email)
                .maybeSingle();

            if (error) {
                console.error('Failed to verify user role:', error);
                return userData;
            }

            if (!data) {
                const isDwpEmail = userData.email.toLowerCase().endsWith('@dwp.com');
                const shouldAutoAssign = isDwpEmail || (options?.autoAssignPasswordRole && userData.authProvider === 'password');

                if (shouldAutoAssign) {
                    const roleToAssign = userData.role || DEFAULT_PASSWORD_ROLE;
                    const { error: insertError } = await supabase
                        .from('threed_user_roles')
                        .upsert({ email: userData.email, role: roleToAssign });

                    if (insertError) {
                        console.error('Failed to auto-assign default role:', insertError);
                        return { ...userData, role: roleToAssign };
                    }

                    return { ...userData, role: roleToAssign };
                }

                console.warn('No role found in Supabase for', userData.email);
                return { ...userData, role: userData.role || undefined };
            }

            console.log('Role resolved from Supabase:', data.role);
            return { ...userData, role: data.role as UserRole };
        } catch (err) {
            console.error('Failed to verify user role:', err);
            return userData;
        }
    }, []);

    const buildPasswordUser = useCallback((authUser: SupabaseAuthUser): User => {
        const email = authUser.email?.trim();
        if (!email) {
            throw new Error('Supabase session is missing an email address.');
        }

        const metadata = authUser.user_metadata && typeof authUser.user_metadata === 'object'
            ? authUser.user_metadata as Record<string, unknown>
            : {};
        const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
        const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : '';

        return {
            email,
            name: fullName || emailNameFallback(email),
            picture: avatarUrl,
            sub: authUser.id,
            role: undefined,
            authProvider: 'password',
        };
    }, []);

    const normalizeStoredUser = useCallback((rawUser: string): User | null => {
        try {
            const parsed = JSON.parse(rawUser) as Partial<User>;
            const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';

            if (!email) {
                return null;
            }

            const authProvider: AuthProviderName =
                parsed.authProvider === 'password' || parsed.authProvider === 'sso'
                    ? parsed.authProvider
                    : 'google';

            return {
                email,
                name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : emailNameFallback(email),
                picture: typeof parsed.picture === 'string' ? parsed.picture : '',
                sub: typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub : email,
                role: parsed.role,
                authProvider,
            };
        } catch (error) {
            console.error('Failed to parse stored user', error);
            return null;
        }
    }, []);

    const restoreDriveSession = useCallback((email: string) => {
        const storedToken = localStorage.getItem(DRIVE_TOKEN_KEY);
        const storedExpiry = localStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY);
        const storedTokenEmail = localStorage.getItem(DRIVE_TOKEN_EMAIL_KEY);

        if (!storedToken) {
            setAccessToken(null);
            setDriveTokenExpiresAt(null);
            setDriveSessionEmail(null);
            return;
        }

        if (storedTokenEmail && storedTokenEmail !== email) {
            clearDriveSession();
            return;
        }

        if (storedExpiry) {
            const timeLeft = Number(storedExpiry) - Date.now();
            if (timeLeft > 0) {
                setAccessToken(storedToken);
                setDriveTokenExpiresAt(Number(storedExpiry));
                setDriveSessionEmail(email);
                setDriveRefreshFailed(false);
                scheduleRefresh(timeLeft, email);
                return;
            }

            clearDriveSession();
            return;
        }

        setAccessToken(storedToken);
        setDriveTokenExpiresAt(null);
        setDriveSessionEmail(email);
        setDriveRefreshFailed(false);
    }, [clearDriveSession, scheduleRefresh]);

    useEffect(() => {
        let cancelled = false;

        const handleAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const authPayload = params.get('auth_payload');
            const googleToken = params.get('google_token');

            if (authPayload) {
                try {
                    const decodedString = atob(authPayload);
                    const payloadData = JSON.parse(decodedString);

                    let userData: User = {
                        email: payloadData.email,
                        name: payloadData.name || emailNameFallback(payloadData.email || ''),
                        picture: payloadData.picture || '',
                        sub: payloadData.sub || payloadData.email,
                        role: payloadData.role,
                        authProvider: 'sso',
                    };

                    userData = await resolveRole(userData);

                    if (cancelled) return;

                    persistUser(userData);
                    logSessionStart(userData, false);

                    if (googleToken) {
                        persistDriveSession(googleToken, null, userData.email);
                    } else if (payloadData.access_token) {
                        persistDriveSession(payloadData.access_token, null, userData.email);
                    }

                    sessionStorage.removeItem('dwp_sso_checked');

                    params.delete('auth_payload');
                    params.delete('google_token');
                    params.delete('auth_ts');
                    const newSearch = params.toString() ? `?${params.toString()}` : '';
                    const newUrl = `${window.location.pathname}${newSearch}${window.location.hash}`;
                    window.history.replaceState({}, document.title, newUrl);

                    setLoading(false);
                    return;
                } catch (error) {
                    console.error('Failed to parse SSO payload:', error);
                }
            }

            // ── One-time forced logout gate ──────────────────────────────────
            // If this browser is behind the current AUTH_EPOCH, sign out once and
            // show the login screen. Runs AFTER the SSO branch above so inbound
            // SSO deep-links still authenticate normally.
            const storedEpoch = Number(localStorage.getItem(AUTH_EPOCH_KEY) || '0');
            if (storedEpoch < AUTH_EPOCH) {
                try { googleLogout(); } catch { /* ignore */ }
                try {
                    await supabase.auth.signOut();
                } catch (signOutError) {
                    console.warn('Forced sign-out failed:', signOutError);
                }
                if (cancelled) return;
                persistUser(null);
                clearDriveSession();
                // Advance the epoch FIRST, in its own try, so the gate never
                // re-runs even if sessionStorage access throws (e.g. sandboxed
                // iframes where localStorage works but sessionStorage does not).
                try { localStorage.setItem(AUTH_EPOCH_KEY, String(AUTH_EPOCH)); } catch { /* ignore */ }
                try {
                    sessionStorage.removeItem('dwp_sso_checked');
                    sessionStorage.removeItem(USAGE_SESSION_KEY);
                } catch { /* ignore */ }
                setLoading(false);
                return;
            }

            const storedUserRaw = localStorage.getItem(USER_STORAGE_KEY);
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error('Failed to load Supabase session:', sessionError);
            }

            const sessionUser = sessionData.session?.user;

            if (sessionUser?.email) {
                try {
                    let sessionAppUser = buildPasswordUser(sessionUser);
                    sessionAppUser = await resolveRole(sessionAppUser, { autoAssignPasswordRole: true });

                    if (cancelled) return;

                    persistUser(sessionAppUser);
                    logSessionStart(sessionAppUser, true);
                    restoreDriveSession(sessionAppUser.email);
                    setLoading(false);
                    return;
                } catch (error) {
                    console.error('Failed to restore password session:', error);
                }
            }

            if (storedUserRaw) {
                const storedUser = normalizeStoredUser(storedUserRaw);

                if (!storedUser) {
                    localStorage.removeItem(USER_STORAGE_KEY);
                } else if (storedUser.authProvider === 'password') {
                    localStorage.removeItem(USER_STORAGE_KEY);
                    clearDriveSession();
                } else {
                    let resolvedStoredUser = await resolveRole(storedUser);

                    if (cancelled) return;

                    persistUser(resolvedStoredUser);
                    logSessionStart(resolvedStoredUser, true);
                    restoreDriveSession(resolvedStoredUser.email);
                }
            }

            setLoading(false);
        };

        void handleAuth();

        return () => {
            cancelled = true;
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, [buildPasswordUser, clearDriveSession, normalizeStoredUser, persistDriveSession, persistUser, resolveRole, restoreDriveSession, logSessionStart]);

    const connectGoogleDrive = useGoogleLogin({
        flow: 'auth-code',
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        onSuccess: async (codeResponse) => {
            setDriveAuthLoading(true);
            try {
                const res = await fetch('/api/auth/exchange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: codeResponse.code }),
                });

                if (!res.ok) {
                    const err = await res.json();
                    console.error('Drive token exchange failed:', err);
                    return;
                }

                const data = await res.json();
                const expiryTime = Date.now() + data.expires_in * 1000;
                const tokenEmail = data.user?.email || user?.email;

                if (tokenEmail) {
                    persistDriveSession(data.access_token, expiryTime, tokenEmail);
                    scheduleRefresh(data.expires_in * 1000, tokenEmail);
                } else {
                    persistDriveSession(data.access_token, expiryTime, null);
                }

                setShowDriveAuth(false);
            } catch (error) {
                console.error('Drive connect failed', error);
            } finally {
                setDriveAuthLoading(false);
            }
        },
        onError: error => {
            console.log('Drive Connect Failed:', error);
            setDriveAuthLoading(false);
        }
    });

    const requestDriveAccess = useCallback((force = false) => {
        if (accessToken && !force) return;
        setShowDriveAuth(true);
    }, [accessToken]);

    const dismissDriveAuth = useCallback(() => {
        setShowDriveAuth(false);
    }, []);

    const triggerGoogleLogin = useGoogleLogin({
        flow: 'auth-code',
        scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        ux_mode: 'popup',
        onSuccess: async (codeResponse) => {
            try {
                const res = await fetch('/api/auth/exchange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: codeResponse.code }),
                });

                if (!res.ok) {
                    const err = await res.json();
                    console.error('Login exchange failed:', err);
                    return;
                }

                const data = await res.json();
                const expiryTime = Date.now() + data.expires_in * 1000;
                const nextUser: User = {
                    ...data.user,
                    authProvider: 'google',
                };

                persistUser(nextUser);
                logSessionStart(nextUser, false);

                persistDriveSession(data.access_token, expiryTime, nextUser.email);
                scheduleRefresh(data.expires_in * 1000, nextUser.email);
            } catch (error) {
                console.error('Login failed:', error);
            } finally {
                setAuthenticating(false);
            }
        },
        onError: error => {
            console.error('Google Login Failed:', error);
            setAuthenticating(false);
        }
    });

    const loginWithGoogle = useCallback(() => {
        try {
            setAuthenticating(true);
            triggerGoogleLogin();
        } catch (error) {
            setAuthenticating(false);
            throw error;
        }
    }, [triggerGoogleLogin]);

    const loginWithPassword = useCallback(async (email: string, password: string) => {
        const normalizedEmail = email.trim().toLowerCase();

        setAuthenticating(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password,
            });

            if (error) {
                throw error;
            }

            const authUser = data.user ?? data.session?.user;
            if (!authUser) {
                throw new Error('Sign-in succeeded but no user was returned.');
            }

            let passwordUser = buildPasswordUser(authUser);
            passwordUser = await resolveRole(passwordUser, { autoAssignPasswordRole: true });

            persistUser(passwordUser);
            logSessionStart(passwordUser, false);
            restoreDriveSession(passwordUser.email);
        } finally {
            setAuthenticating(false);
        }
    }, [buildPasswordUser, persistUser, resolveRole, restoreDriveSession, logSessionStart]);

    const signUpWithPassword = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
        const normalizedEmail = email.trim().toLowerCase();
        const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

        setAuthenticating(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    emailRedirectTo,
                },
            });

            if (error) {
                throw error;
            }

            const authUser = data.session?.user ?? data.user;
            if (!authUser) {
                throw new Error('Account creation succeeded but no user was returned.');
            }

            const requiresEmailConfirmation = !data.session;
            const hasEmailIdentity = Array.isArray(authUser.identities)
                ? authUser.identities.some((identity) => identity?.provider === 'email')
                : true;

            if (requiresEmailConfirmation && !hasEmailIdentity) {
                throw new Error('This email is already registered. Sign in instead.');
            }

            if (!requiresEmailConfirmation) {
                let passwordUser = buildPasswordUser(authUser);
                passwordUser = await resolveRole(passwordUser, { autoAssignPasswordRole: true });

                persistUser(passwordUser);
                logSessionStart(passwordUser, false);
                restoreDriveSession(passwordUser.email);
            }

            return { requiresEmailConfirmation };
        } finally {
            setAuthenticating(false);
        }
    }, [buildPasswordUser, persistUser, resolveRole, restoreDriveSession, logSessionStart]);

    const resendSignUpConfirmation = useCallback(async (email: string) => {
        const normalizedEmail = email.trim().toLowerCase();
        const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

        setAuthenticating(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: normalizedEmail,
                options: {
                    emailRedirectTo,
                },
            });

            if (error) {
                throw error;
            }
        } finally {
            setAuthenticating(false);
        }
    }, []);

    const logout = useCallback(async () => {
        logUsage({ eventType: 'logout' });
        googleLogout();
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Supabase sign-out failed:', error);
        } finally {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            persistUser(null);
            clearDriveSession();
            sessionStorage.removeItem('dwp_sso_checked');
            try { sessionStorage.removeItem(USAGE_SESSION_KEY); } catch { /* ignore */ }
        }
    }, [clearDriveSession, persistUser]);

    return (
        <AuthContext.Provider value={{
            user,
            accessToken,
            loginWithGoogle,
            loginWithPassword,
            signUpWithPassword,
            resendSignUpConfirmation,
            logout,
            loading,
            authenticating,
            showDriveAuth,
            requestDriveAccess,
            dismissDriveAuth,
            driveAuthLoading,
            driveTokenExpiresAt,
            driveSessionEmail,
            driveExpiringSoon,
            driveNeedsReconnect,
        }}>
            {children}
            {showDriveAuth && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
                        <div className="w-16 h-16 bg-blue-900/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                <path d="M10 12h4" />
                                <path d="M12 10v4" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">
                            Connect Google Drive
                        </h2>
                        <p className="text-zinc-400 text-sm mb-6">
                            This feature requires your DWP Google Drive account. Continue with Google to connect access for this workspace.
                        </p>
                        <button
                            onClick={() => connectGoogleDrive()}
                            disabled={driveAuthLoading}
                            className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 hover:bg-gray-100 font-semibold py-3.5 px-6 rounded-xl border border-transparent transition-all hover:shadow-lg hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {driveAuthLoading ? (
                                <span>Connecting...</span>
                            ) : (
                                <>
                                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                                    <span>Continue with Google</span>
                                </>
                            )}
                        </button>
                        <button
                            onClick={dismissDriveAuth}
                            className="mt-3 w-full text-zinc-500 hover:text-zinc-300 text-sm py-2 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
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
