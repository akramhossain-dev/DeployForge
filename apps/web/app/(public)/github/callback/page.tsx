'use client';

import { ReactNode, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Loader2 } from 'lucide-react';
import api from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/useAuthStore';

export default function GitHubCallbackPage() {
    return (
        <Suspense fallback={<GitHubCallbackFrame><GitHubCallbackShell /></GitHubCallbackFrame>}>
            <GitHubCallbackContent />
        </Suspense>
    );
}

function GitHubCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { setToken, setUser } = useAuthStore();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const accessToken = searchParams.get('accessToken');
        const refreshToken = searchParams.get('refreshToken');

        if (!accessToken || !refreshToken) {
            setError('GitHub login did not return a valid DeployForge session.');
            return;
        }

        async function completeSession() {
            try {
                setToken(accessToken, refreshToken);
                const response = await api.get<{ user: any }>('/auth/me');
                setUser(response.user);
                router.replace('/dashboard');
            } catch (err: any) {
                setError(err.message || 'Unable to complete GitHub login.');
            }
        }

        completeSession();
    }, [router, searchParams, setToken, setUser]);

    return (
        <GitHubCallbackFrame>
            <GitHubCallbackShell error={error} />
        </GitHubCallbackFrame>
    );
}

function GitHubCallbackFrame({ children }: { children: ReactNode }) {
    return (
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white">
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute left-[-8rem] top-8 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
                <div className="absolute bottom-0 right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            </div>
            {children}
        </main>
    );
}

function GitHubCallbackShell({ error }: { error?: string | null }) {
    return (
        <section className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900/75 p-6 text-center shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                {error ? <Github size={24} /> : <Loader2 className="animate-spin" size={24} />}
            </div>
            <h1 className="mt-6 text-2xl font-black tracking-tight text-white">{error ? 'GitHub login failed' : 'Completing GitHub login'}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
                {error || 'DeployForge is creating your session and opening the dashboard.'}
            </p>
        </section>
    );
}
