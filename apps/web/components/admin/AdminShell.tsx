'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Github, LayoutDashboard, ListFilter, LogOut, Menu,
    Rocket, Server, Settings, ShieldCheck, Users, X, RefreshCw
} from 'lucide-react';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';
import { useAdminMe } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import clsx from 'clsx';

const adminRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

const NAV_GROUPS = [
    {
        label: 'Dashboard',
        items: [
            { href: '/admin', label: 'Overview', icon: LayoutDashboard },
        ],
    },
    {
        label: 'Platform',
        items: [
            { href: '/admin/users', label: 'Users', icon: Users },
            { href: '/admin/deployments', label: 'Deployments', icon: Rocket },
            { href: '/admin/vps', label: 'VPS Nodes', icon: Server },
            { href: '/admin/github', label: 'GitHub App', icon: Github },
        ],
    },
    {
        label: 'System',
        items: [
            { href: '/admin/logs', label: 'Audit Logs', icon: ListFilter },
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
            <div className="flex h-screen items-center justify-center bg-[#000000] font-mono text-xs text-[#666666]">
                <RefreshCw size={16} className="animate-spin mr-2" /> Loading admin control plane...
            </div>
        );
    }

    if (!adminRoles.has(role || '')) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-[#000000] p-6 font-mono text-xs text-[#666666]">
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-6 text-center text-rose-300 space-y-2 max-w-sm">
                    <ShieldCheck className="mx-auto text-rose-400" size={32} />
                    <p className="font-bold text-white text-sm">Admin Access Required</p>
                    <p>You must be an authenticated administrator to access the control plane.</p>
                </div>
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
        <div className="relative h-screen min-h-[100dvh] overflow-hidden bg-[#000000] text-white font-mono text-xs">
            <div className="relative flex h-screen min-h-[100dvh] overflow-hidden">
                {/* Desktop sidebar */}
                <aside className="hidden h-screen min-h-[100dvh] w-60 shrink-0 flex-col border-r border-[#1F1F1F] bg-[#0A0A0A] lg:flex">
                    <AdminSidebar pathname={pathname} role={role} email={admin?.email} onLogout={signOut} />
                </aside>

                {/* Mobile overlay */}
                {sidebarOpen && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button className="absolute inset-0 bg-black/80" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />
                        <aside className="relative h-full w-60 border-r border-[#1F1F1F] bg-[#0A0A0A]">
                            <AdminSidebar pathname={pathname} role={role} email={admin?.email} onLogout={signOut} onClose={() => setSidebarOpen(false)} />
                        </aside>
                    </div>
                )}

                <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#000000]">
                    {/* Topbar */}
                    <header className="z-30 shrink-0 border-b border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3 sm:px-6">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen(true)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white lg:hidden"
                                    aria-label="Open admin navigation"
                                >
                                    <Menu size={16} />
                                </button>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Control Plane</p>
                                    <h1 className="truncate text-base font-bold text-white">{activeItem.label}</h1>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {role && (
                                    <span className="hidden items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 py-1 text-[10px] font-bold uppercase text-rose-400 sm:flex">
                                        <ShieldCheck size={11} /> {role}
                                    </span>
                                )}
                                <button
                                    onClick={() => me.refetch()}
                                    disabled={me.isFetching}
                                    className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={me.isFetching ? 'animate-spin' : ''} />
                                    <span>Refresh</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto terminal-scrollbar">
                        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
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
        <div className="flex h-full flex-col font-mono text-xs">
            {/* Brand Header */}
            <div className="flex items-center justify-between gap-2 border-b border-[#1F1F1F] px-4 py-4">
                <Link href="/admin" className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white font-bold">
                        DF
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white">DeployForge Admin</p>
                        <p className="text-[10px] text-[#666666] uppercase">{role || 'Control Plane'}</p>
                    </div>
                </Link>
                {onClose && (
                    <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] text-[#A1A1A1] hover:text-white" aria-label="Close">
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-4">
                {NAV_GROUPS.map(group => (
                    <div key={group.label}>
                        <p className="mb-1 px-2 text-[9px] font-semibold uppercase text-[#666666]">{group.label}</p>
                        <div className="space-y-0.5">
                            {group.items.map(item => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={clsx(
                                            'flex h-8 items-center gap-2 rounded px-2.5 text-xs font-semibold transition-colors',
                                            isActive
                                                ? 'bg-[#111111] text-white'
                                                : 'text-[#A1A1A1] hover:text-white'
                                        )}
                                    >
                                        <Icon size={14} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* User footer */}
            <div className="border-t border-[#1F1F1F] p-3">
                <div className="flex items-center justify-between gap-2 rounded border border-[#1F1F1F] bg-[#000000] p-2.5">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{email || 'Admin'}</p>
                        <p className="text-[10px] text-[#666666] uppercase">{role}</p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white transition-colors"
                        title="Log out"
                    >
                        <LogOut size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}
