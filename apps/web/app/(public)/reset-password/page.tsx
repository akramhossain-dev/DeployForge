'use client';

import { useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, ArrowLeft, CheckCircle2, ShieldAlert, Loader2, Lock, ArrowRight, Shield } from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { PasswordInput } from '@/components/ui';

function validatePassword(pass: string): { valid: true } | { valid: false; message: string } {
    if (pass.length < 6) return { valid: false, message: 'Password must be at least 6 characters long' };
    const weak = new Set(['password', 'password123', 'password1234', 'qwerty123456', 'letmein123456', 'admin123456', 'deployforge123']);
    if (weak.has(pass.toLowerCase()) || /(.)\1{5,}/.test(pass) || /^(?:1234567890|0987654321)/.test(pass)) {
        return { valid: false, message: 'Password is too weak' };
    }
    if (!/[a-z]/.test(pass) || !/[A-Z]/.test(pass) || !/\d/.test(pass) || !/[^A-Za-z0-9]/.test(pass)) {
        return { valid: false, message: 'Must include uppercase, lowercase, number, and symbol' };
    }
    return { valid: true };
}

const FIELD = 'h-12 w-full rounded-xl border bg-slate-950/80 px-4 text-sm text-white outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-400/50';

function ResetPasswordContent() {
    const addToast = useToastStore(s => s.addToast);
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError]   = useState<string | null>(null);

    const [passwordError, setPasswordError]   = useState<string | null>(null);
    const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

    const passwordRef = useRef<HTMLInputElement>(null);
    const confirmPasswordRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null); setPasswordError(null); setConfirmPasswordError(null);

        if (!token) {
            const msg = 'Reset token is missing from URL';
            setError(msg); addToast({ title: 'Validation Error', description: msg, severity: 'error' });
            return;
        }

        let isValid = true;
        const passCheck = validatePassword(password);
        if (!password) { setPasswordError('Password is required'); isValid = false; }
        else if (passCheck.valid === false) { setPasswordError(passCheck.message); isValid = false; }

        if (!confirmPassword) { setConfirmPasswordError('Please confirm your new password'); isValid = false; }
        else if (password !== confirmPassword) { setConfirmPasswordError('Passwords do not match'); isValid = false; }

        if (!isValid) {
            if (!password || !passCheck.valid) passwordRef.current?.focus();
            else if (!confirmPassword || password !== confirmPassword) confirmPasswordRef.current?.focus();
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post('/auth/reset-password', { token, password });
            addToast({ title: 'Success', description: 'Password reset successfully', severity: 'success' });
            setIsSuccess(true);
        } catch (err: any) {
            const msg = err.message || 'Failed to reset password';
            setError(msg); addToast({ title: 'Error', description: msg, severity: 'error' });
        } finally { setIsSubmitting(false); }
    };

    if (!token) {
        return (
            <div className="flex flex-col items-center py-8 text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10">
                    <ShieldAlert className="text-rose-400" size={32} />
                </div>
                <div>
                    <h3 className="text-2xl font-black text-white">Invalid Reset Link</h3>
                    <p className="mt-2 text-sm text-slate-400 leading-6">
                        This password reset link is invalid, expired, or incomplete. Please request a new password reset link.
                    </p>
                </div>
                <Link href="/forgot-password"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-black text-slate-950 text-sm transition-all hover:scale-[1.01]">
                    Request New Link
                </Link>
            </div>
        );
    }

    if (isSuccess) {
        return (
            <div className="flex flex-col items-center py-8 text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                    <CheckCircle2 className="text-emerald-400" size={32} />
                </div>
                <div>
                    <h3 className="text-2xl font-black text-white">Password Updated</h3>
                    <p className="mt-2 text-sm text-slate-400 leading-6">
                        Your password has been successfully updated. You can now sign in using your new credentials.
                    </p>
                </div>
                <Link href="/login"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-black text-slate-950 text-sm transition-all hover:scale-[1.01]">
                    Go to Sign In
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <h2 className="text-2xl font-black tracking-tight">Reset Password</h2>
                <p className="mt-1.5 text-sm text-slate-500">Choose a new, strong password for your account.</p>
            </div>

            <div>
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">New Password</span>
                <PasswordInput
                    ref={passwordRef} autoComplete="new-password"
                    value={password} onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                    disabled={isSubmitting} placeholder="New Password"
                    className={clsx(FIELD, passwordError ? 'border-rose-500/60' : 'border-white/[0.1]')}
                />
                {passwordError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{passwordError}</p>}
            </div>

            <div>
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Confirm New Password</span>
                <PasswordInput
                    ref={confirmPasswordRef} autoComplete="new-password"
                    value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); if (confirmPasswordError) setConfirmPasswordError(null); }}
                    disabled={isSubmitting} placeholder="Confirm Password"
                    className={clsx(FIELD, confirmPasswordError ? 'border-rose-500/60' : 'border-white/[0.1]')}
                />
                {confirmPasswordError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{confirmPasswordError}</p>}
            </div>

            {error && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.07] p-3 text-sm text-rose-200">{error}</div>
            )}

            <button type="submit" disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-slate-950 shadow-lg transition-all hover:scale-[1.01] hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting
                    ? <Loader2 className="animate-spin" size={18} />
                    : <><Lock size={15} /> Update Password <ArrowRight size={15} /></>}
            </button>

            <div className="border-t border-white/[0.06] pt-4 text-center">
                <Link href="/forgot-password" className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-white">
                    <ArrowLeft size={13} /> Request a new reset link
                </Link>
            </div>
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <main className="relative isolate overflow-hidden bg-slate-950 text-white">
            {/* Aurora */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute left-[-8rem] top-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
                <div className="absolute bottom-0 right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-violet-400/8 blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
                {/* ── Left panel ── */}
                <div className="max-w-lg">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100">
                        <Lock size={13} /> Security System
                    </div>
                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Set a new password.</h1>
                    <p className="mt-5 text-base leading-7 text-slate-400">
                        Ensure your password contains at least 6 characters, with uppercase, lowercase, numbers, and symbols. Never reuse passwords from other platforms.
                    </p>

                    <div className="mt-8 space-y-3">
                        {[
                            { label: 'Complexity requirements enforced' },
                            { label: 'Instant revocation of active sessions' },
                            { label: 'Secure token protection validation' },
                        ].map(f => (
                            <div key={f.label} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                                <Shield size={14} className="shrink-0 text-cyan-400" />
                                <span className="text-sm text-slate-300">{f.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Right form card ── */}
                <div className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.06] p-1 shadow-2xl shadow-slate-950/80 backdrop-blur-xl">
                    <div className="rounded-xl border border-white/[0.08] bg-slate-950/90 p-6 sm:p-8">
                        <Suspense fallback={
                            <div className="text-center flex flex-col items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-4" />
                                <p className="text-sm text-slate-400">Loading reset context…</p>
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
