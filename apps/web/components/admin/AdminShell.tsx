'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Activity, Github, LayoutDashboard, ListFilter, LogOut, Menu, Rocket, Server, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';
import { useAdminMe } from '@/hooks/useDeployForgeData';
import { Button, Panel, SkeletonBlock } from '@/components/ui';
import api from '@/lib/api/client';

const adminRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

const nav = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/deployments', label: 'Deployments', icon: Rocket },
    { href: '/admin/vps', label: 'VPS', icon: Server },
    { href: '/admin/github', label: 'GitHub', icon: Github },
    { href: '/admin/monitoring', label: 'Monitoring', icon: Activity },
    { href: '/admin/logs', label: 'Logs', icon: ListFilter },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { admin, hasHydrated, setAdmin, logoutAdmin } = useAdminAuthStore();
    const isLogin = pathname === '/admin/login';
    const me = useAdminMe(hasHydrated && !isLogin);
    const role = me.data?.role || admin?.role;
    const activeItem = useMemo(() => nav.find((item) => item.href === pathname) || nav[0], [pathname]);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (isLogin) return;
        if (!hasHydrated) return;
        if (me.isError) router.replace('/admin/login');
    }, [hasHydrated, isLogin, me.isError, router]);

    useEffect(() => {
        if (me.data) setAdmin(me.data);
    }, [me.data, setAdmin]);

    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

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
        router.replace('/admin/login');
    }

    return (
        <div className="relative h-screen overflow-hidden bg-slate-950 text-slate-100">
            <AuroraField />
            <div className="relative flex h-screen overflow-hidden">
                <aside className="hidden h-screen w-72 shrink-0 border-r border-white/10 bg-slate-950/70 px-3 py-4 backdrop-blur-2xl lg:block">
                    <AdminSidebar pathname={pathname} role={role} email={admin?.email} onLogout={signOut} />
                </aside>

                {sidebarOpen ? (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />
                        <aside className="relative h-full w-[min(20rem,calc(100vw-2rem))] border-r border-white/10 bg-slate-950/95 px-3 py-4 shadow-2xl shadow-slate-950 backdrop-blur-2xl">
                            <AdminSidebar pathname={pathname} role={role} email={admin?.email} onLogout={signOut} onClose={() => setSidebarOpen(false)} />
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
                                    aria-label="Open admin navigation"
                                >
                                    <Menu size={18} />
                                </button>
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Admin Control Plane</p>
                                    <h1 className="truncate text-lg font-black text-white sm:text-xl">{activeItem.label}</h1>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="hidden rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-slate-300 sm:block">
                                    {role}
                                </div>
                                <Button variant="secondary" onClick={() => me.refetch()} loading={me.isFetching}>
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

function AdminSidebar({
    pathname,
    role,
    email,
    onLogout,
    onClose,
}: {
    pathname: string;
    role?: string;
    email?: string;
    onLogout: () => void;
    onClose?: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <div className="mb-7 flex items-center justify-between gap-3 px-2 pt-1">
                <Link href="/admin" className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.04]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-lg shadow-cyan-950/20">
                        <ShieldCheck size={20} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-base font-black tracking-tight text-white">DeployForge Admin</p>
                        <p className="text-xs font-bold uppercase text-cyan-300">{role}</p>
                    </div>
                </Link>
                {onClose ? (
                    <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-300" aria-label="Close navigation">
                        <X size={16} />
                    </button>
                ) : null}
            </div>

            <nav className="space-y-1.5 px-1">
                {nav.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group relative flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-black transition-colors ${active
                                ? 'bg-cyan-300/10 text-cyan-100'
                                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                                }`}
                        >
                            {active ? <span className="absolute left-0 top-2 h-8 w-1 rounded-r-full bg-cyan-300 shadow-lg shadow-cyan-500/30" /> : null}
                            <Icon size={18} className={active ? 'text-cyan-200' : 'text-slate-500 transition-colors group-hover:text-cyan-200'} />
                            <span className="truncate">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-slate-950/30">
                <p className="truncate text-sm font-black text-white">{email || 'Admin'}</p>
                <p className="mt-1 text-xs font-bold uppercase text-slate-500">{role}</p>
                <button
                    onClick={onLogout}
                    className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 text-xs font-black text-rose-100 transition-colors hover:border-rose-300/35 hover:bg-rose-500/15"
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
