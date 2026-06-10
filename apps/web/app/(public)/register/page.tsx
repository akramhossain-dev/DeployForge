'use client';

import { ArrowRight, CheckCircle2, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { useAuthSession } from '@/hooks/useDeployForgeData';

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
    const auth = useAuthSession();
    const router = useRouter();

    useEffect(() => {
        if (!auth.isLoading && auth.isAuthenticated) router.replace('/dashboard');
    }, [auth.isAuthenticated, auth.isLoading, router]);

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
        <main className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <AuthAurora />
            <section className="mx-auto grid min-h-[calc(100vh-17rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <ShieldCheck size={14} /> Own the deployment path
                    </div>
                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Create your DeployForge account.</h1>
                    <p className="mt-5 text-base leading-7 text-slate-400">
                        Connect GitHub, add your first VPS, and start deploying from a console designed around infrastructure you control.
                    </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-6 sm:p-8">
                        {verified ? (
                            <div className="text-center">
                                <CheckCircle2 className="mx-auto text-emerald-300" size={42} />
                                <h2 className="mt-4 text-2xl font-black">Email verified</h2>
                                <p className="mt-2 text-sm text-slate-400">Your account is ready. Sign in to continue.</p>
                                <Link href="/login" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-black text-slate-950">
                                    Go to login
                                </Link>
                            </div>
                        ) : step === 'register' ? (
                            <form onSubmit={submitRegister} className="space-y-5">
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">Register</h2>
                                    <p className="mt-2 text-sm text-slate-400">We will send a 6-digit verification code to your email.</p>
                                </div>
                                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300" placeholder="Name" />
                                <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300" placeholder="Email" />
                                <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300" placeholder="Password" />
                                {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
                                <button disabled={loading || auth.isLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <>Create account <ArrowRight size={18} /></>}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={submitOtp} className="space-y-5">
                                <div>
                                    <MailCheck className="text-cyan-300" size={28} />
                                    <h2 className="mt-4 text-2xl font-black tracking-tight">Verify email</h2>
                                    <p className="mt-2 text-sm text-slate-400">Enter the 6-digit code sent to {email}.</p>
                                </div>
                                {devOtp ? (
                                    <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm text-cyan-100">
                                        Development OTP: <span className="font-mono font-bold tracking-widest">{devOtp}</span>
                                    </div>
                                ) : null}
                                <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} minLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} className="h-14 w-full rounded-lg border border-white/10 bg-slate-950 px-4 text-center font-mono text-xl tracking-[0.4em] outline-none transition-colors focus:border-cyan-300" placeholder="000000" />
                                {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
                                <button disabled={loading || auth.isLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : 'Verify'}
                                </button>
                            </form>
                        )}

                        {!verified ? (
                            <p className="mt-6 text-center text-sm text-slate-400">
                                Already have an account?{' '}
                                <Link href="/login" className="font-black text-cyan-300 transition-colors hover:text-cyan-200">
                                    Sign in
                                </Link>
                            </p>
                        ) : null}
                    </div>
                </div>
            </section>
        </main>
    );
}

function AuthAurora() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute right-[-8rem] top-8 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="absolute bottom-0 left-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}
