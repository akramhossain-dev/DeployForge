'use client';

import { FormEvent, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LockKeyhole, Rocket, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2.5 font-mono text-xs text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

export default function AdminLoginPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { setAdminSession } = useAdminAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

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
        <div className="min-h-screen bg-[#000000] text-white font-mono text-xs flex flex-col justify-between p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[#1F1F1F] pb-4">
                <Link href="/" className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#0A0A0A] text-white">
                        <Rocket size={14} />
                    </div>
                    <span className="font-bold tracking-tight text-white text-sm">DeployForge</span>
                    <span className="rounded border border-[#1F1F1F] bg-[#111111] px-1.5 py-0.5 text-[10px] text-rose-400 uppercase font-semibold">
                        Control Plane
                    </span>
                </Link>
                <Link
                    href="/"
                    className="flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#0A0A0A] px-3 font-semibold text-[#A1A1A1] hover:text-white transition-colors"
                >
                    <ArrowLeft size={13} />
                    <span>Console</span>
                </Link>
            </header>

            {/* Main Form */}
            <main className="mx-auto w-full max-w-sm my-auto py-8">
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-6">
                    <div className="border-b border-[#1F1F1F] pb-4 space-y-1">
                        <div className="flex items-center gap-2 text-rose-400 font-bold">
                            <ShieldCheck size={16} />
                            <span>System Administrator Auth</span>
                        </div>
                        <p className="text-[#A1A1A1] text-xs">Enter privileged credentials to access the DeployForge control plane.</p>
                    </div>

                    {error && (
                        <div className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                            {error}
                        </div>
                    )}

                    <form onSubmit={submit} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                Admin Email
                            </label>
                            <input
                                ref={emailRef}
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (emailError) setEmailError(null);
                                }}
                                autoComplete="email"
                                placeholder="admin@deployforge.io"
                                className={clsx(INPUT_STYLE, emailError && 'border-rose-500')}
                                disabled={loading}
                            />
                            {emailError && <p className="mt-1 text-xs text-rose-400">{emailError}</p>}
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                Secret Key / Password
                            </label>
                            <input
                                ref={passwordRef}
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (passwordError) setPasswordError(null);
                                }}
                                autoComplete="current-password"
                                placeholder="••••••••••••"
                                className={clsx(INPUT_STYLE, passwordError && 'border-rose-500')}
                                disabled={loading}
                            />
                            {passwordError && <p className="mt-1.5 text-xs text-rose-400">{passwordError}</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-9 rounded border border-[#1F1F1F] bg-white font-semibold text-black hover:bg-[#E5E5E5] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <>
                                    <LockKeyhole size={13} />
                                    <span>Authenticate Admin</span>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="border-t border-[#1F1F1F] pt-4 text-[10px] text-[#666666] leading-relaxed">
                        Access to this control plane is logged. Unauthorized attempts are subject to automatic security isolation.
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="flex items-center justify-between border-t border-[#1F1F1F] pt-4 text-[#666666]">
                <p>DeployForge Administrative Control Plane</p>
                <div className="flex gap-4">
                    <Link href="/docs" className="hover:text-[#A1A1A1]">Docs</Link>
                    <Link href="/" className="hover:text-[#A1A1A1]">Console</Link>
                </div>
            </footer>
        </div>
    );
}
