'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Github, LayoutDashboard, ListFilter, LogOut, Menu,
    Rocket, Server, Settings, ShieldCheck, Users, X,
} from 'lucide-react';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';
import { useAdminMe } from '@/hooks/useDeployForgeData';
import { Button, Panel, SkeletonBlock } from '@/components/ui';
import api from '@/lib/api/client';

const adminRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

const NAV_GROUPS = [
    {
        label: 'Dashboard',
        items: [
            { href: '/admin',      label: 'Overview',     icon: LayoutDashboard },
        ],
    },
    {
        label: 'Platform',
        items: [
            { href: '/admin/users',       label: 'Users',       icon: Users },
            { href: '/admin/deployments', label: 'Deployments', icon: Rocket },
            { href: '/admin/vps',         label: 'VPS',         icon: Server },
            { href: '/admin/github',      label: 'GitHub',      icon: Github },
        ],
    },
    {
        label: 'System',
        items: [
            { href: '/admin/logs',     label: 'Logs',     icon: ListFilter },
            { href: '/admin/settings', label: 'Settings', icon: Settings },
        ],
    },
];

const allNav = NAV_GROUPS.flatMap(g => g.items);

export function AdminShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { admin, hasHydrated, setAdmin, logoutAdmin } = useAdminAuthStore();
    const isLogin = pathname === '/admin/login';
    const me = useAdminMe(hasHydrated && !isLogin);
    const role = me.data?.role || admin?.role;
    const activeItem = useMemo(() => allNav.find(item => item.href === pathname) || allNav[0], [pathname]);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => { if (isLogin) return; if (!hasHydrated) return; if (me.isError) router.replace('/admin/login'); }, [hasHydrated, isLogin, me.isError, router]);
    useEffect(() => { if (me.data) setAdmin(me.data); }, [me.data, setAdmin]);
    useEffect(() => { setSidebarOpen(false); }, [pathname]);

    if (isLogin) return <>{children}</>;

    if (!hasHydrated || me.isLoading) {
        return (
            <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-200">
                <AuroraField />
                <div className="w-full max-w-md space-y-3">
                    <SkeletonBlock className="h-12 w-56" />
                    <SkeletonBlock className="h-36 w-full" />
                    <SkeletonBlock className="h-36 w-full" />
                </div>
            </div>
        );
    }

    if (!adminRoles.has(role || '')) {
        return (
            <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-center">
                <AuroraField />
                <Panel className="max-w-md border-rose-400/30 bg-rose-500/10">
                    <ShieldCheck className="mx-auto text-rose-300" size={36} />
                    <h1 className="mt-4 text-xl font-black text-white">Admin access required</h1>
                    <p className="mt-2 text-sm leading-6 text-rose-100/80">Use an admin account created by a super admin to continue.</p>
                </Panel>
            </div>
        );
    }

    async function signOut() {
        await api.post('/admin/logout').catch(() => null);
        logoutAdmin();
        queryClient.setQueryData(['admin', 'me'], null);
        queryClient.clear();
        router.replace('/admin/login');
    }

    return (
        <div className="relative h-screen overflow-hidden bg-slate-950 text-slate-100">
            <AuroraField />
            <div className="relative flex h-screen overflow-hidden">
                {/* Desktop sidebar */}
                <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.07] bg-slate-950/80 backdrop-blur-2xl lg:flex">
                    <AdminSidebar pathname={pathname} role={role} email={admin?.email} onLogout={signOut} />
                </aside>

                {/* Mobile overlay */}
                {sidebarOpen ? (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />
                        <aside className="relative h-full w-[min(18rem,calc(100vw-2rem))] border-r border-white/[0.07] bg-slate-950/95 shadow-2xl shadow-slate-950 backdrop-blur-2xl">
                            <AdminSidebar pathname={pathname} role={role} email={admin?.email} onLogout={signOut} onClose={() => setSidebarOpen(false)} />
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
                                    aria-label="Open admin navigation"
                                >
                                    <Menu size={17} />
                                </button>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-300/70">Admin Control Plane</p>
                                    <h1 className="truncate text-lg font-black leading-tight text-white">{activeItem.label}</h1>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {role && (
                                    <span className="hidden items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-400/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-rose-300 sm:flex">
                                        <ShieldCheck size={11} />{role}
                                    </span>
                                )}
                                <Button variant="secondary" onClick={() => me.refetch()} loading={me.isFetching} className="h-9 text-xs">
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto terminal-scrollbar">
                        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
                    </div>
                </main>
            </div>
        </div>
    );
}

function AdminSidebar({ pathname, role, email, onLogout, onClose }: {
    pathname: string; role?: string; email?: string; onLogout: () => void; onClose?: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-4">
                <Link href="/admin" className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-300/25 bg-gradient-to-br from-rose-300/20 to-rose-500/5 text-rose-200 shadow-lg shadow-rose-950/30">
                        <ShieldCheck size={17} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black tracking-tight text-white">Admin Panel</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-400/60">{role || 'Control Plane'}</p>
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
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-all ${
                                            isActive
                                                ? 'bg-rose-300/10 text-rose-100'
                                                : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
                                        }`}
                                    >
                                        {isActive ? <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r-full bg-rose-300 shadow-lg shadow-rose-500/40" /> : null}
                                        <Icon size={15} className={isActive ? 'text-rose-300' : 'text-slate-600 transition-colors group-hover:text-slate-400'} />
                                        <span className="truncate">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* User footer */}
            <div className="border-t border-white/[0.07] p-3">
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-xs font-black text-white">
                        {email?.[0]?.toUpperCase() || 'A'}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-white">{email || 'Admin'}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-400/60">{role}</p>
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
            <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-rose-400/8 blur-3xl" />
            <div className="absolute right-[-10rem] top-36 h-[26rem] w-[26rem] rounded-full bg-cyan-400/8 blur-3xl" />
            <div className="absolute bottom-[-8rem] left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(2,6,23,0.35)_55%,#020617_100%)]" />
        </div>
    );
}
