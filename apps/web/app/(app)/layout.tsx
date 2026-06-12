'use client';

import React, { ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    Activity,
    Github,
    LayoutDashboard,
    LogOut,
    Menu,
    Rocket,
    Server,
    Settings,
    Terminal,
    X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useMe } from '@/hooks/useDeployForgeData';
import { Button, SkeletonBlock } from '@/components/ui';

interface DashboardLayoutProps {
    children: ReactNode;
}

const navItems = [
    { name: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
    { name: 'Deployments', icon: Rocket, href: '/deployments' },
    { name: 'Repositories', icon: Github, href: '/repositories' },
    { name: 'VPS Manager', icon: Server, href: '/vps' },
    { name: 'Terminal', icon: Terminal, href: '/terminal' },
    { name: 'Monitoring', icon: Activity, href: '/monitoring' },
    { name: 'Settings', icon: Settings, href: '/settings' },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, token, hasHydrated, setUser, logout } = useAuthStore();
    const me = useMe(hasHydrated && !!token);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const activeItem = useMemo(() => navItems.find((item) => item.href === pathname) || navItems[0], [pathname]);

    React.useEffect(() => {
        if (!hasHydrated) return;
        if (!token) router.replace('/');
    }, [hasHydrated, router, token]);

    React.useEffect(() => {
        if (me.data) setUser(me.data);
    }, [me.data, setUser]);

    React.useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    if (!hasHydrated || (hasHydrated && !token)) {
        return (
            <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-200">
                <AuroraField />
                <div className="w-full max-w-sm space-y-3">
                    <SkeletonBlock className="h-10 w-48" />
                    <SkeletonBlock className="h-28 w-full" />
                    <SkeletonBlock className="h-28 w-full" />
                </div>
            </div>
        );
    }

    function signOut() {
        logout();
        router.replace('/');
    }

    return (
        <div className="relative h-screen overflow-hidden bg-slate-950 text-slate-200">
            <AuroraField />
            <div className="relative flex h-screen overflow-hidden">
                <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/10 bg-slate-950/70 px-3 py-4 backdrop-blur-2xl lg:block">
                    <SidebarContent pathname={pathname} user={user} onLogout={signOut} />
                </aside>

                {sidebarOpen ? (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />
                        <aside className="relative h-full w-[min(20rem,calc(100vw-2rem))] border-r border-white/10 bg-slate-950/95 px-3 py-4 shadow-2xl shadow-slate-950 backdrop-blur-2xl">
                            <SidebarContent pathname={pathname} user={user} onLogout={signOut} onClose={() => setSidebarOpen(false)} />
                        </aside>
                    </div>
                ) : null}

                <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <header className="z-30 shrink-0 border-b border-white/10 bg-slate-950/60 px-4 py-4 backdrop-blur-2xl sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen(true)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-white lg:hidden"
                                    aria-label="Open navigation"
                                >
                                    <Menu size={18} />
                                </button>
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-wide text-cyan-300">User Dashboard</p>
                                    <h2 className="truncate text-lg font-black text-white sm:text-xl">{activeItem.name}</h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-slate-300 sm:flex">
                                    <span className={`h-2 w-2 rounded-full ${me.isError ? 'bg-rose-400' : 'bg-emerald-400'}`} /> API
                                </div>
                                <Button variant="secondary" onClick={() => me.refetch()} loading={me.isFetching}>
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto terminal-scrollbar">
                        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                            {children}
                        </div>
                    </div>
                </main>
            </div>

        </div>
    );
}

function SidebarContent({
    pathname,
    user,
    onLogout,
    onClose,
}: {
    pathname: string;
    user: any;
    onLogout: () => void;
    onClose?: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <div className="mb-7 flex items-center justify-between gap-3 px-2 pt-1">
                <Link href="/dashboard" className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.04]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-lg shadow-cyan-950/20">
                        <Rocket size={20} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-base font-black tracking-tight text-white">DeployForge</p>
                        <p className="text-xs font-bold text-slate-500">Console</p>
                    </div>
                </Link>
                {onClose ? (
                    <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-300" aria-label="Close navigation">
                        <X size={16} />
                    </button>
                ) : null}
            </div>

            <nav className="space-y-1.5 px-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`group relative flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-black transition-colors ${isActive
                                ? 'bg-cyan-300/10 text-cyan-100'
                                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                                }`}
                        >
                            {isActive ? <span className="absolute left-0 top-2 h-8 w-1 rounded-r-full bg-cyan-300 shadow-lg shadow-cyan-500/30" /> : null}
                            <Icon size={19} className={isActive ? 'text-cyan-200' : 'text-slate-500 transition-colors group-hover:text-cyan-200'} />
                            <span className="truncate">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-slate-950/30">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900 text-sm font-black text-white">
                        {user?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            user?.name?.[0] || user?.email?.[0]?.toUpperCase() || 'D'
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{user?.name || 'Developer'}</p>
                        <p className="truncate text-xs text-slate-500">{user?.email || 'Signed in'}</p>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 text-xs font-black text-rose-100 transition-colors hover:border-rose-300/35 hover:bg-rose-500/15"
                >
                    <LogOut size={14} /> Log Out
                </button>
            </div>
        </div>
    );
}

function AuroraField() {
    return (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/14 blur-3xl" />
            <div className="absolute right-[-10rem] top-36 h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute bottom-[-8rem] left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(2,6,23,0.35)_55%,#020617_100%)]" />
        </div>
    );
}
