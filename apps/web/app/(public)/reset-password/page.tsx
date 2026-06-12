'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, ArrowLeft, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

function ResetPasswordContent() {
    const addToast = useToastStore((state) => state.addToast);
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) {
            addToast({ title: 'Validation Error', description: 'Reset token is missing from URL', severity: 'error' });
            return;
        }

        if (password.length < 8) {
            addToast({ title: 'Validation Error', description: 'Password must be at least 8 characters long', severity: 'error' });
            return;
        }

        if (password !== confirmPassword) {
            addToast({ title: 'Validation Error', description: 'Passwords do not match', severity: 'error' });
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post('/auth/reset-password', { token, password });
            addToast({ title: 'Success', description: 'Password has been reset successfully', severity: 'success' });
            setIsSuccess(true);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to reset password', severity: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Panel className="border-white/5 bg-slate-900/50 p-8 backdrop-blur-xl">
            {!token ? (
                <div className="text-center space-y-4 py-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
                        <ShieldAlert size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Invalid Reset Link</h3>
                    <p className="text-sm text-slate-400">
                        This password reset link appears to be invalid or incomplete. Please request a new link.
                    </p>
                    <div className="pt-4">
                        <Link 
                            href="/forgot-password" 
                            className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                            Request New Link
                        </Link>
                    </div>
                </div>
            ) : isSuccess ? (
                <div className="text-center space-y-4 py-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                        <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Password Updated</h3>
                    <p className="text-sm text-slate-400">
                        Your password has been successfully updated. You can now log in using your new credentials.
                    </p>
                    <div className="pt-4">
                        <Link 
                            href="/login" 
                            className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                            <ArrowLeft size={16} /> Sign In
                        </Link>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="pass" className="block text-sm font-semibold text-slate-300 mb-2">
                                New Password
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-500"><KeyRound size={18} /></span>
                                <input
                                    id="pass"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-white/10 rounded-md py-2.5 pl-10 pr-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="confirmPass" className="block text-sm font-semibold text-slate-300 mb-2">
                                Confirm New Password
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-500"><KeyRound size={18} /></span>
                                <input
                                    id="confirmPass"
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-white/10 rounded-md py-2.5 pl-10 pr-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full py-2.5" loading={isSubmitting}>
                        Reset Password
                    </Button>
                </form>
            )}
        </Panel>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
                        Deploy<span className="text-cyan-400">Forge</span>
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        Password Reset
                    </p>
                </div>

                <Suspense fallback={
                    <Panel className="border-white/5 bg-slate-900/50 p-8 backdrop-blur-xl text-center flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-4" />
                        <p className="text-sm text-slate-400">Loading reset context...</p>
                    </Panel>
                }>
                    <ResetPasswordContent />
                </Suspense>
            </div>
        </div>
    );
}
