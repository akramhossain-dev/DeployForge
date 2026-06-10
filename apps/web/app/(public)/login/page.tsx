'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Github, Loader2, LockKeyhole } from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { PasswordInput } from '@/components/ui';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [githubLoading, setGithubLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setSession } = useAuthStore();
    const auth = useAuthSession();
    const router = useRouter();

    useEffect(() => {
        if (!auth.isLoading && auth.isAuthenticated) router.replace('/dashboard');
    }, [auth.isAuthenticated, auth.isLoading, router]);

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await api.post<{ user: any; accessToken: string; refreshToken?: string }>('/auth/login', { email, password });
            setSession(response);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Unable to sign in.');
        } finally {
            setLoading(false);
        }
    };

    function loginWithGitHub() {
        setGithubLoading(true);
        window.location.href = `${api.baseUrl}/auth/github`;
    }

    return (
        <main className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <AuthAurora />
            <section className="mx-auto grid min-h-[calc(100vh-17rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <LockKeyhole size={14} /> Secure console access
                    </div>
                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Welcome back to DeployForge.</h1>
                    <p className="mt-5 text-base leading-7 text-slate-400">
                        Sign in to open your dashboard, inspect deployments, connect GitHub, and manage your VPS fleet.
                    </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-6 sm:p-8">
                        <div>
                            <h2 className="text-2xl font-black tracking-tight">Login</h2>
                            <p className="mt-2 text-sm text-slate-400">Use your DeployForge account to continue.</p>
                        </div>

                        <form onSubmit={handleLogin} className="mt-7 space-y-5">
                            <label className="block">
                                <span className="text-sm font-bold text-slate-300">Email address</span>
                                <input
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300"
                                    placeholder="name@company.com"
                                    required
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm font-bold text-slate-300">Password</span>
                                <PasswordInput
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    wrapperClassName="mt-2"
                                    className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300"
                                    placeholder="Password"
                                    required
                                />
                            </label>

                            {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}

                            <button
                                type="submit"
                                disabled={loading || githubLoading || auth.isLoading}
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : <>Sign In <ArrowRight size={18} /></>}
                            </button>
                        </form>

                        <div className="my-6 flex items-center gap-3">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-xs font-black uppercase text-slate-500">or</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>

                        <button
                            type="button"
                            onClick={loginWithGitHub}
                            disabled={githubLoading || loading || auth.isLoading}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-white transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {githubLoading ? <Loader2 className="animate-spin" size={18} /> : <Github size={18} />}
                            Login with GitHub
                        </button>

                        <p className="mt-6 text-center text-sm text-slate-400">
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
            <div className="absolute left-[-8rem] top-8 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="absolute bottom-0 right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}
