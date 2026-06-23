'use client';

import { ArrowRight, CheckCircle2, Chrome, Github, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { PasswordInput } from '@/components/ui';

function validatePassword(pass: string): { valid: true } | { valid: false; message: string } {
    if (pass.length < 6) {
        return { valid: false, message: 'Password must be at least 6 characters long' };
    }
    const weakPasswords = new Set(['password', 'password123', 'password1234', 'qwerty123456', 'letmein123456', 'admin123456', 'deployforge123']);
    if (weakPasswords.has(pass.toLowerCase()) || /(.)\1{5,}/.test(pass) || /^(?:1234567890|0987654321)/.test(pass)) {
        return { valid: false, message: 'Password is too weak' };
    }
    if (!/[a-z]/.test(pass) || !/[A-Z]/.test(pass) || !/\d/.test(pass) || !/[^A-Za-z0-9]/.test(pass)) {
        return { valid: false, message: 'Password must include uppercase, lowercase, number, and symbol characters' };
    }
    return { valid: true };
}

export default function RegisterPage() {
    const [step, setStep] = useState<'register' | 'verify'>('register');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [githubLoading, setGithubLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verified, setVerified] = useState(false);

    // Field-level error states
    const [nameError, setNameError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [termsError, setTermsError] = useState<string | null>(null);

    // Refs for focus management
    const nameRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    const auth = useAuthSession();
    const router = useRouter();

    useEffect(() => {
        if (!auth.isLoading && auth.isAuthenticated) router.replace('/dashboard');
    }, [auth.isAuthenticated, auth.isLoading, router]);

    async function submitRegister(event: FormEvent) {
        event.preventDefault();
        setNameError(null);
        setEmailError(null);
        setPasswordError(null);
        setTermsError(null);
        setError(null);

        let isValid = true;

        if (name && name.trim().length > 120) {
            setNameError('Name must be 120 characters or fewer');
            isValid = false;
        }

        if (!email.trim()) {
            setEmailError('Email is required');
            isValid = false;
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            setEmailError('Please enter a valid email address');
            isValid = false;
        }

        const passCheck = validatePassword(password);
        if (!password) {
            setPasswordError('Password is required');
            isValid = false;
        } else if (passCheck.valid === false) {
            setPasswordError(passCheck.message);
            isValid = false;
        }

        if (!termsAccepted) {
            setTermsError('You must accept Privacy Policy and Terms');
            isValid = false;
        }

        if (!isValid) {
            if (name && name.trim().length > 120) {
                nameRef.current?.focus();
            } else if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
                emailRef.current?.focus();
            } else if (!password || !passCheck.valid) {
                passwordRef.current?.focus();
            }
            return;
        }

        setLoading(true);
        try {
            await api.post<{ email: string; message: string }>('/auth/register', { name, email, password, termsAccepted });
            setStep('verify');
        } catch (err: any) {
            setError(err.message || 'Unable to create your account.');
        } finally {
            setLoading(false);
        }
    }

    function signUpWithGitHub() {
        setGithubLoading(true);
        window.location.href = `${api.baseUrl}/auth/github`;
    }

    function signUpWithGoogle() {
        setGoogleLoading(true);
        window.location.href = `${api.baseUrl}/auth/google`;
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
                                <label className="block">
                                    <span className="text-sm font-bold text-slate-300">Name</span>
                                    <input
                                        ref={nameRef}
                                        value={name}
                                        onChange={(event) => {
                                            setName(event.target.value);
                                            if (nameError) setNameError(null);
                                        }}
                                        autoComplete="name"
                                        className={clsx(
                                            "mt-2 h-12 w-full rounded-lg border bg-slate-950 px-4 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300",
                                            nameError ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                        )}
                                        placeholder="Name"
                                        disabled={loading || googleLoading || githubLoading}
                                    />
                                    {nameError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{nameError}</p>}
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-slate-300">Email</span>
                                    <input
                                        ref={emailRef}
                                        type="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(event) => {
                                            setEmail(event.target.value);
                                            if (emailError) setEmailError(null);
                                        }}
                                        className={clsx(
                                            "mt-2 h-12 w-full rounded-lg border bg-slate-950 px-4 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300",
                                            emailError ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                        )}
                                        placeholder="Email"
                                        disabled={loading || googleLoading || githubLoading}
                                    />
                                    {emailError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{emailError}</p>}
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-slate-300">Password</span>
                                    <PasswordInput
                                        ref={passwordRef}
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(event) => {
                                            setPassword(event.target.value);
                                            if (passwordError) setPasswordError(null);
                                        }}
                                        wrapperClassName="mt-2"
                                        className={clsx(
                                            "h-12 w-full rounded-lg border bg-slate-950 px-4 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300",
                                            passwordError ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                        )}
                                        placeholder="Password"
                                        disabled={loading || googleLoading || githubLoading}
                                    />
                                    {passwordError && <p className="mt-1.5 text-xs font-semibold text-rose-400">{passwordError}</p>}
                                </label>
                                <label className={clsx(
                                    "flex items-start gap-3 rounded-lg border p-4 text-sm leading-6 text-slate-300 transition-colors",
                                    termsError ? "border-rose-500/50 bg-rose-500/5" : "border-white/10 bg-slate-950/55"
                                )}>
                                    <input
                                        type="checkbox"
                                        checked={termsAccepted}
                                        onChange={(event) => {
                                            setTermsAccepted(event.target.checked);
                                            if (termsError) setTermsError(null);
                                        }}
                                        className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-slate-950 text-cyan-300 accent-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                                        disabled={loading || googleLoading || githubLoading}
                                    />
                                    <span>
                                        I agree to{' '}
                                        <Link href="/privacy-policy" className="font-black text-cyan-300 transition-colors hover:text-cyan-200">
                                            Privacy Policy
                                        </Link>{' '}
                                        and{' '}
                                        <Link href="/terms" className="font-black text-cyan-300 transition-colors hover:text-cyan-200">
                                            Terms of Service
                                        </Link>
                                        .
                                    </span>
                                </label>
                                {termsError && <p className="text-xs font-semibold text-rose-400">{termsError}</p>}
                                {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
                                <button disabled={loading || googleLoading || githubLoading || auth.isLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <>Create account <ArrowRight size={18} /></>}
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="h-px flex-1 bg-white/10" />
                                    <span className="text-xs font-black uppercase text-slate-500">or</span>
                                    <div className="h-px flex-1 bg-white/10" />
                                </div>
                                <button
                                    type="button"
                                    onClick={signUpWithGoogle}
                                    disabled={googleLoading || githubLoading || loading || auth.isLoading}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white px-5 text-sm font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {googleLoading ? <Loader2 className="animate-spin" size={18} /> : <Chrome size={18} />}
                                    Sign up with Google
                                </button>
                                <button
                                    type="button"
                                    onClick={signUpWithGitHub}
                                    disabled={githubLoading || googleLoading || loading || auth.isLoading}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-white transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {githubLoading ? <Loader2 className="animate-spin" size={18} /> : <Github size={18} />}
                                    Sign up with GitHub
                                </button>
                                <p className="text-xs leading-5 text-slate-500">
                                    By continuing with Google or GitHub, you agree to the{' '}
                                    <Link href="/privacy-policy" className="font-bold text-cyan-300 hover:text-cyan-200">Privacy Policy</Link>
                                    {' '}and{' '}
                                    <Link href="/terms" className="font-bold text-cyan-300 hover:text-cyan-200">Terms of Service</Link>.
                                </p>
                            </form>
                        ) : (
                            <form onSubmit={submitOtp} className="space-y-5">
                                <div>
                                    <MailCheck className="text-cyan-300" size={28} />
                                    <h2 className="mt-4 text-2xl font-black tracking-tight">Verify email</h2>
                                    <p className="mt-2 text-sm text-slate-400">Enter the 6-digit code sent to {email}.</p>
                                </div>
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
