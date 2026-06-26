'use client';

import { ArrowRight, CheckCircle2, Chrome, Github, Loader2, MailCheck, Rocket, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { PasswordInput } from '@/components/ui';

const FIELD = 'h-12 w-full rounded-xl border bg-slate-950/80 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-600';
const FIELD_OK  = 'border-white/[0.1] focus:border-cyan-400/60';
const FIELD_ERR = 'border-rose-500/60 focus:border-rose-400';

function validatePassword(pass: string): { valid: true } | { valid: false; message: string } {
    if (pass.length < 6) return { valid: false, message: 'Password must be at least 6 characters' };
    const weak = new Set(['password', 'password123', 'qwerty123456', 'letmein123456', 'admin123456', 'deployforge123']);
    if (weak.has(pass.toLowerCase()) || /(.)\\1{5,}/.test(pass)) return { valid: false, message: 'Password is too weak' };
    if (!/[a-z]/.test(pass) || !/[A-Z]/.test(pass) || !/\d/.test(pass) || !/[^A-Za-z0-9]/.test(pass))
        return { valid: false, message: 'Must include uppercase, lowercase, number, and symbol' };
    return { valid: true };
}

export default function RegisterPage() {
    const [step,          setStep]          = useState<'register' | 'verify'>('register');
    const [name,          setName]          = useState('');
    const [email,         setEmail]         = useState('');
    const [password,      setPassword]      = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [otp,           setOtp]           = useState('');
    const [loading,       setLoading]       = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [githubLoading, setGithubLoading] = useState(false);
    const [error,         setError]         = useState<string | null>(null);
    const [verified,      setVerified]      = useState(false);

    const [nameError,     setNameError]     = useState<string | null>(null);
    const [emailError,    setEmailError]    = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [termsError,    setTermsError]    = useState<string | null>(null);

    const nameRef     = useRef<HTMLInputElement>(null);
    const emailRef    = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    const auth   = useAuthSession();
    const router = useRouter();
    const busy   = loading || googleLoading || githubLoading || auth.isLoading;

    useEffect(() => {
        if (!auth.isLoading && auth.isAuthenticated) router.replace('/dashboard');
    }, [auth.isAuthenticated, auth.isLoading, router]);

    async function submitRegister(e: FormEvent) {
        e.preventDefault();
        setNameError(null); setEmailError(null); setPasswordError(null); setTermsError(null); setError(null);
        let ok = true;
        if (name && name.trim().length > 120) { setNameError('Name must be 120 characters or fewer'); ok = false; }
        if (!email.trim()) { setEmailError('Email is required'); ok = false; }
        else if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Please enter a valid email'); ok = false; }
        const passCheck = validatePassword(password);
        if (!password) { setPasswordError('Password is required'); ok = false; }
        else if (passCheck.valid === false) { setPasswordError(passCheck.message); ok = false; }
        if (!termsAccepted) { setTermsError('You must accept Privacy Policy and Terms'); ok = false; }
        if (!ok) { if (!email.trim()) emailRef.current?.focus(); else if (!password || !passCheck.valid) passwordRef.current?.focus(); return; }
        setLoading(true);
        try {
            await api.post('/auth/register', { name, email, password, termsAccepted });
            setStep('verify');
        } catch (err: any) {
            setError(err.message || 'Unable to create your account.');
        } finally { setLoading(false); }
    }

    async function submitOtp(e: FormEvent) {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            await api.post('/auth/verify-otp', { email, otp });
            setVerified(true);
        } catch (err: any) {
            setError(err.message || 'Unable to verify this code.');
        } finally { setLoading(false); }
    }

    return (
        <main className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <AuthAurora />

            <section className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl items-center gap-12 lg:grid-cols-[1fr_480px]">
                {/* Left copy */}
                <div className="hidden lg:block">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/20 to-cyan-300/5 text-cyan-200">
                            <Rocket size={17} />
                        </span>
                        <span className="text-sm font-black tracking-tight text-white">DeployForge</span>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-200">
                        <ShieldCheck size={11} /> Own the deployment path
                    </div>
                    <h1 className="mt-6 max-w-sm text-4xl font-black leading-tight tracking-tight text-white lg:text-5xl">
                        Start deploying on infrastructure you control.
                    </h1>
                    <p className="mt-5 max-w-sm text-base leading-7 text-slate-400">
                        Connect GitHub, add your first VPS, and ship from a console designed around infrastructure you own.
                    </p>
                    <div className="mt-8 flex flex-col gap-3">
                        {[
                            'Free to use, self-hosted',
                            'No vendor lock-in or usage limits',
                            'SSH-based VPS deployments',
                            'Real-time build log streaming',
                        ].map(item => (
                            <div key={item} className="flex items-center gap-2.5 text-sm text-slate-500">
                                <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Form card */}
                <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.06] p-1.5 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                    <div className="rounded-xl border border-white/[0.07] bg-slate-950/90 p-6 sm:p-8">

                        {/* ── Verified state ── */}
                        {verified ? (
                            <div className="flex flex-col items-center py-6 text-center">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/8">
                                    <CheckCircle2 size={32} className="text-emerald-300" />
                                </div>
                                <p className="mt-5 text-[10px] font-black uppercase tracking-widest text-emerald-400/70">All Done</p>
                                <h2 className="mt-2 text-2xl font-black text-white">Email Verified!</h2>
                                <p className="mt-2 text-sm text-slate-400">Your account is ready. Sign in to continue.</p>
                                <Link href="/login" className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.02]">
                                    Go to Login <ArrowRight size={15} />
                                </Link>
                            </div>

                        /* ── OTP step ── */
                        ) : step === 'verify' ? (
                            <form onSubmit={submitOtp} className="space-y-5">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/8">
                                    <MailCheck size={24} className="text-cyan-300" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300/70">Step 2 of 2</p>
                                    <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Verify Your Email</h2>
                                    <p className="mt-1.5 text-sm text-slate-400">Enter the 6-digit code sent to <span className="font-bold text-white">{email}</span>.</p>
                                </div>
                                <input
                                    required inputMode="numeric" autoComplete="one-time-code" maxLength={6} minLength={6}
                                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                    className="h-16 w-full rounded-xl border border-white/[0.1] bg-slate-950/80 px-4 text-center font-mono text-3xl tracking-[0.6em] text-white outline-none transition-colors focus:border-cyan-400/60"
                                    placeholder="000000"
                                />
                                {error && <div className="rounded-xl border border-rose-400/25 bg-rose-500/8 p-3 text-sm text-rose-200">{error}</div>}
                                <button type="submit" disabled={busy}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : 'Verify & Continue'}
                                </button>
                            </form>

                        /* ── Register form ── */
                        ) : (
                            <form onSubmit={submitRegister} className="space-y-4">
                                <div className="mb-6">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300/70">Step 1 of 2</p>
                                    <h2 className="mt-1.5 text-2xl font-black tracking-tight text-white">Create Account</h2>
                                    <p className="mt-1 text-sm text-slate-500">We&apos;ll send a 6-digit code to verify your email.</p>
                                </div>

                                {/* OAuth */}
                                <div className="space-y-2.5">
                                    <button type="button" onClick={() => { setGoogleLoading(true); window.location.href = `${api.baseUrl}/auth/google`; }}
                                        disabled={busy}
                                        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.1] bg-white px-5 text-sm font-black text-slate-950 shadow-lg shadow-white/5 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50">
                                        {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <Chrome size={16} />}
                                        Sign up with Google
                                    </button>
                                    <button type="button" onClick={() => { setGithubLoading(true); window.location.href = `${api.baseUrl}/auth/github`; }}
                                        disabled={busy}
                                        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.07] px-5 text-sm font-black text-white transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50">
                                        {githubLoading ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
                                        Sign up with GitHub
                                    </button>
                                </div>

                                {/* Divider */}
                                <div className="flex items-center gap-3 py-1">
                                    <div className="h-px flex-1 bg-white/[0.07]" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">or</span>
                                    <div className="h-px flex-1 bg-white/[0.07]" />
                                </div>

                                {/* Fields */}
                                <label className="block">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Full Name</span>
                                    <input ref={nameRef} value={name} onChange={e => { setName(e.target.value); if (nameError) setNameError(null); }}
                                        autoComplete="name" placeholder="Jane Doe" disabled={busy}
                                        className={clsx('mt-2', FIELD, nameError ? FIELD_ERR : FIELD_OK)} />
                                    {nameError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{nameError}</p>}
                                </label>
                                <label className="block">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Email Address</span>
                                    <input ref={emailRef} type="email" autoComplete="email" value={email}
                                        onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                                        placeholder="jane@company.com" disabled={busy}
                                        className={clsx('mt-2', FIELD, emailError ? FIELD_ERR : FIELD_OK)} />
                                    {emailError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{emailError}</p>}
                                </label>
                                <label className="block">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Password</span>
                                    <PasswordInput ref={passwordRef} autoComplete="new-password" value={password}
                                        onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                                        wrapperClassName="mt-2"
                                        className={clsx(FIELD, passwordError ? FIELD_ERR : FIELD_OK)}
                                        placeholder="Min 6 chars, uppercase, symbol" disabled={busy} />
                                    {passwordError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{passwordError}</p>}
                                </label>

                                {/* Terms */}
                                <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-6 text-slate-300 transition-colors',
                                    termsError ? 'border-rose-500/40 bg-rose-500/5' : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]')}>
                                    <input type="checkbox" checked={termsAccepted}
                                        onChange={e => { setTermsAccepted(e.target.checked); if (termsError) setTermsError(null); }}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-300" disabled={busy} />
                                    <span className="text-sm text-slate-400">
                                        I agree to the{' '}
                                        <Link href="/privacy-policy" className="font-black text-cyan-300 hover:text-cyan-200">Privacy Policy</Link>
                                        {' '}and{' '}
                                        <Link href="/terms" className="font-black text-cyan-300 hover:text-cyan-200">Terms of Service</Link>.
                                    </span>
                                </label>
                                {termsError && <p className="text-xs font-semibold text-rose-400">{termsError}</p>}

                                {error && <div className="rounded-xl border border-rose-400/25 bg-rose-500/8 p-3 text-sm text-rose-200">{error}</div>}

                                <button type="submit" disabled={busy}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <>Create Account <ArrowRight size={16} /></>}
                                </button>
                            </form>
                        )}

                        {!verified && (
                            <p className="mt-6 text-center text-sm text-slate-500">
                                Already have an account?{' '}
                                <Link href="/login" className="font-black text-cyan-300 transition-colors hover:text-cyan-200">Sign in</Link>
                            </p>
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
            <div className="absolute right-[-8rem] top-8 h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute bottom-0 left-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/8 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
        </div>
    );
}
