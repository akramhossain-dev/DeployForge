'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Panel } from '@/components/ui';
import api from '@/lib/api/client';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const verifiedRef = useRef(false);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMessage('Verification token is missing from the link.');
            return;
        }

        if (verifiedRef.current) return;
        verifiedRef.current = true;

        const verify = async () => {
            try {
                await api.post('/auth/verify-email', { token });
                setStatus('success');
            } catch (err: any) {
                setStatus('error');
                setErrorMessage(err.message || 'The verification link is invalid or has expired.');
            }
        };

        verify();
    }, [token]);

    return (
        <Panel className="border-white/5 bg-slate-900/50 p-8 backdrop-blur-xl text-center">
            {status === 'loading' && (
                <div className="py-6 space-y-4 flex flex-col items-center">
                    <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
                    <h3 className="text-lg font-bold text-white">Verifying email...</h3>
                    <p className="text-sm text-slate-400">
                        Please wait while we verify your activation link.
                    </p>
                </div>
            )}

            {status === 'success' && (
                <div className="py-6 space-y-4 flex flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                        <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Verification Complete</h3>
                    <p className="text-sm text-slate-400">
                        Thank you! Your email address has been successfully verified and your account is active.
                    </p>
                    <div className="pt-4">
                        <Link 
                            href="/dashboard" 
                            className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors"
                        >
                            Go to Dashboard <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            )}

            {status === 'error' && (
                <div className="py-6 space-y-4 flex flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
                        <XCircle size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Verification Failed</h3>
                    <p className="text-sm text-slate-400">
                        {errorMessage}
                    </p>
                    <div className="pt-4">
                        <Link 
                            href="/login" 
                            className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                            Back to Sign In
                        </Link>
                    </div>
                </div>
            )}
        </Panel>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
                        Deploy<span className="text-cyan-400">Forge</span>
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        Email Verification
                    </p>
                </div>

                <Suspense fallback={
                    <Panel className="border-white/5 bg-slate-900/50 p-8 backdrop-blur-xl text-center flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-4" />
                        <p className="text-sm text-slate-400">Loading verification context...</p>
                    </Panel>
                }>
                    <VerifyEmailContent />
                </Suspense>
            </div>
        </div>
    );
}
