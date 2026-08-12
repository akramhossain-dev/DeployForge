'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, Rocket } from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

const INPUT_STYLE = 'w-full rounded-md border bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666]';
const INPUT_OK    = 'border-[#1F1F1F] focus:border-[#333333]';
const INPUT_ERR   = 'border-rose-900/80 focus:border-rose-700';

export default function ForgotPasswordPage() {
    const addToast = useToastStore(s => s.addToast);
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError]   = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const emailRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null); setEmailError(null);
        if (!email.trim()) { setEmailError('Email address is required'); emailRef.current?.focus(); return; }
        if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Please enter a valid email address'); emailRef.current?.focus(); return; }

        setIsSubmitting(true);
        try {
            await api.post('/auth/forgot-password', { email });
            addToast({ title: 'Success', description: 'Reset link sent to your email', severity: 'success' });
            setIsSent(true);
        } catch (err: any) {
            const msg = err.message || 'Failed to submit request';
            setError(msg);
            addToast({ title: 'Error', description: msg, severity: 'error' });
        } finally { setIsSubmitting(false); }
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
                        Reset your password
                    </h1>
                    <p className="text-xs text-[#A1A1A1]">
                        Enter the email associated with your account and we&apos;ll help you reset your password.
                    </p>
                </div>

                {/* Auth Card Container */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 shadow-sm">
                    {isSent ? (
                        /* Success state */
                        <div className="text-center space-y-4 py-2">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] text-emerald-400">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white">Check your inbox</h2>
                                <p className="mt-1 text-xs text-[#A1A1A1] leading-relaxed">
                                    A password reset link has been sent to <span className="font-mono text-white">{email}</span>.
                                    The link expires in 1 hour.
                                </p>
                            </div>
                            <Link
                                href="/login"
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                            >
                                <span>Back to sign in</span>
                                <ArrowRight size={13} />
                            </Link>
                        </div>
                    ) : (
                        /* Form state */
                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                    disabled={isSubmitting}
                                    className={clsx(INPUT_STYLE, emailError ? INPUT_ERR : INPUT_OK)}
                                />
                                {emailError && <p className="mt-1 text-xs font-mono text-rose-400">{emailError}</p>}
                            </div>

                            {error && (
                                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-2.5 text-xs font-mono text-rose-300">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <>
                                        <Mail size={14} />
                                        <span>Send reset link</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Back to sign in link */}
                <div className="text-center">
                    <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-[#A1A1A1] transition-colors hover:text-white">
                        <ArrowLeft size={13} />
                        <span>Back to sign in</span>
                    </Link>
                </div>
            </div>
        </main>
    );
}
