'use client';

import React, { ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
    FolderOpen, Github, Globe, LayoutDashboard,
    LogOut, Menu, Rocket, Server, Settings, Terminal, X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useMe } from '@/hooks/useDeployForgeData';
import { Button, SkeletonBlock } from '@/components/ui';
import api from '@/lib/api/client';

interface DashboardLayoutProps { children: ReactNode; }

const NAV_GROUPS = [
    {
        label: 'Main',
        items: [
            { name: 'Overview',    icon: LayoutDashboard, href: '/dashboard' },
            { name: 'Deployments', icon: Rocket,          href: '/deployments' },
            { name: 'Repositories',icon: Github,           href: '/repositories' },
        ],
    },
    {
        label: 'Infrastructure',
        items: [
            { name: 'VPS Manager',    icon: Server,     href: '/vps' },
            { name: 'Domain Manager', icon: Globe,       href: '/domains' },
            { name: 'File Manager',   icon: FolderOpen,  href: '/file-manager' },
            { name: 'Terminal',       icon: Terminal,    href: '/terminal' },
        ],
    },
    {
        label: 'System',
        items: [
            { name: 'Settings', icon: Settings, href: '/settings' },
        ],
    },
];

const navItems = NAV_GROUPS.flatMap(g => g.items);

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, hasHydrated, setUser, logout } = useAuthStore();
    const me = useMe(hasHydrated);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const activeItem = useMemo(() =>
        navItems.find(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) || navItems[0],
        [pathname]
    );
    const queryClient = useQueryClient();

    React.useEffect(() => { if (!hasHydrated) return; if (me.isError) router.replace('/'); }, [hasHydrated, me.isError, router]);
    React.useEffect(() => { if (me.data) setUser(me.data); }, [me.data, setUser]);
    React.useEffect(() => { setSidebarOpen(false); }, [pathname]);

    if (!hasHydrated || me.isLoading) {
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

    async function signOut() {
        await api.post('/auth/logout').catch(() => null);
        logout();
        queryClient.setQueryData(['auth', 'me'], null);
        queryClient.clear();
        router.replace('/');
    }

    return (
        <div className="relative h-screen overflow-hidden bg-slate-950 text-slate-200">
            <AuroraField />
            <div className="relative flex h-screen overflow-hidden">
                {/* Desktop sidebar */}
                <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.07] bg-slate-950/80 backdrop-blur-2xl lg:flex">
                    <SidebarContent pathname={pathname} user={user} onLogout={signOut} />
                </aside>

                {/* Mobile sidebar overlay */}
                {sidebarOpen ? (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />
                        <aside className="relative h-full w-[min(18rem,calc(100vw-2rem))] border-r border-white/[0.07] bg-slate-950/95 shadow-2xl shadow-slate-950 backdrop-blur-2xl">
                            <SidebarContent pathname={pathname} user={user} onLogout={signOut} onClose={() => setSidebarOpen(false)} />
                        </aside>
                    </div>
                ) : null}

                <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* Topbar */}
                    <header className="z-30 shrink-0 border-b border-white/[0.07] bg-slate-950/60 px-4 py-3 backdrop-blur-2xl sm:px-6">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen(true)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white lg:hidden"
                                    aria-label="Open navigation"
                                >
                                    <Menu size={17} />
                                </button>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300/70">User Dashboard</p>
                                    <h2 className="truncate text-lg font-black leading-tight text-white">{activeItem.name}</h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-slate-400 sm:flex">
                                    <span className={`h-1.5 w-1.5 rounded-full ${me.isError ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`} />
                                    API
                                </div>
                                <Button variant="secondary" onClick={() => me.refetch()} loading={me.isFetching} className="h-9 text-xs">
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

function SidebarContent({ pathname, user, onLogout, onClose }: { pathname: string; user: any; onLogout: () => void; onClose?: () => void; }) {
    return (
        <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-4">
                <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/20 to-cyan-500/5 text-cyan-200 shadow-lg shadow-cyan-950/30">
                        <Rocket size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black tracking-tight text-white">DeployForge</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Console</p>
                    </div>
                </Link>
                {onClose ? (
                    <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-400 hover:text-white" aria-label="Close">
                        <X size={15} />
                    </button>
                ) : null}
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-5">
                {NAV_GROUPS.map(group => (
                    <div key={group.label}>
                        <p className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-widest text-slate-600">{group.label}</p>
                        <div className="space-y-0.5">
                            {group.items.map(item => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-all ${
                                            isActive
                                                ? 'bg-cyan-300/10 text-cyan-100'
                                                : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
                                        }`}
                                    >
                                        {isActive ? <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r-full bg-cyan-300 shadow-lg shadow-cyan-500/40" /> : null}
                                        <Icon size={16} className={isActive ? 'text-cyan-300' : 'text-slate-600 transition-colors group-hover:text-slate-400'} />
                                        <span className="truncate">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* User profile */}
            <div className="border-t border-white/[0.07] p-3">
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900 text-xs font-black text-white">
                        {user?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            user?.name?.[0] || user?.email?.[0]?.toUpperCase() || 'D'
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-white">{user?.name || 'Developer'}</p>
                        <p className="truncate text-[10px] text-slate-500">{user?.email || 'Signed in'}</p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-500/8 text-rose-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                        title="Log out"
                    >
                        <LogOut size={14} />
                    </button>
                </div>
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
