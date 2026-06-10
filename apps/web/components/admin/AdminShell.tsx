'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { Activity, Github, LayoutDashboard, ListFilter, LogOut, Rocket, Server, Settings, ShieldCheck, Users } from 'lucide-react';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';
import { useAdminMe } from '@/hooks/useDeployForgeData';
import { SkeletonBlock } from '@/components/ui';
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
    const { admin, adminToken, hasHydrated, setAdmin, logoutAdmin } = useAdminAuthStore();
    const isLogin = pathname === '/admin/login';
    const me = useAdminMe(hasHydrated && !!adminToken && !isLogin);
    const role = me.data?.role || admin?.role;

    useEffect(() => {
        if (isLogin) return;
        if (!hasHydrated) return;
        if (!adminToken) router.replace('/admin/login');
    }, [adminToken, hasHydrated, isLogin, router]);

    useEffect(() => {
        if (me.data) setAdmin(me.data);
    }, [me.data, setAdmin]);

    if (isLogin) return <>{children}</>;

    if (!hasHydrated || (hasHydrated && !adminToken) || me.isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
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
            <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center">
                <div className="max-w-md rounded-lg border border-red-500/30 bg-red-950/20 p-6">
                    <ShieldCheck className="mx-auto text-red-300" size={36} />
                    <h1 className="mt-4 text-xl font-black text-white">Admin access required</h1>
                    <p className="mt-2 text-sm text-red-100/80">Use an admin account created by a super admin to continue.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.12),transparent_28%)]" />
            <div className="relative flex min-h-screen">
                <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-800/80 bg-slate-950/85 p-4 backdrop-blur-xl lg:block">
                    <div className="mb-6 flex items-center gap-3 px-2 py-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <p className="font-black text-white">DeployForge Admin</p>
                            <p className="text-xs font-bold uppercase text-cyan-300">{role}</p>
                        </div>
                    </div>
                    <nav className="space-y-1">
                        {nav.map((item) => {
                            const Icon = item.icon;
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold transition-colors ${active ? 'bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
                                >
                                    <Icon size={18} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                    <button
                        onClick={async () => {
                            await api.post('/admin/logout').catch(() => null);
                            logoutAdmin();
                            router.replace('/admin/login');
                        }}
                        className="mt-6 flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold text-red-300 hover:bg-red-500/10"
                    >
                        <LogOut size={16} /> Log Out
                    </button>
                </aside>
                <main className="min-w-0 flex-1">
                    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 px-4 py-4 backdrop-blur-xl sm:px-8">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Admin Control Plane</p>
                                <h1 className="text-xl font-black text-white">{nav.find((item) => item.href === pathname)?.label || 'Overview'}</h1>
                            </div>
                            <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300">
                                {admin?.email}
                            </div>
                        </div>
                        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                            {nav.map((item) => {
                                const Icon = item.icon;
                                const active = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold ${active ? 'bg-cyan-400 text-slate-950' : 'border border-slate-800 bg-slate-900 text-slate-300'}`}
                                    >
                                        <Icon size={15} />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    </header>
                    <div className="p-4 sm:p-8">{children}</div>
                </main>
            </div>
        </div>
    );
}
