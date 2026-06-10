'use client';

import { ArrowRight, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import api from '@/lib/api/client';

export default function RegisterPage() {
    const [step, setStep] = useState<'register' | 'verify'>('register');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verified, setVerified] = useState(false);
    const [devOtp, setDevOtp] = useState<string | null>(null);

    async function submitRegister(event: FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const response = await api.post<{ email: string; message: string; devOtp?: string }>('/auth/register', { name, email, password });
            setDevOtp(response.devOtp || null);
            if (response.devOtp) setOtp(response.devOtp);
            setStep('verify');
        } catch (err: any) {
            setError(err.message || 'Unable to create your account.');
        } finally {
            setLoading(false);
        }
    }

    async function submitOtp(event: FormEvent) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await api.post('/auth/verify-otp', { email, otp });
            setVerified(true);
        } catch (err: any) {
            setError(err.message || 'Unable to verify this code.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <Link href="/" className="inline-flex items-center gap-2">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
                            <Rocket size={22} />
                        </div>
                        <span className="text-2xl font-black tracking-tight">DeployForge</span>
                    </Link>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-8">
                    {verified ? (
                        <div className="text-center">
                            <CheckCircle2 className="mx-auto text-emerald-300" size={42} />
                            <h1 className="mt-4 text-2xl font-black">Email verified</h1>
                            <p className="mt-2 text-sm text-slate-400">Your account is ready. Sign in to continue.</p>
                            <Link href="/login" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-cyan-400 px-5 font-bold text-slate-950 hover:bg-cyan-300">
                                Go to login
                            </Link>
                        </div>
                    ) : step === 'register' ? (
                        <form onSubmit={submitRegister} className="space-y-5">
                            <div>
                                <h1 className="text-2xl font-black">Create account</h1>
                                <p className="mt-1 text-sm text-slate-400">We will send a 6-digit verification code to your email.</p>
                            </div>
                            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-12 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 outline-none focus:border-cyan-400" placeholder="Name" />
                            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 outline-none focus:border-cyan-400" placeholder="Email" />
                            <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 outline-none focus:border-cyan-400" placeholder="Password" />
                            {error ? <p className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null}
                            <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
                                {loading ? <Loader2 className="animate-spin" /> : <>Create account <ArrowRight size={18} /></>}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={submitOtp} className="space-y-5">
                            <div>
                                <h1 className="text-2xl font-black">Verify email</h1>
                                <p className="mt-1 text-sm text-slate-400">Enter the 6-digit code sent to {email}.</p>
                            </div>
                            {devOtp ? (
                                <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/30 p-3 text-sm text-cyan-100">
                                    Development OTP: <span className="font-mono font-bold tracking-widest">{devOtp}</span>
                                </div>
                            ) : null}
                            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} minLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} className="h-14 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-cyan-400" placeholder="000000" />
                            {error ? <p className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null}
                            <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
                                {loading ? <Loader2 className="animate-spin" /> : 'Verify'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
