'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, LogIn, Menu, Rocket, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuthSession } from '@/hooks/useDeployForgeData';

const NAV_ITEMS = [
    { label: 'Home',     href: '/' },
    { label: 'About',    href: '/about' },
    { label: 'Features', href: '/features' },
    { label: 'Docs',     href: '/docs' },
];

export function Header() {
    const pathname = usePathname();
    const auth = useAuthSession();
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-slate-950/80 backdrop-blur-2xl">
            {/* Top accent line */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />

            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Brand */}
                <Link href="/" className="flex items-center gap-2.5 group" aria-label="DeployForge home">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/20 to-cyan-300/5 text-cyan-200 shadow-lg shadow-cyan-500/10 transition-all group-hover:border-cyan-300/40 group-hover:shadow-cyan-500/20">
                        <Rocket size={16} />
                    </span>
                    <span className="text-base font-black tracking-tight text-white">DeployForge</span>
                </Link>

                {/* Desktop nav */}
                <nav className="hidden items-center gap-1 md:flex">
                    {NAV_ITEMS.map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                'rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                                pathname === item.href
                                    ? 'text-cyan-300 bg-cyan-300/8'
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                {/* Desktop actions */}
                <div className="hidden items-center gap-2 md:flex">
                    {auth.isLoading ? (
                        <span className="h-9 w-32 animate-pulse rounded-xl bg-slate-800/80" />
                    ) : auth.isAuthenticated ? (
                        <>
                            <Link href="/dashboard"
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-300/12 hover:text-cyan-100">
                                <LayoutDashboard size={14} /> Dashboard
                            </Link>
                            <Link href="/dashboard" aria-label="Profile"
                                title={auth.user?.name || auth.user?.email || 'Dashboard'}
                                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-800 text-sm font-black text-white transition-colors hover:border-white/25">
                                {auth.user?.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={auth.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    auth.user?.name?.[0]?.toUpperCase() || auth.user?.email?.[0]?.toUpperCase() || 'U'
                                )}
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/login"
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white">
                                <LogIn size={14} /> Login
                            </Link>
                            <Link href="/register"
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition-all hover:scale-[1.02]">
                                <UserPlus size={14} /> Get Started
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile toggle */}
                <button
                    type="button"
                    onClick={() => setMobileOpen(v => !v)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-white transition-colors hover:bg-white/[0.09] md:hidden"
                    aria-label="Toggle navigation"
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X size={16} /> : <Menu size={16} />}
                </button>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="border-t border-white/[0.07] bg-slate-950/97 px-4 pb-5 pt-3 md:hidden">
                    <nav className="flex flex-col gap-1">
                        {NAV_ITEMS.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={clsx(
                                    'rounded-xl px-4 py-2.5 text-sm font-bold transition-colors',
                                    pathname === item.href
                                        ? 'bg-cyan-300/8 text-cyan-300'
                                        : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-4">
                        {auth.isLoading ? (
                            <span className="col-span-2 h-10 animate-pulse rounded-xl bg-slate-800/80" />
                        ) : auth.isAuthenticated ? (
                            <>
                                <Link href="/dashboard" onClick={() => setMobileOpen(false)}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 text-sm font-black text-slate-950 col-span-2">
                                    <LayoutDashboard size={15} /> Dashboard
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link href="/login" onClick={() => setMobileOpen(false)}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.1] text-sm font-bold text-white transition-colors hover:bg-white/[0.07]">
                                    <LogIn size={14} /> Login
                                </Link>
                                <Link href="/register" onClick={() => setMobileOpen(false)}
                                    className="inline-flex h-10 items-center justify-center rounded-xl bg-white text-sm font-black text-slate-950">
                                    Get Started
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
}
