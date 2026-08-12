'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Github, LayoutDashboard, LogIn, Menu, Rocket, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuthSession } from '@/hooks/useDeployForgeData';

const NAV_ITEMS = [
    { label: 'Overview',  href: '/' },
    { label: 'Features',  href: '/features' },
    { label: 'About',     href: '/about' },
    { label: 'Docs',      href: '/docs' },
];

export function Header() {
    const pathname = usePathname();
    const auth = useAuthSession();
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 h-14 border-b border-[#1F1F1F] bg-black text-white">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Brand */}
                <div className="flex items-center gap-6">
                    <Link href="/" className="flex items-center gap-2.5" aria-label="DeployForge home">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-white">
                            <Rocket size={14} />
                        </div>
                        <span className="text-sm font-semibold tracking-tight text-white">DeployForge</span>
                    </Link>

                    {/* Desktop navigation links */}
                    <nav className="hidden items-center gap-1 md:flex">
                        {NAV_ITEMS.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                                    pathname === item.href
                                        ? 'bg-[#111111] text-white'
                                        : 'text-[#A1A1A1] hover:bg-[#0A0A0A] hover:text-white'
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Right side actions */}
                <div className="hidden items-center gap-3 md:flex">
                    <a
                        href="https://github.com/akramhossain-dev/DeployForge"
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 text-xs font-medium text-[#A1A1A1] transition-colors hover:border-[#333333] hover:text-white"
                        aria-label="GitHub repository"
                    >
                        <Github size={13} />
                        <span>GitHub</span>
                    </a>

                    {auth.isLoading ? (
                        <div className="h-8 w-24 animate-pulse rounded-md bg-[#111111]" />
                    ) : auth.isAuthenticated ? (
                        <Link
                            href="/dashboard"
                            className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                        >
                            <LayoutDashboard size={13} />
                            <span>Console</span>
                        </Link>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link
                                href="/login"
                                className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-[#A1A1A1] transition-colors hover:text-white"
                            >
                                <LogIn size={13} />
                                <span>Sign In</span>
                            </Link>
                            <Link
                                href="/register"
                                className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                            >
                                <span>Get Started</span>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Mobile menu toggle */}
                <button
                    type="button"
                    onClick={() => setMobileOpen(v => !v)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] transition-colors hover:text-white md:hidden"
                    aria-label="Toggle navigation"
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X size={15} /> : <Menu size={15} />}
                </button>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="border-b border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3 md:hidden">
                    <nav className="flex flex-col gap-1">
                        {NAV_ITEMS.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={clsx(
                                    'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                                    pathname === item.href
                                        ? 'bg-[#111111] text-white'
                                        : 'text-[#A1A1A1] hover:bg-[#111111] hover:text-white'
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-3 flex flex-col gap-2 border-t border-[#1F1F1F] pt-3">
                        <a
                            href="https://github.com/akramhossain-dev/DeployForge"
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] text-xs font-medium text-[#A1A1A1]"
                        >
                            <Github size={14} /> View GitHub Source
                        </a>
                        {auth.isAuthenticated ? (
                            <Link
                                href="/dashboard"
                                onClick={() => setMobileOpen(false)}
                                className="flex h-9 items-center justify-center gap-2 rounded-md bg-white text-xs font-semibold text-black"
                            >
                                <LayoutDashboard size={14} /> Open Console
                            </Link>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <Link
                                    href="/login"
                                    onClick={() => setMobileOpen(false)}
                                    className="flex h-9 items-center justify-center rounded-md border border-[#1F1F1F] text-xs font-medium text-white"
                                >
                                    Sign In
                                </Link>
                                <Link
                                    href="/register"
                                    onClick={() => setMobileOpen(false)}
                                    className="flex h-9 items-center justify-center rounded-md bg-white text-xs font-semibold text-black"
                                >
                                    Get Started
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
}

