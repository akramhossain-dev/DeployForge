'use client';

import React, { ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
    Bell, FolderOpen, Github, Globe, LayoutDashboard,
    LogOut, Menu, Rocket, Server, Settings, Terminal, X, Users, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useMe } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { NotificationDropdown } from '@/components/layout/NotificationDropdown';
import { DeployForgeLogo } from '@/components/ui/BrandLogo';

interface DashboardLayoutProps { children: ReactNode; }

const NAV_GROUPS = [
    {
        label: 'MAIN',
        items: [
            { name: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
            { name: 'Deployments', icon: Rocket, href: '/deployments' },
            { name: 'Repositories', icon: Github, href: '/repositories' },
            { name: 'Team', icon: Users, href: '/team' },
        ],
    },
    {
        label: 'INFRASTRUCTURE',
        items: [
            { name: 'VPS Manager', icon: Server, href: '/vps' },
            { name: 'Domain Manager', icon: Globe, href: '/domains' },
            { name: 'File Manager', icon: FolderOpen, href: '/file-manager' },
            { name: 'Terminal', icon: Terminal, href: '/terminal' },
        ],
    },
    {
        label: 'SYSTEM',
        items: [
            { name: 'Notifications', icon: Bell, href: '/notifications' },
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
    const queryClient = useQueryClient();

    const activeItem = useMemo(() =>
        navItems.find(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) || navItems[0],
        [pathname]
    );

    React.useEffect(() => { if (!hasHydrated) return; if (me.isError) router.replace('/'); }, [hasHydrated, me.isError, router]);
    React.useEffect(() => { if (me.data) setUser(me.data); }, [me.data, setUser]);
    React.useEffect(() => { setSidebarOpen(false); }, [pathname]);

    if (!hasHydrated || me.isLoading) {
        return (
            <div className="flex h-screen min-h-[100dvh] w-full items-center justify-center bg-black p-6 text-white">
                <div className="w-full max-w-xs space-y-3 font-mono text-xs">
                    <div className="h-6 w-32 animate-pulse rounded bg-[#0A0A0A] border border-[#1F1F1F]" />
                    <div className="h-24 w-full animate-pulse rounded bg-[#0A0A0A] border border-[#1F1F1F]" />
                    <div className="h-24 w-full animate-pulse rounded bg-[#0A0A0A] border border-[#1F1F1F]" />
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
        <div className="h-screen min-h-[100dvh] overflow-hidden bg-black text-white">
            <div className="flex h-screen min-h-[100dvh] overflow-hidden">
                {/* Desktop sidebar */}
                <aside className="sticky top-0 hidden h-screen min-h-[100dvh] w-56 shrink-0 flex-col border-r border-[#1F1F1F] bg-[#0A0A0A] lg:flex">
                    <SidebarContent pathname={pathname} user={user} onLogout={signOut} />
                </aside>

                {/* Mobile sidebar overlay */}
                {sidebarOpen && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close navigation"
                        />
                        <aside className="relative h-full w-60 border-r border-[#1F1F1F] bg-[#0A0A0A]">
                            <SidebarContent pathname={pathname} user={user} onLogout={signOut} onClose={() => setSidebarOpen(false)} />
                        </aside>
                    </div>
                )}

                <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-black">
                    {/* Topbar Header */}
                    <header className="z-30 shrink-0 border-b border-[#1F1F1F] bg-[#0A0A0A] px-4 py-2.5 sm:px-6 lg:px-8">
                        <div className="mx-auto flex w-full max-w-[1800px] 2xl:max-w-[2200px] items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen(true)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white lg:hidden"
                                    aria-label="Open navigation"
                                >
                                    <Menu size={15} />
                                </button>
                                <div className="min-w-0 flex items-center gap-2 font-mono text-xs">
                                    <span className="text-[#666666]">Console /</span>
                                    <span className="truncate font-semibold text-white">{activeItem.name}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2.5">
                                <div className="hidden items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 py-1 font-mono text-[10px] text-[#A1A1A1] sm:flex">
                                    <span className={`h-1.5 w-1.5 rounded-full ${me.isError ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                                    <span>API OPERATIONAL</span>
                                </div>

                                <NotificationDropdown />

                                <button
                                    type="button"
                                    onClick={() => me.refetch()}
                                    disabled={me.isFetching}
                                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-2.5 font-mono text-xs text-[#A1A1A1] hover:text-white transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={me.isFetching ? 'animate-spin' : ''} />
                                    <span className="hidden sm:inline">Refresh</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* Scrollable Content Container */}
                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                        <div className="mx-auto w-full max-w-[1800px] 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">
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
        <div className="flex h-full flex-col font-mono text-xs">
            {/* Brand Header */}
            <div className="flex items-center justify-between border-b border-[#1F1F1F] px-4 py-3">
                <Link href="/dashboard">
                    <DeployForgeLogo variant="primary" size="md" />
                </Link>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-6 w-6 items-center justify-center rounded border border-[#1F1F1F] text-[#666666] hover:text-white"
                        aria-label="Close menu"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* Navigation Groups */}
            <nav className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-4">
                {NAV_GROUPS.map(group => (
                    <div key={group.label}>
                        <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-[#666666]">{group.label}</p>
                        <div className="space-y-0.5">
                            {group.items.map(item => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        className={`flex h-8 items-center gap-2.5 rounded px-2.5 text-xs transition-colors ${
                                            isActive
                                                ? 'bg-[#111111] font-semibold text-white'
                                                : 'text-[#A1A1A1] hover:bg-[#111111]/50 hover:text-white'
                                        }`}
                                    >
                                        <Icon size={14} className={isActive ? 'text-white' : 'text-[#666666]'} />
                                        <span className="truncate">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* User Profile Footer */}
            <div className="border-t border-[#1F1F1F] p-3">
                <div className="flex items-center justify-between gap-2 rounded border border-[#1F1F1F] bg-[#000000] p-2">
                    <Link href="/profile" className="flex items-center gap-2.5 min-w-0 flex-1 group" title="View Profile">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-[#1F1F1F] bg-[#111111] font-bold text-white group-hover:border-[#333333] transition-colors">
                            {user?.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={user.avatarUrl} alt="User Profile Avatar" className="h-full w-full object-cover" />
                            ) : (
                                user?.name?.[0] || user?.email?.[0]?.toUpperCase() || 'D'
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-white group-hover:underline">{user?.name || 'Developer'}</p>
                            <p className="truncate text-[10px] text-[#666666]">{user?.email || 'Signed in'}</p>
                        </div>
                    </Link>
                    <button
                        onClick={onLogout}
                        aria-label="Log out of account"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#1F1F1F] text-[#666666] hover:bg-[#111111] hover:text-white transition-colors"
                        title="Log out"
                    >
                        <LogOut size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}
