"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutTemplate, Sparkles, ExternalLink } from 'lucide-react';

type AuthMode = 'signin' | 'signup';

export const LoginPage: React.FC = () => {
    const { loginWithGoogle, loginWithPassword, signUpWithPassword, resendSignUpConfirmation, authenticating } = useAuth();
    const [mode, setMode] = useState<AuthMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
    const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
    const [activeMethod, setActiveMethod] = useState<'credentials' | 'google' | 'resend' | null>(null);

    const isUnconfirmedEmailError = (err: unknown) => {
        if (!err || typeof err !== 'object') {
            return false;
        }

        const authError = err as { code?: string; message?: string };
        const errorMessage = typeof authError.message === 'string' ? authError.message.toLowerCase() : '';

        return authError.code === 'email_not_confirmed' || errorMessage.includes('email not confirmed');
    };

    useEffect(() => {
        if (!authenticating) {
            setActiveMethod(null);
        }
    }, [authenticating]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
        if (!hash) {
            return;
        }

        const params = new URLSearchParams(hash);
        const authError = params.get('error');
        const errorCode = params.get('error_code');

        if (!authError && !errorCode) {
            return;
        }

        const errorDescription = params.get('error_description');
        setMode('signin');
        setNotice(null);

        if (errorCode === 'otp_expired') {
            setNeedsEmailConfirmation(true);
            setError('That email confirmation link is invalid or has expired. Enter your email below and request a new confirmation email.');
        } else if (errorDescription) {
            setError(errorDescription);
        } else {
            setError('Unable to complete email confirmation. Request a new confirmation email and use the newest link.');
        }

        const newUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState({}, document.title, newUrl);
    }, []);

    const setAuthMode = (nextMode: AuthMode) => {
        setMode(nextMode);
        setError(null);
        setNotice(null);
        setPassword('');
        setConfirmPassword('');
        if (nextMode === 'signup') {
            setNeedsEmailConfirmation(false);
        }
    };

    const toggleMode = () => {
        setAuthMode(mode === 'signin' ? 'signup' : 'signin');
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setNotice(null);

        if (!email.trim() || !password) {
            setError('Enter both your email and password.');
            return;
        }

        if (mode === 'signup') {
            if (password.length < 6) {
                setError('Password must be at least 6 characters.');
                return;
            }

            if (password !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
        }

        setActiveMethod('credentials');

        try {
            if (mode === 'signup') {
                const normalizedEmail = email.trim().toLowerCase();
                const result = await signUpWithPassword(email, password);

                if (result.requiresEmailConfirmation) {
                    setPendingConfirmationEmail(normalizedEmail);
                    setNeedsEmailConfirmation(true);
                    setNotice(`Account created. Check ${normalizedEmail} for a confirmation email, then sign in.`);
                    setMode('signin');
                    setPassword('');
                    setConfirmPassword('');
                    return;
                }

                setPendingConfirmationEmail('');
                setNeedsEmailConfirmation(false);
                setNotice('Account created. Redirecting...');
                return;
            }

            setNeedsEmailConfirmation(false);
            await loginWithPassword(email, password);
        } catch (err) {
            const fallbackMessage = mode === 'signup'
                ? 'Unable to create your account.'
                : 'Unable to sign in with email and password.';
            const message = err instanceof Error ? err.message : fallbackMessage;

            if (mode === 'signin' && isUnconfirmedEmailError(err)) {
                setPendingConfirmationEmail(email.trim().toLowerCase());
                setNeedsEmailConfirmation(true);
            }

            setError(message);
        }
    };

    const handleGoogleLogin = () => {
        setError(null);
        setNotice(null);
        setNeedsEmailConfirmation(false);
        setActiveMethod('google');
        loginWithGoogle();
    };

    const handleResendConfirmation = async () => {
        const confirmationEmail = (pendingConfirmationEmail || email).trim().toLowerCase();

        if (!confirmationEmail) {
            setError('Enter your account email to resend the confirmation email.');
            return;
        }

        setError(null);
        setNotice(null);
        setActiveMethod('resend');

        try {
            await resendSignUpConfirmation(confirmationEmail);
            setPendingConfirmationEmail(confirmationEmail);
            setNeedsEmailConfirmation(true);
            setNotice(`A new confirmation email has been sent to ${confirmationEmail}. Use the newest link.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to resend the confirmation email.';
            setError(message);
        }
    };

    const submitLabel = () => {
        if (activeMethod === 'credentials' && authenticating) {
            return mode === 'signup' ? 'Creating account...' : 'Signing in...';
        }

        return mode === 'signup' ? 'Create Account' : 'Sign in with Email';
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4 transition-colors duration-300">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-10 shadow-xl animate-fade-in">
                <div className="w-20 h-20 bg-purple-900/20 text-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-8 rotate-3 hover:rotate-0 transition-transform duration-300">
                    <LayoutTemplate className="w-10 h-10" />
                </div>

                <div className="mb-3 text-center">
                    <span className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                        Official DWP Workspace
                    </span>
                </div>

                <h1 className="text-3xl font-bold text-white mb-3 text-center">
                    dwp.3D Pipeline
                </h1>

                <p className="text-zinc-400 text-sm mb-8 text-center">
                    {mode === 'signup'
                        ? 'Create a DWP Pipeline account for this internal workspace. If confirmation is enabled, verify your email before signing in.'
                        : 'Sign in to the official DWP 3D Pipeline workspace with your DWP account email and password, or continue with your company Google account.'}
                </p>

                <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-center text-xs text-zinc-400">
                    dwp | design worldwide partnership internal workflow system
                </div>

                <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950 p-1 flex gap-1">
                    <button
                        type="button"
                        onClick={() => setAuthMode('signin')}
                        disabled={authenticating}
                        className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${mode === 'signin' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'} disabled:opacity-60`}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        onClick={() => setAuthMode('signup')}
                        disabled={authenticating}
                        className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'} disabled:opacity-60`}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">
                            DWP Account Email
                        </label>
                        <input
                            id="login-email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            disabled={authenticating}
                            placeholder="name@company.com"
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div>
                        <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">
                            Password
                        </label>
                        <input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            disabled={authenticating}
                            placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>

                    {mode === 'signup' && (
                        <div>
                            <label htmlFor="login-confirm-password" className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-2">
                                Confirm Password
                            </label>
                            <input
                                id="login-confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                                disabled={authenticating}
                                placeholder="Re-enter your password"
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    {notice && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                            {notice}
                        </div>
                    )}

                    {mode === 'signin' && needsEmailConfirmation && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4">
                            <p className="text-sm text-amber-100">
                                Need a fresh verification link? Resend the confirmation email and use the newest message.
                            </p>
                            <button
                                type="button"
                                onClick={handleResendConfirmation}
                                disabled={authenticating}
                                className="mt-3 w-full rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/20 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {activeMethod === 'resend' && authenticating ? 'Sending confirmation email...' : 'Resend confirmation email'}
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={authenticating}
                        className="w-full flex items-center justify-center gap-3 bg-purple-600 text-white hover:bg-purple-500 font-semibold py-4 px-6 rounded-xl border border-transparent transition-all group hover:shadow-lg hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <span>{submitLabel()}</span>
                    </button>
                </form>

                <div className="mt-4 text-center text-sm text-zinc-500">
                    {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
                    <button
                        type="button"
                        onClick={toggleMode}
                        disabled={authenticating}
                        className="text-purple-400 hover:text-purple-300 font-medium transition-colors disabled:opacity-60"
                    >
                        {mode === 'signup' ? 'Sign in' : 'Create one'}
                    </button>
                </div>

                <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span>or continue with</span>
                    <div className="h-px flex-1 bg-zinc-800" />
                </div>

                <button
                    onClick={handleGoogleLogin}
                    disabled={authenticating}
                    className="w-full flex items-center justify-center gap-3 bg-zinc-950 text-white hover:bg-zinc-800 font-semibold py-4 px-6 rounded-xl border border-zinc-700 transition-all group hover:shadow-lg hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    <ExternalLink className="w-5 h-5" />
                    <span>{activeMethod === 'google' && authenticating ? 'Opening Google...' : 'Continue with Company Google'}</span>
                </button>

                <div className="mt-8 pt-6 border-t border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-500">
                    <Sparkles className="w-3 h-3" />
                    <span>Hosted by dwp | innovation</span>
                </div>
            </div>
        </div>
    );
};
