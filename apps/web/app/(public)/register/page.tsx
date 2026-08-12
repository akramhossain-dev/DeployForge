'use client';

import { ArrowRight, CheckCircle2, Chrome, Github, Loader2, MailCheck, Rocket } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import api from '@/lib/api/client';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { PasswordInput } from '@/components/ui';

const INPUT_STYLE = 'w-full rounded-md border bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666]';
const INPUT_OK    = 'border-[#1F1F1F] focus:border-[#333333]';
const INPUT_ERR   = 'border-rose-900/80 focus:border-rose-700';

function validatePassword(pass: string): { valid: true } | { valid: false; message: string } {
    if (pass.length < 6) return { valid: false, message: 'Password must be at least 6 characters' };
    const weak = new Set(['password', 'password123', 'qwerty123456', 'letmein123456', 'admin123456', 'deployforge123']);
    if (weak.has(pass.toLowerCase()) || /(.)\1{5,}/.test(pass)) return { valid: false, message: 'Password is too weak' };
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
        <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-black px-4 py-12 text-white">
            <div className="w-full max-w-sm sm:max-w-md space-y-6">

                {/* Brand Header */}
                <div className="text-center space-y-2">
                    <Link href="/" className="inline-flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-white">
                            <Rocket size={14} />
                        </div>
                        <span className="text-sm font-semibold tracking-tight text-white">DeployForge</span>
                    </Link>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Create your DeployForge account
                    </h1>
                    <p className="text-xs text-[#A1A1A1]">
                        Start deploying on infrastructure you control.
                    </p>
                </div>

                {/* Auth Card Container */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 shadow-sm">

                    {/* ── Verified State ── */}
                    {verified ? (
                        <div className="text-center py-4 space-y-4">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] text-emerald-400">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white">Email Verified</h2>
                                <p className="mt-1 text-xs text-[#A1A1A1]">Your account is ready. Sign in to open your console.</p>
                            </div>
                            <Link
                                href="/login"
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                            >
                                <span>Go to Login</span>
                                <ArrowRight size={13} />
                            </Link>
                        </div>

                    /* ── OTP Verification Step ── */
                    ) : step === 'verify' ? (
                        <form onSubmit={submitOtp} className="space-y-4">
                            <div className="text-center space-y-1">
                                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] text-white">
                                    <MailCheck size={18} />
                                </div>
                                <h2 className="text-sm font-semibold text-white">Verify Your Email</h2>
                                <p className="text-xs text-[#A1A1A1]">
                                    Enter the 6-digit code sent to <span className="font-mono text-white">{email}</span>.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                    Verification Code
                                </label>
                                <input
                                    required
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    minLength={6}
                                    value={otp}
                                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                    className="h-12 w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 text-center font-mono text-xl tracking-[0.5em] text-white outline-none focus:border-[#333333]"
                                    placeholder="000000"
                                />
                            </div>

                            {error && (
                                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-2.5 text-xs font-mono text-rose-300">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={busy}
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <span>Verify & Continue</span>}
                            </button>
                        </form>

                    /* ── Registration Form Step ── */
                    ) : (
                        <form onSubmit={submitRegister} className="space-y-4">
                            {/* OAuth */}
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => { setGoogleLoading(true); window.location.href = `${api.baseUrl}/auth/google`; }}
                                    disabled={busy}
                                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] text-xs font-medium text-white transition-colors hover:bg-[#1A1A1A] disabled:opacity-50"
                                >
                                    {googleLoading ? <Loader2 size={14} className="animate-spin" /> : <Chrome size={14} />}
                                    <span>Sign up with Google</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setGithubLoading(true); window.location.href = `${api.baseUrl}/auth/github`; }}
                                    disabled={busy}
                                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] text-xs font-medium text-white transition-colors hover:bg-[#1A1A1A] disabled:opacity-50"
                                >
                                    {githubLoading ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
                                    <span>Sign up with GitHub</span>
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="my-4 flex items-center gap-3">
                                <div className="h-px flex-1 bg-[#1F1F1F]" />
                                <span className="text-[10px] font-mono text-[#666666] uppercase">OR</span>
                                <div className="h-px flex-1 bg-[#1F1F1F]" />
                            </div>

                            {/* Fields */}
                            <div>
                                <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                    Full Name
                                </label>
                                <input
                                    ref={nameRef}
                                    value={name}
                                    onChange={e => { setName(e.target.value); if (nameError) setNameError(null); }}
                                    autoComplete="name"
                                    placeholder="Jane Doe"
                                    disabled={busy}
                                    className={clsx(INPUT_STYLE, nameError ? INPUT_ERR : INPUT_OK)}
                                />
                                {nameError && <p className="mt-1 text-xs font-mono text-rose-400">{nameError}</p>}
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                    Email Address
                                </label>
                                <input
                                    ref={emailRef}
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                                    placeholder="jane@company.com"
                                    disabled={busy}
                                    className={clsx(INPUT_STYLE, emailError ? INPUT_ERR : INPUT_OK)}
                                />
                                {emailError && <p className="mt-1 text-xs font-mono text-rose-400">{emailError}</p>}
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                    Password
                                </label>
                                <PasswordInput
                                    ref={passwordRef}
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                                    className={clsx(INPUT_STYLE, passwordError ? INPUT_ERR : INPUT_OK)}
                                    placeholder="Min 6 chars, upper, lower, symbol"
                                    disabled={busy}
                                />
                                {passwordError && <p className="mt-1 text-xs font-mono text-rose-400">{passwordError}</p>}
                            </div>

                            {/* Terms Checkbox */}
                            <div>
                                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#A1A1A1]">
                                    <input
                                        type="checkbox"
                                        checked={termsAccepted}
                                        onChange={e => { setTermsAccepted(e.target.checked); if (termsError) setTermsError(null); }}
                                        className="mt-0.5 h-3.5 w-3.5 rounded border-[#1F1F1F] bg-[#000000] accent-white"
                                        disabled={busy}
                                    />
                                    <span>
                                        I agree to the{' '}
                                        <Link href="/privacy-policy" className="text-white hover:underline">Privacy Policy</Link>
                                        {' '}and{' '}
                                        <Link href="/terms" className="text-white hover:underline">Terms of Service</Link>.
                                    </span>
                                </label>
                                {termsError && <p className="mt-1 text-xs font-mono text-rose-400">{termsError}</p>}
                            </div>

                            {error && (
                                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-2.5 text-xs font-mono text-rose-300">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={busy}
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                            >
                                {loading ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <>
                                        <span>Create account</span>
                                        <ArrowRight size={13} />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer Link */}
                {!verified && (
                    <p className="text-center text-xs text-[#A1A1A1]">
                        Already have an account?{' '}
                        <Link href="/login" className="font-semibold text-white hover:underline">
                            Sign in
                        </Link>
                    </p>
                )}
            </div>
        </main>
    );
}
