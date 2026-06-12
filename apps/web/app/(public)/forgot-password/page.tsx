'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

export default function ForgotPasswordPage() {
    const addToast = useToastStore((state) => state.addToast);
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            addToast({ title: 'Validation Error', description: 'Email address is required', severity: 'error' });
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post('/auth/forgot-password', { email });
            addToast({ title: 'Success', description: 'If the email exists, a password reset link has been sent', severity: 'success' });
            setIsSent(true);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to submit request', severity: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
                        Deploy<span className="text-cyan-400">Forge</span>
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        Password Recovery System
                    </p>
                </div>

                <Panel className="border-white/5 bg-slate-900/50 p-8 backdrop-blur-xl">
                    {isSent ? (
                        <div className="text-center space-y-4">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
                                <Mail size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-white">Check your email</h3>
                            <p className="text-sm text-slate-400">
                                We've sent a password reset link to <span className="text-white font-medium">{email}</span> if it is registered on DeployForge.
                            </p>
                            <div className="pt-4">
                                <Link 
                                    href="/login" 
                                    className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 font-semibold"
                                >
                                    <ArrowLeft size={16} /> Return to Login
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-slate-500"><Mail size={18} /></span>
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-slate-950 border border-white/10 rounded-md py-2.5 pl-10 pr-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                        placeholder="you@example.com"
                                    />
                                </div>
                            </div>

                            <Button type="submit" className="w-full py-2.5" loading={isSubmitting}>
                                <Send size={16} className="mr-2" /> Send Reset Link
                            </Button>

                            <div className="text-center pt-2 border-t border-white/5">
                                <Link 
                                    href="/login" 
                                    className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
                                >
                                    <ArrowLeft size={14} /> Back to Sign In
                                </Link>
                            </div>
                        </form>
                    )}
                </Panel>
            </div>
        </div>
    );
}
