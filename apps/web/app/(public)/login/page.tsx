'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Chrome, Github, Loader2, LockKeyhole, Rocket } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { PasswordInput } from '@/components/ui';

const FIELD = 'h-12 w-full rounded-xl border bg-slate-950/80 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-600';
const FIELD_OK  = 'border-white/[0.1] focus:border-cyan-400/60';
const FIELD_ERR = 'border-rose-500/60 focus:border-rose-400';

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
        <main className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <AuthAurora />

            <section className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl items-center gap-12 lg:grid-cols-[1fr_480px]">
                {/* Left copy */}
                <div className="hidden lg:block">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/20 to-cyan-300/5 text-cyan-200">
                            <Rocket size={17} />
                        </span>
                        <span className="text-sm font-black tracking-tight text-white">DeployForge</span>
                    </div>
                    <h1 className="mt-8 max-w-sm text-4xl font-black leading-tight tracking-tight text-white lg:text-5xl">
                        Welcome back.
                    </h1>
                    <p className="mt-5 max-w-sm text-base leading-7 text-slate-400">
                        Sign in to open your dashboard, inspect deployments, connect GitHub, and manage your VPS fleet.
                    </p>
                    <div className="mt-8 flex flex-col gap-3">
                        {[
                            'GitHub-connected deployment workflows',
                            'Live terminal access to your servers',
                            'Real-time build logs and status tracking',
                        ].map(item => (
                            <div key={item} className="flex items-center gap-2.5 text-sm text-slate-500">
                                <LockKeyhole size={12} className="text-cyan-400 shrink-0" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Form card */}
                <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.06] p-1.5 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                    <div className="rounded-xl border border-white/[0.07] bg-slate-950/90 p-6 sm:p-8">
                        <div className="mb-7">
                            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300/70">Secure Access</p>
                            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-white">Sign In</h2>
                            <p className="mt-1 text-sm text-slate-500">Use your DeployForge account to continue.</p>
                        </div>

                        {/* OAuth buttons */}
                        <div className="space-y-2.5">
                            <button type="button" onClick={() => { setGoogleLoading(true); window.location.href = `${api.baseUrl}/auth/google`; }}
                                disabled={busy}
                                className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.1] bg-white px-5 text-sm font-black text-slate-950 shadow-lg shadow-white/5 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50">
                                {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <Chrome size={16} />}
                                Continue with Google
                            </button>
                            <button type="button" onClick={() => { setGithubLoading(true); window.location.href = `${api.baseUrl}/auth/github`; }}
                                disabled={busy}
                                className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.07] px-5 text-sm font-black text-white transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50">
                                {githubLoading ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
                                Continue with GitHub
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="my-6 flex items-center gap-3">
                            <div className="h-px flex-1 bg-white/[0.07]" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">or</span>
                            <div className="h-px flex-1 bg-white/[0.07]" />
                        </div>

                        {/* Credentials form */}
                        <form onSubmit={handleLogin} className="space-y-4">
                            <label className="block">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Email address</span>
                                <input ref={emailRef} type="email" autoComplete="email" value={email}
                                    onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                                    placeholder="name@company.com" disabled={busy}
                                    className={clsx('mt-2', FIELD, emailError ? FIELD_ERR : FIELD_OK)}
                                />
                                {emailError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{emailError}</p>}
                            </label>

                            <label className="block">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Password</span>
                                    <Link href="/forgot-password" className="text-[11px] font-bold text-cyan-400 transition-colors hover:text-cyan-300">
                                        Forgot Password?
                                    </Link>
                                </div>
                                <PasswordInput ref={passwordRef} autoComplete="current-password" value={password}
                                    onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                                    wrapperClassName="mt-2"
                                    className={clsx(FIELD, passwordError ? FIELD_ERR : FIELD_OK)}
                                    placeholder="Password" disabled={busy}
                                />
                                {passwordError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{passwordError}</p>}
                            </label>

                            {error && (
                                <div className="rounded-xl border border-rose-400/25 bg-rose-500/8 p-3 text-sm text-rose-200">{error}</div>
                            )}

                            <button type="submit" disabled={busy}
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <>Sign In <ArrowRight size={16} /></>}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-sm text-slate-500">
                            Don&apos;t have an account?{' '}
                            <Link href="/register" className="font-black text-cyan-300 transition-colors hover:text-cyan-200">
                                Create one
                            </Link>
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}

function AuthAurora() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-[-8rem] top-8 h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute bottom-0 right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/8 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
        </div>
    );
}
