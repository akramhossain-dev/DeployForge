'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, ArrowLeft, CheckCircle2, ShieldAlert, Loader2, Lock, ArrowRight } from 'lucide-react';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { PasswordInput } from '@/components/ui';

function ResetPasswordContent() {
    const addToast = useToastStore((state) => state.addToast);
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!token) {
            const msg = 'Reset token is missing from URL';
            setError(msg);
            addToast({ title: 'Validation Error', description: msg, severity: 'error' });
            return;
        }

        if (password.length < 8) {
            const msg = 'Password must be at least 8 characters long';
            setError(msg);
            addToast({ title: 'Validation Error', description: msg, severity: 'error' });
            return;
        }

        if (password !== confirmPassword) {
            const msg = 'Passwords do not match';
            setError(msg);
            addToast({ title: 'Validation Error', description: msg, severity: 'error' });
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post('/auth/reset-password', { token, password });
            addToast({ title: 'Success', description: 'Password has been reset successfully', severity: 'success' });
            setIsSuccess(true);
        } catch (err: any) {
            const msg = err.message || 'Failed to reset password';
            setError(msg);
            addToast({ title: 'Error', description: msg, severity: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!token) {
        return (
            <div className="text-center space-y-4 py-6">
                <ShieldAlert className="mx-auto text-rose-400" size={48} />
                <h3 className="text-xl font-black text-white">Invalid Reset Link</h3>
                <p className="text-sm text-slate-400 leading-6">
                    This password reset link is invalid, expired, or incomplete. Please request a new password reset link.
                </p>
                <div className="pt-4">
                    <Link 
                        href="/forgot-password" 
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-black text-slate-950 hover:bg-slate-200 transition-colors"
                    >
                        Request New Link
                    </Link>
                </div>
            </div>
        );
    }

    if (isSuccess) {
        return (
            <div className="text-center space-y-4 py-6">
                <CheckCircle2 className="mx-auto text-emerald-400" size={48} />
                <h3 className="text-xl font-black text-white">Password Updated</h3>
                <p className="text-sm text-slate-400 leading-6">
                    Your password has been successfully updated. You can now sign in using your new credentials.
                </p>
                <div className="pt-4">
                    <Link 
                        href="/login" 
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-black text-slate-950 hover:bg-slate-200 transition-colors"
                    >
                        Go to Sign In
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <h2 className="text-2xl font-black tracking-tight">Reset Password</h2>
                <p className="mt-2 text-sm text-slate-400">Choose a new, strong password for your account.</p>
            </div>

            <label className="block">
                <span className="text-sm font-bold text-slate-300">New Password</span>
                <PasswordInput
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    wrapperClassName="mt-2"
                    className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300"
                    placeholder="New Password"
                    required
                />
            </label>

            <label className="block">
                <span className="text-sm font-bold text-slate-300">Confirm New Password</span>
                <PasswordInput
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    wrapperClassName="mt-2"
                    className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300"
                    placeholder="Confirm Password"
                    required
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
                    <>Update Password <ArrowRight size={18} /></>
                )}
            </button>

            <div className="text-center pt-4 border-t border-white/5">
                <Link 
                    href="/forgot-password" 
                    className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={14} /> Request a new reset link
                </Link>
            </div>
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <main className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <AuthAurora />
            <section className="mx-auto grid min-h-[calc(100vh-17rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <Lock size={14} /> Password Recovery System
                    </div>
                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Set a new password.</h1>
                    <p className="mt-5 text-base leading-7 text-slate-400">
                        Ensure your password contains at least 8 characters, with letters and numbers. Never reuse passwords from other platforms.
                    </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-6 sm:p-8">
                        <Suspense fallback={
                            <div className="text-center flex flex-col items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-4" />
                                <p className="text-sm text-slate-400">Loading reset context...</p>
                            </div>
                        }>
                            <ResetPasswordContent />
                        </Suspense>
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
