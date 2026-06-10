'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole, Rocket, ShieldCheck } from 'lucide-react';
import api from '@/lib/api/client';
import { Button, ErrorState, Panel, inputClassName } from '@/components/ui';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';

export default function AdminLoginPage() {
    const router = useRouter();
    const { setAdminSession } = useAdminAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await api.post<{ admin: any; adminAccessToken: string }>('/admin/login', { email, password });
            setAdminSession(result);
            router.replace('/admin');
        } catch (err: any) {
            setError(err.message || 'Admin login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/14 blur-3xl" />
                <div className="absolute right-[-10rem] top-36 h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="absolute bottom-[-8rem] left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/10 blur-3xl" />
            </div>

            <AdminLoginHeader />

            <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
            <div className="grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
                <div className="hidden lg:block">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100 shadow-lg shadow-cyan-950/20">
                        <ShieldCheck size={14} /> DeployForge
                    </div>
                    <h1 className="mt-7 max-w-2xl text-5xl font-black leading-tight tracking-tight text-white">
                        Sign in to continue.
                    </h1>
                    <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
                        This area is reserved for authorized operators. Enter your credentials to access the workspace.
                    </p>
                </div>

                <Panel className="w-full">
                    <div className="mb-7 flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                            <ShieldCheck size={25} />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Secure sign in</p>
                            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Admin Login</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-400">Enter your credentials to continue.</p>
                        </div>
                    </div>

                    {error ? <div className="mb-4"><ErrorState title="Login failed" message={error} /></div> : null}

                    <form onSubmit={submit} className="space-y-4">
                        <label className="block">
                            <span className="mb-2 block text-xs font-black uppercase text-slate-500">Admin email</span>
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                                placeholder="admin@example.com"
                                className={`${inputClassName} h-12 px-4`}
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-xs font-black uppercase text-slate-500">Password</span>
                            <div className="relative">
                                <input
                                    required
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete="current-password"
                                    placeholder="Admin password"
                                    className={`${inputClassName} h-12 px-4 pr-12`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((current) => !current)}
                                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-white"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </label>

                        <Button type="submit" loading={loading} className="h-12 w-full">
                            <LockKeyhole size={16} /> Sign In
                        </Button>
                    </form>

                    <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/45 p-4">
                        <p className="text-sm leading-6 text-slate-400">Use only an account that has been provisioned for this workspace.</p>
                    </div>
                </Panel>
            </div>
            </main>

            <AdminLoginFooter />
        </div>
    );
}

function AdminLoginHeader() {
    return (
        <header className="relative z-10 border-b border-white/10 bg-slate-950/55 backdrop-blur-2xl">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-3" aria-label="DeployForge home">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                        <Rocket size={19} />
                    </span>
                    <span className="text-lg font-black tracking-tight text-white">DeployForge</span>
                </Link>
                <Link
                    href="/"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm font-black text-slate-100 backdrop-blur-md transition-colors hover:bg-white/[0.11]"
                >
                    Back to Home
                </Link>
            </div>
        </header>
    );
}

function AdminLoginFooter() {
    return (
        <footer className="relative z-10 border-t border-white/10 bg-slate-950/55 backdrop-blur-2xl">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <p>DeployForge admin workspace.</p>
                <div className="flex gap-4">
                    <Link href="/docs" className="transition-colors hover:text-slate-200">Docs</Link>
                    <Link href="/about" className="transition-colors hover:text-slate-200">About</Link>
                </div>
            </div>
        </footer>
    );
}
