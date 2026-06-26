'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react';
import api from '@/lib/api/client';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [status, setStatus]   = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMsg, setError]  = useState('');
    const verifiedRef = useRef(false);

    useEffect(() => {
        if (!token) { setStatus('error'); setError('Verification token is missing from the link.'); return; }
        if (verifiedRef.current) return;
        verifiedRef.current = true;

        api.post('/auth/verify-email', { token })
            .then(() => setStatus('success'))
            .catch((err: any) => { setStatus('error'); setError(err.message || 'The verification link is invalid or has expired.'); });
    }, [token]);

    if (status === 'loading') return (
        <div className="flex flex-col items-center py-10 text-center space-y-4">
            <Loader2 size={40} className="animate-spin text-cyan-400" />
            <p className="font-black text-white text-lg">Verifying your email…</p>
            <p className="text-sm text-slate-400">Please wait while we validate your link.</p>
        </div>
    );

    if (status === 'success') return (
        <div className="flex flex-col items-center py-10 text-center space-y-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                <CheckCircle2 size={36} className="text-emerald-400" />
            </div>
            <div>
                <h3 className="text-2xl font-black text-white">Email Verified!</h3>
                <p className="mt-2 text-sm text-slate-400 leading-6">
                    Your email address has been verified. Your account is now fully active.
                </p>
            </div>
            <Link href="/dashboard"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-black text-slate-950 text-sm shadow-lg transition-all hover:scale-[1.01]">
                Go to Dashboard <ArrowRight size={16} />
            </Link>
        </div>
    );

    return (
        <div className="flex flex-col items-center py-10 text-center space-y-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10">
                <XCircle size={36} className="text-rose-400" />
            </div>
            <div>
                <h3 className="text-2xl font-black text-white">Verification Failed</h3>
                <p className="mt-2 text-sm text-slate-400 leading-6">{errorMsg}</p>
            </div>
            <Link href="/login"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-6 text-sm font-black text-white transition-all hover:bg-white/[0.1]">
                Back to Sign In
            </Link>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-white">
            {/* Aurora */}
            <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
                <div className="absolute bottom-0 right-[-4rem] h-[24rem] w-[24rem] rounded-full bg-violet-400/8 blur-3xl" />
            </div>

            <div className="w-full max-w-md space-y-6">
                {/* Brand */}
                <div className="text-center">
                    <div className="inline-flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-800/80 to-slate-900/80 px-4 py-2.5 shadow-xl">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-rose-600">
                            <Rocket size={16} className="text-white" />
                        </div>
                        <span className="font-black text-white">DeployForge</span>
                    </div>
                    <p className="mt-3 text-xs font-black uppercase tracking-widest text-slate-500">Email Verification</p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.06] p-1 shadow-2xl backdrop-blur-xl">
                    <div className="rounded-xl border border-white/[0.07] bg-slate-950/90 p-6">
                        <Suspense fallback={
                            <div className="flex flex-col items-center py-10 text-center space-y-4">
                                <Loader2 size={36} className="animate-spin text-cyan-400" />
                                <p className="text-sm text-slate-400">Loading verification context…</p>
                            </div>
                        }>
                            <VerifyEmailContent />
                        </Suspense>
                    </div>
                </div>
            </div>
        </main>
    );
}
