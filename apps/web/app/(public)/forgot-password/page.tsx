'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Loader2, KeyRound, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

export default function ForgotPasswordPage() {
    const addToast = useToastStore((state) => state.addToast);
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.trim()) {
            setError('Email address is required');
            addToast({ title: 'Validation Error', description: 'Email address is required', severity: 'error' });
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post('/auth/forgot-password', { email });
            addToast({ 
                title: 'Success', 
                description: 'Password reset link has been sent',
                severity: 'success' 
            });
            setIsSent(true);
        } catch (err: any) {
            const message = err.message || 'Failed to submit request';
            setError(message);
            addToast({ title: 'Error', description: message, severity: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <AuthAurora />
            <section className="mx-auto grid min-h-[calc(100vh-17rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <KeyRound size={14} /> Password Recovery System
                    </div>
                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Reset your credentials.</h1>
                    <p className="mt-5 text-base leading-7 text-slate-400">
                        Enter your email address and we&apos;ll send you a secure link to reset your password. You will be back in the DeployForge console in no time.
                    </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-6 sm:p-8">
                        {isSent ? (
                            <div className="text-center py-4 space-y-4">
                                <CheckCircle2 className="mx-auto text-emerald-400" size={48} />
                                <h2 className="text-2xl font-black tracking-tight">Check your email</h2>
                                <p className="text-sm text-slate-400 leading-6">
                                    We have sent a secure password reset link to <span className="text-white font-medium">{email}</span>.
                                </p>
                                <div className="pt-4">
                                    <Link 
                                        href="/login" 
                                        className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-black text-slate-950 hover:bg-slate-200 transition-colors"
                                    >
                                        Return to login
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">Forgot Password</h2>
                                    <p className="mt-2 text-sm text-slate-400">Enter your email to request a reset link.</p>
                                </div>

                                <label className="block">
                                    <span className="text-sm font-bold text-slate-300">Email address</span>
                                    <input
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300 text-sm"
                                        placeholder="name@company.com"
                                    />
                                </label>

                                {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}

                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : (
                                        <>Send Reset Link <ArrowRight size={18} /></>
                                    )}
                                </button>

                                <div className="text-center pt-4 border-t border-white/5">
                                    <Link 
                                        href="/login" 
                                        className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
                                    >
                                        <ArrowLeft size={14} /> Back to Sign In
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

function AuthAurora() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-[-8rem] top-8 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="absolute bottom-0 right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}
