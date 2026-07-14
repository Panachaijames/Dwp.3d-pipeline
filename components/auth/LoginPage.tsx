"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutTemplate, Box, CalendarClock, Sparkles } from 'lucide-react';

type AuthMode = 'signin' | 'signup';

const ACCENT = '#E8731A';

const GoogleLogo = () => (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors duration-200 focus:border-[#E8731A] focus:ring-2 focus:ring-[#E8731A]/20 disabled:opacity-60 disabled:cursor-not-allowed";
const labelClass = "block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-2";

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
        <div className="relative min-h-screen overflow-hidden bg-[#0B0C0E] flex items-center justify-center p-4 sm:p-6">
            {/* Background decor */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
                <div className="absolute -top-48 -left-40 h-[28rem] w-[28rem] rounded-full bg-[#E8731A]/10 blur-3xl" />
                <div className="absolute -bottom-56 -right-40 h-[30rem] w-[30rem] rounded-full bg-[#3B82F6]/5 blur-3xl" />
            </div>

            <div className="relative w-full max-w-4xl grid lg:grid-cols-[1.05fr_1fr] rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 animate-fade-in">
                {/* ── Brand panel (desktop) ── */}
                <div className="relative hidden lg:flex flex-col justify-between p-10 border-r border-zinc-800 bg-gradient-to-br from-[#151619] via-[#131417] to-[#1E1408]">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-[#E8731A]/15" />
                        <div className="absolute -bottom-10 -left-10 h-72 w-72 rounded-full border border-[#E8731A]/10" />
                        <div className="absolute bottom-6 left-6 h-72 w-72 rounded-full border border-[#E8731A]/5" />
                    </div>

                    <div className="relative">
                        <span className="inline-flex items-center rounded-full border border-[#E8731A]/30 bg-[#E8731A]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F0A05E]">
                            Official DWP Workspace
                        </span>
                    </div>

                    <div className="relative">
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8731A]/15 text-[#E8731A]">
                            <LayoutTemplate className="h-7 w-7" />
                        </div>
                        <h1 className="text-4xl font-bold tracking-tight text-white">
                            dwp<span className="text-[#E8731A]">.</span>3D Pipeline
                        </h1>
                        <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
                            One workspace for booking, scheduling and delivering 3D visualisation work.
                        </p>

                        <ul className="mt-8 space-y-4">
                            <li className="flex items-center gap-3 text-sm text-zinc-300">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/60 text-[#E8731A]">
                                    <Box className="h-4 w-4" />
                                </span>
                                Book renders &amp; track every request
                            </li>
                            <li className="flex items-center gap-3 text-sm text-zinc-300">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/60 text-[#E8731A]">
                                    <CalendarClock className="h-4 w-4" />
                                </span>
                                Live 3D schedule, synced to Google Calendar
                            </li>
                            <li className="flex items-center gap-3 text-sm text-zinc-300">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/60 text-[#E8731A]">
                                    <Sparkles className="h-4 w-4" />
                                </span>
                                AI assistant for team availability
                            </li>
                        </ul>
                    </div>

                    <p className="relative text-xs text-zinc-500">
                        dwp | design worldwide partnership — internal workflow system
                    </p>
                </div>

                {/* ── Auth panel ── */}
                <div className="p-8 sm:p-10">
                    {/* Compact brand header (mobile / tablet) */}
                    <div className="mb-8 flex items-center gap-3 lg:hidden">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8731A]/15 text-[#E8731A]">
                            <LayoutTemplate className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-lg font-bold leading-tight text-white">
                                dwp<span className="text-[#E8731A]">.</span>3D Pipeline
                            </div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Official DWP Workspace</div>
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-white">
                        {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                    </h2>
                    <p className="mt-1.5 mb-7 text-sm leading-relaxed text-zinc-400">
                        {mode === 'signup'
                            ? 'Create a DWP Pipeline account for this internal workspace.'
                            : 'Sign in with your company Google account, or use your DWP email and password.'}
                    </p>

                    {/* Google — primary path for company accounts */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={authenticating}
                        className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-zinc-300 bg-white px-6 py-3.5 text-sm font-semibold text-zinc-800 transition-colors duration-200 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8731A] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <GoogleLogo />
                        <span>{activeMethod === 'google' && authenticating ? 'Opening Google...' : 'Continue with Google'}</span>
                    </button>

                    <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                        <div className="h-px flex-1 bg-zinc-800" />
                        <span>or use email</span>
                        <div className="h-px flex-1 bg-zinc-800" />
                    </div>

                    <div className="mb-6 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                        <button
                            type="button"
                            onClick={() => setAuthMode('signin')}
                            disabled={authenticating}
                            className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${mode === 'signin' ? 'bg-[#E8731A] text-white' : 'text-zinc-400 hover:text-white'} disabled:opacity-60`}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuthMode('signup')}
                            disabled={authenticating}
                            className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${mode === 'signup' ? 'bg-[#E8731A] text-white' : 'text-zinc-400 hover:text-white'} disabled:opacity-60`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="login-email" className={labelClass}>
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
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" className={labelClass}>
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
                                className={inputClass}
                            />
                        </div>

                        {mode === 'signup' && (
                            <div>
                                <label htmlFor="login-confirm-password" className={labelClass}>
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
                                    className={inputClass}
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
                                    className="mt-3 w-full cursor-pointer rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition-colors duration-200 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {activeMethod === 'resend' && authenticating ? 'Sending confirmation email...' : 'Resend confirmation email'}
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={authenticating}
                            className="w-full cursor-pointer rounded-xl bg-[#E8731A] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#E8731A]/20 transition-colors duration-200 hover:bg-[#F5842B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8731A] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitLabel()}
                        </button>
                    </form>

                    <div className="mt-5 text-center text-sm text-zinc-500">
                        {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
                        <button
                            type="button"
                            onClick={toggleMode}
                            disabled={authenticating}
                            className="cursor-pointer font-medium text-[#F0A05E] transition-colors duration-200 hover:text-[#E8731A] disabled:opacity-60"
                        >
                            {mode === 'signup' ? 'Sign in' : 'Create one'}
                        </button>
                    </div>

                    <div className="mt-8 border-t border-zinc-800 pt-5 text-center text-xs text-zinc-600">
                        Hosted by dwp | innovation
                    </div>
                </div>
            </div>
        </div>
    );
};
