'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Settings,
    Terminal,
    Server,
    Github,
    Activity,
    LogOut,
    Rocket,
    ShieldCheck
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useMe } from '@/hooks/useDeployForgeData';
import { SkeletonBlock } from '@/components/ui';

interface DashboardLayoutProps {
    children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, token, hasHydrated, setUser, logout } = useAuthStore();
    const me = useMe(hasHydrated && !!token);

    React.useEffect(() => {
        if (!hasHydrated) return;
        if (!token) router.replace('/login');
    }, [hasHydrated, router, token]);

    React.useEffect(() => {
        if (me.data) setUser(me.data);
    }, [me.data, setUser]);

    const navItems = [
        { name: 'Overview', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
        { name: 'Deployments', icon: <Rocket size={20} />, href: '/deployments' },
        { name: 'Repositories', icon: <Github size={20} />, href: '/repositories' },
        { name: 'VPS Manager', icon: <Server size={20} />, href: '/vps' },
        { name: 'Terminal', icon: <Terminal size={20} />, href: '/terminal' },
        { name: 'Monitoring', icon: <Activity size={20} />, href: '/monitoring' },
        { name: 'Sandbox', icon: <ShieldCheck size={20} />, href: '/sandbox' },
        { name: 'Settings', icon: <Settings size={20} />, href: '/settings' },
    ];

    if (!hasHydrated || (hasHydrated && !token)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
                <div className="w-full max-w-sm space-y-3">
                    <SkeletonBlock className="h-10 w-48" />
                    <SkeletonBlock className="h-28 w-full" />
                    <SkeletonBlock className="h-28 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-200">
            {/* Sidebar */}
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 lg:flex">
                <div className="p-6 mb-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
                        <Rocket size={18} className="text-white" />
                    </div>
                    <span className="font-black text-white tracking-tighter">DeployForge</span>
                </div>

                <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${isActive
                                        ? 'bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                    }`}
                            >
                                {item.icon}
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 mt-auto">
                    <div className="mb-4 rounded-lg border border-slate-800/50 bg-slate-900 p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold">
                                {user?.name?.[0] || user?.email?.[0]?.toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-bold text-white truncate">{user?.name || 'Developer'}</p>
                                <p className="text-xs text-slate-500 truncate">{user?.email || 'Signed in'}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                logout();
                                router.replace('/login');
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                            <LogOut size={14} /> Log Out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="min-w-0 flex-1">
                <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-4 backdrop-blur-md sm:px-8">
                    <h2 className="text-xl font-bold text-white">
                        {navItems.find(i => i.href === pathname)?.name || 'Dashboard'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-400">
                            <span className={`h-2 w-2 rounded-full ${me.isError ? 'bg-red-400' : 'bg-emerald-400'}`} /> API
                        </div>
                    </div>
                </header>

                <div className="p-4 sm:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
