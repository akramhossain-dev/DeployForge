'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, LogIn, Menu, Rocket, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuthSession } from '@/hooks/useDeployForgeData';

const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Features', href: '/features' },
    { label: 'Docs', href: '/docs' },
];

export function Header() {
    const pathname = usePathname();
    const auth = useAuthSession();
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/72 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-3" aria-label="DeployForge home">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20">
                        <Rocket size={20} />
                    </span>
                    <span className="text-lg font-black tracking-tight text-white">DeployForge</span>
                </Link>

                <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                'transition-colors hover:text-white',
                                pathname === item.href ? 'text-cyan-300' : 'text-slate-300'
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden items-center gap-3 md:flex">
                    {auth.isLoading ? (
                        <span className="h-10 w-32 animate-pulse rounded-lg bg-slate-800/80" />
                    ) : auth.isAuthenticated ? (
                        <>
                            <Link
                                href="/dashboard"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm font-bold text-cyan-100 transition-colors hover:bg-cyan-300/15"
                            >
                                <LayoutDashboard size={16} /> Dashboard
                            </Link>
                            <Link
                                href="/dashboard"
                                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-sm font-black text-white"
                                aria-label="Open dashboard profile"
                                title={auth.user?.name || auth.user?.email || 'Dashboard'}
                            >
                                {auth.user?.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={auth.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    auth.user?.name?.[0] || auth.user?.email?.[0]?.toUpperCase() || 'D'
                                )}
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                <LogIn size={16} /> Login
                            </Link>
                            <Link
                                href="/register"
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-4 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]"
                            >
                                Get Started
                            </Link>
                        </>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setMobileOpen((value) => !value)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white md:hidden"
                    aria-label="Toggle navigation"
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            {mobileOpen ? (
                <div className="border-t border-white/10 bg-slate-950/95 px-4 py-4 md:hidden">
                    <nav className="flex flex-col gap-2">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                            >
                                {item.label}
                            </Link>
                        ))}
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            {auth.isLoading ? (
                                <span className="col-span-2 h-10 animate-pulse rounded-lg bg-slate-800/80" />
                            ) : auth.isAuthenticated ? (
                                <>
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setMobileOpen(false)}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 text-sm font-black text-slate-950"
                                    >
                                        <LayoutDashboard size={16} /> Dashboard
                                    </Link>
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setMobileOpen(false)}
                                        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-sm font-bold text-white"
                                    >
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900 text-xs font-black">
                                            {auth.user?.avatarUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={auth.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                auth.user?.name?.[0] || auth.user?.email?.[0]?.toUpperCase() || 'D'
                                            )}
                                        </span>
                                        Profile
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        href="/login"
                                        onClick={() => setMobileOpen(false)}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 text-sm font-bold text-white"
                                    >
                                        <LogIn size={16} /> Login
                                    </Link>
                                    <Link
                                        href="/register"
                                        onClick={() => setMobileOpen(false)}
                                        className="inline-flex h-10 items-center justify-center rounded-lg bg-white text-sm font-black text-slate-950"
                                    >
                                        Get Started
                                    </Link>
                                </>
                            )}
                        </div>
                    </nav>
                </div>
            ) : null}
        </header>
    );
}
