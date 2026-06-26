'use client';

import Link from 'next/link';
import { AlertTriangle, Home, LayoutDashboard, RefreshCw, SearchX } from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { PublicAurora } from '@/components/system/PublicSystem';

// ── Shared wrapper ─────────────────────────────────────────────────────────────
function FallbackShell({ children }: { children: React.ReactNode }) {
    return (
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
            <PublicAurora />
            {children}
        </main>
    );
}

// ── 404 ────────────────────────────────────────────────────────────────────────
export function NotFoundView() {
    const auth = useAuthSession();

    return (
        <FallbackShell>
            <section className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-slate-900/80 p-8 text-center shadow-2xl shadow-slate-950/60 backdrop-blur-xl sm:p-10">
                {/* Icon */}
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/80">
                    <SearchX size={28} className="text-slate-400" />
                </div>

                {/* Headline */}
                <p className="mt-6 text-[11px] font-black uppercase tracking-widest text-slate-500">Error 404</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Page not found</h1>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                    The page may have moved, been removed, or never existed in this DeployForge workspace.
                </p>

                {/* Actions */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link href="/"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.02]">
                        <Home size={15} /> Go Home
                    </Link>
                    {auth.isAuthenticated ? (
                        <Link href="/dashboard"
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-6 text-sm font-black text-slate-100 transition-colors hover:bg-white/[0.10]">
                            <LayoutDashboard size={15} /> Dashboard
                        </Link>
                    ) : null}
                </div>
            </section>
        </FallbackShell>
    );
}

// ── Global error ───────────────────────────────────────────────────────────────
export function GlobalErrorView({ reset }: { reset: () => void }) {
    return (
        <FallbackShell>
            <section className="w-full max-w-lg rounded-2xl border border-rose-400/25 bg-slate-900/80 p-8 text-center shadow-2xl shadow-slate-950/60 backdrop-blur-xl sm:p-10">
                {/* Accent stripe */}
                <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-rose-400/60 via-rose-400/30 to-transparent" />

                {/* Icon */}
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10">
                    <AlertTriangle size={28} className="text-rose-300" />
                </div>

                {/* Headline */}
                <p className="mt-6 text-[11px] font-black uppercase tracking-widest text-rose-400/60">Rendering Error</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Something went wrong</h1>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                    An unexpected rendering or route error interrupted this view. Retry the route or return to a stable page.
                </p>

                {/* Actions */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button type="button" onClick={reset}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.02]">
                        <RefreshCw size={15} /> Try Again
                    </button>
                    <Link href="/"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-6 text-sm font-black text-slate-100 transition-colors hover:bg-white/[0.10]">
                        <Home size={15} /> Go Home
                    </Link>
                </div>
            </section>
        </FallbackShell>
    );
}
