'use client';

import { FormEvent, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LockKeyhole, Rocket, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { Button, ErrorState, Panel, PasswordInput, inputClassName } from '@/components/ui';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';

export default function AdminLoginPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { setAdminSession } = useAdminAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Field error states
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    // Refs for focus management
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setEmailError(null);
        setPasswordError(null);

        let isValid = true;
        if (!email.trim()) {
            setEmailError('Admin email is required');
            isValid = false;
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            setEmailError('Please enter a valid email address');
            isValid = false;
        }

        if (!password) {
            setPasswordError('Password is required');
            isValid = false;
        }

        if (!isValid) {
            if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
                emailRef.current?.focus();
            } else if (!password) {
                passwordRef.current?.focus();
            }
            return;
        }

        setLoading(true);
        try {
            const result = await api.post<{ admin: any }>('/admin/login', { email, password });
            setAdminSession(result);
            queryClient.setQueryData(['admin', 'me'], result.admin);
            const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/admin';
            router.replace(redirectUrl.startsWith('/') ? redirectUrl : '/admin');
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
                                ref={emailRef}
                                type="email"
                                value={email}
                                onChange={(event) => {
                                    setEmail(event.target.value);
                                    if (emailError) setEmailError(null);
                                }}
                                autoComplete="email"
                                placeholder="admin@example.com"
                                className={clsx(
                                    inputClassName,
                                    "h-12 px-4 transition-colors",
                                    emailError ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                disabled={loading}
                            />
                            {emailError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{emailError}</p>}
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-xs font-black uppercase text-slate-500">Password</span>
                            <PasswordInput
                                ref={passwordRef}
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                    if (passwordError) setPasswordError(null);
                                }}
                                autoComplete="current-password"
                                placeholder="Admin password"
                                className={clsx(
                                    inputClassName,
                                    "h-12 px-4 transition-colors",
                                    passwordError ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                disabled={loading}
                            />
                            {passwordError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{passwordError}</p>}
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
