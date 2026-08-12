'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Chrome, Github, Loader2, Rocket } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { PasswordInput } from '@/components/ui';

const INPUT_STYLE = 'w-full rounded-md border bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666]';
const INPUT_OK    = 'border-[#1F1F1F] focus:border-[#333333]';
const INPUT_ERR   = 'border-rose-900/80 focus:border-rose-700';

export default function LoginPage() {
    const [email,         setEmail]         = useState('');
    const [password,      setPassword]      = useState('');
    const [loading,       setLoading]       = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [githubLoading, setGithubLoading] = useState(false);
    const [error,         setError]         = useState<string | null>(null);
    const [emailError,    setEmailError]    = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const emailRef    = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const { setSession } = useAuthStore();
    const auth        = useAuthSession();
    const router      = useRouter();
    const queryClient = useQueryClient();
    const busy        = loading || googleLoading || githubLoading || auth.isLoading;

    useEffect(() => {
        if (!auth.isLoading && auth.isAuthenticated) {
            const redirect = new URLSearchParams(window.location.search).get('redirect') || '/dashboard';
            router.replace(redirect.startsWith('/') ? redirect : '/dashboard');
        }
    }, [auth.isAuthenticated, auth.isLoading, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailError(null); setPasswordError(null); setError(null);
        let ok = true;
        if (!email.trim()) { setEmailError('Email address is required'); ok = false; }
        else if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Please enter a valid email'); ok = false; }
        if (!password) { setPasswordError('Password is required'); ok = false; }
        if (!ok) { emailError ? emailRef.current?.focus() : passwordRef.current?.focus(); return; }
        setLoading(true);
        try {
            const res = await api.post<{ user: any }>('/auth/login', { email, password });
            setSession(res);
            queryClient.setQueryData(['auth', 'me'], res.user);
            const redirect = new URLSearchParams(window.location.search).get('redirect') || '/dashboard';
            router.push(redirect.startsWith('/') ? redirect : '/dashboard');
        } catch (err: any) {
            setError(err.message || 'Unable to sign in. Please verify your credentials.');
        } finally { setLoading(false); }
    };

    return (
        <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-black px-4 py-12 text-white">
            <div className="w-full max-w-sm sm:max-w-md space-y-6">

                {/* Brand Header */}
                <div className="text-center space-y-2">
                    <Link href="/" className="inline-flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-white">
                            <Rocket size={14} />
                        </div>
                        <span className="text-sm font-semibold tracking-tight text-white">DeployForge</span>
                    </Link>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Sign in to DeployForge
                    </h1>
                    <p className="text-xs text-[#A1A1A1]">
                        Enter your credentials to access your deployment console.
                    </p>
                </div>

                {/* Auth Card */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 shadow-sm">
                    {/* OAuth providers */}
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => { setGoogleLoading(true); window.location.href = `${api.baseUrl}/auth/google`; }}
                            disabled={busy}
                            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] text-xs font-medium text-white transition-colors hover:bg-[#1A1A1A] disabled:opacity-50"
                        >
                            {googleLoading ? <Loader2 size={14} className="animate-spin" /> : <Chrome size={14} />}
                            <span>Continue with Google</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setGithubLoading(true); window.location.href = `${api.baseUrl}/auth/github`; }}
                            disabled={busy}
                            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] text-xs font-medium text-white transition-colors hover:bg-[#1A1A1A] disabled:opacity-50"
                        >
                            {githubLoading ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
                            <span>Continue with GitHub</span>
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="my-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-[#1F1F1F]" />
                        <span className="text-[10px] font-mono text-[#666666] uppercase">OR</span>
                        <div className="h-px flex-1 bg-[#1F1F1F]" />
                    </div>

                    {/* Credentials Form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                Email Address
                            </label>
                            <input
                                ref={emailRef}
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                                placeholder="name@company.com"
                                disabled={busy}
                                className={clsx(INPUT_STYLE, emailError ? INPUT_ERR : INPUT_OK)}
                            />
                            {emailError && <p className="mt-1 text-xs font-mono text-rose-400">{emailError}</p>}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
                                    Password
                                </label>
                                <Link href="/forgot-password" className="text-xs text-[#A1A1A1] transition-colors hover:text-white">
                                    Forgot password?
                                </Link>
                            </div>
                            <PasswordInput
                                ref={passwordRef}
                                autoComplete="current-password"
                                value={password}
                                onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                                className={clsx(INPUT_STYLE, passwordError ? INPUT_ERR : INPUT_OK)}
                                placeholder="••••••••"
                                disabled={busy}
                            />
                            {passwordError && <p className="mt-1 text-xs font-mono text-rose-400">{passwordError}</p>}
                        </div>

                        {error && (
                            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-2.5 text-xs font-mono text-rose-300">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <>
                                    <span>Sign in</span>
                                    <ArrowRight size={13} />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer Link */}
                <p className="text-center text-xs text-[#A1A1A1]">
                    Don&apos;t have an account?{' '}
                    <Link href="/register" className="font-semibold text-white hover:underline">
                        Sign up
                    </Link>
                </p>
            </div>
        </main>
    );
}
