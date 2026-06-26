'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2, Mail, Rocket, Shield } from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

const FIELD = 'h-12 w-full rounded-xl border bg-slate-950/80 px-4 text-sm text-white outline-none placeholder:text-slate-600 transition-colors';

const features = [
    { icon: Shield,  label: 'Secure password reset via signed email link' },
    { icon: Mail,    label: 'Link expires after 1 hour for your protection' },
    { icon: Rocket,  label: 'Back in your console in under a minute' },
];

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
        <main className="relative isolate overflow-hidden bg-slate-950 text-white">
            {/* Aurora BG */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute left-[-8rem] top-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
                <div className="absolute bottom-0 right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-violet-400/8 blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
                {/* ── Left panel ── */}
                <div className="max-w-lg">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100">
                        <KeyRound size={13} /> Password Recovery
                    </div>
                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Reset your credentials.</h1>
                    <p className="mt-5 text-base leading-7 text-slate-400">
                        Enter your email address and we&apos;ll send you a secure link to reset your password. You&apos;ll be back in the DeployForge console in no time.
                    </p>

                    <div className="mt-8 space-y-3">
                        {features.map(f => {
                            const Icon = f.icon;
                            return (
                                <div key={f.label} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                                    <Icon size={14} className="shrink-0 text-cyan-400" />
                                    <span className="text-sm text-slate-300">{f.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Right form card ── */}
                <div className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.06] p-1 shadow-2xl shadow-slate-950/80 backdrop-blur-xl">
                    <div className="rounded-xl border border-white/[0.08] bg-slate-950/90 p-6 sm:p-8">
                        {isSent ? (
                            /* Success state */
                            <div className="flex flex-col items-center py-8 text-center space-y-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                                    <CheckCircle2 size={32} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">Check your inbox</h2>
                                    <p className="mt-2 text-sm text-slate-400 leading-6">
                                        A secure reset link has been sent to{' '}
                                        <span className="font-black text-white">{email}</span>.
                                        Check your spam folder if it doesn&apos;t arrive.
                                    </p>
                                </div>
                                <div className="mt-2 w-full rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 text-xs text-amber-300/80">
                                    The link expires in <span className="font-black">1 hour</span>.
                                </div>
                                <Link href="/login"
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-black text-slate-950 text-sm transition-all hover:scale-[1.01]">
                                    Return to Sign In
                                </Link>
                            </div>
                        ) : (
                            /* Form state */
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">Forgot Password</h2>
                                    <p className="mt-1.5 text-sm text-slate-500">Enter your account email to receive a reset link.</p>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Email Address</label>
                                    <input
                                        ref={emailRef} type="email" autoComplete="email"
                                        value={email} onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                                        disabled={isSubmitting} placeholder="name@company.com"
                                        className={clsx(FIELD,
                                            emailError ? 'border-rose-500/60 focus:border-rose-400' : 'border-white/[0.1] focus:border-cyan-400/50'
                                        )}
                                    />
                                    {emailError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{emailError}</p>}
                                </div>

                                {error && (
                                    <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.07] p-3 text-sm text-rose-200">{error}</div>
                                )}

                                <button type="submit" disabled={isSubmitting}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-slate-950 shadow-lg transition-all hover:scale-[1.01] hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-60">
                                    {isSubmitting
                                        ? <Loader2 className="animate-spin" size={18} />
                                        : <><Mail size={16} /> Send Reset Link <ArrowRight size={16} /></>}
                                </button>

                                <div className="border-t border-white/[0.06] pt-4 text-center">
                                    <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-white">
                                        <ArrowLeft size={13} /> Back to Sign In
                                    </Link>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}
