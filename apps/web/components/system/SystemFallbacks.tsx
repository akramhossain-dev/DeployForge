'use client';

import Link from 'next/link';
import { AlertTriangle, Home, LayoutDashboard, RefreshCw } from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { PublicAurora } from '@/components/system/PublicSystem';

export function NotFoundView() {
    const auth = useAuthSession();

    return (
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <PublicAurora />
            <section className="w-full max-w-xl rounded-lg border border-white/10 bg-slate-900/75 p-6 text-center shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-8">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                    404
                </div>
                <h1 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-4xl">Page not found</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                    The page may have moved, been removed, or never existed in this DeployForge workspace.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link href="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]">
                        <Home size={16} /> Go Home
                    </Link>
                    {auth.isAuthenticated ? (
                        <Link href="/dashboard" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-slate-100 transition-colors hover:bg-white/[0.11]">
                            <LayoutDashboard size={16} /> Go Dashboard
                        </Link>
                    ) : null}
                </div>
            </section>
        </main>
    );
}

export function GlobalErrorView({ reset }: { reset: () => void }) {
    return (
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <PublicAurora />
            <section className="w-full max-w-xl rounded-lg border border-rose-400/30 bg-slate-900/75 p-6 text-center shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-8">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-500/10 text-rose-100">
                    <AlertTriangle size={24} />
                </div>
                <h1 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-4xl">Something went wrong</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                    An unexpected rendering or route error interrupted this view. Retry the route or return to a stable page.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button type="button" onClick={reset} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]">
                        <RefreshCw size={16} /> Retry
                    </button>
                    <Link href="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-slate-100 transition-colors hover:bg-white/[0.11]">
                        <Home size={16} /> Go Home
                    </Link>
                </div>
            </section>
        </main>
    );
}
