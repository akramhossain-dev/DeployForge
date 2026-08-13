'use client';

import Link from 'next/link';
import { AlertTriangle, Home, LayoutDashboard, RefreshCw, SearchX } from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';

// ── Shared wrapper ─────────────────────────────────────────────────────────────
function FallbackShell({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#000000] px-4 py-16 text-white font-mono text-xs sm:px-6 lg:px-8">
            {children}
        </main>
    );
}

// ── 404 ────────────────────────────────────────────────────────────────────────
export function NotFoundView() {
    const auth = useAuthSession();

    return (
        <FallbackShell>
            <section className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 text-center space-y-4 sm:p-8">
                {/* Icon */}
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] text-white">
                    <SearchX size={20} />
                </div>

                {/* Headline */}
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Error 404</p>
                    <h1 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">Page not found</h1>
                    <p className="mt-2 text-xs text-[#A1A1A1]">
                        The page may have moved, been removed, or never existed in this DeployForge workspace.
                    </p>
                </div>

                {/* Actions */}
                <div className="pt-2 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Link
                        href="/"
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-4 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors"
                    >
                        <Home size={13} /> Go Home
                    </Link>
                    {auth.isAuthenticated ? (
                        <Link
                            href="/dashboard"
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-4 text-xs font-semibold text-white hover:bg-[#1F1F1F] transition-colors"
                        >
                            <LayoutDashboard size={13} /> Console
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
            <section className="w-full max-w-md rounded-md border border-rose-900/50 bg-[#0A0A0A] p-6 text-center space-y-4 sm:p-8">
                {/* Icon */}
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-rose-900/50 bg-rose-950/20 text-rose-400">
                    <AlertTriangle size={20} />
                </div>

                {/* Headline */}
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Rendering Error</p>
                    <h1 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">Something went wrong</h1>
                    <p className="mt-2 text-xs text-[#A1A1A1]">
                        An unexpected rendering or route error interrupted this view. Retry the route or return home.
                    </p>
                </div>

                {/* Actions */}
                <div className="pt-2 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-4 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors"
                    >
                        <RefreshCw size={13} /> Try Again
                    </button>
                    <Link
                        href="/"
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-4 text-xs font-semibold text-white hover:bg-[#1F1F1F] transition-colors"
                    >
                        <Home size={13} /> Go Home
                    </Link>
                </div>
            </section>
        </FallbackShell>
    );
}
