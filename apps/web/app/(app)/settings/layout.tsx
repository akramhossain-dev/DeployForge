'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Shield, Bell, AlertTriangle, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui';

interface SettingsLayoutProps {
    children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
    const pathname = usePathname();

    const navItems = [
        {
            name: 'General',
            href: '/settings',
            icon: <User size={16} />,
            active: pathname === '/settings',
        },
        {
            name: 'Security',
            href: '/settings/security',
            icon: <Shield size={16} />,
            active: pathname === '/settings/security',
        },
        {
            name: 'Security Activity',
            href: '/settings/security-activity',
            icon: <Clock size={16} />,
            active: pathname === '/settings/security-activity',
        },
        {
            name: 'Notifications',
            href: '/settings/notifications',
            icon: <Bell size={16} />,
            active: pathname === '/settings/notifications',
        },
        {
            name: 'Account',
            href: '/settings/account',
            icon: <AlertTriangle size={16} />,
            active: pathname === '/settings/account',
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader 
                title="Settings" 
                description="Manage your DeployForge profile, security credentials, active sessions, and preferences." 
            />

            <div className="flex flex-col gap-6 lg:flex-row">
                {}
                <aside className="w-full shrink-0 lg:w-64">
                    <nav className="flex flex-row flex-wrap gap-1 rounded-lg border border-white/5 bg-slate-950/20 p-1 lg:flex-col lg:p-2">
                        {navItems.map((item) => (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                    item.active
                                        ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-500 lg:rounded-l-none'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                            >
                                <span className={item.active ? 'text-cyan-400' : 'text-slate-500'}>
                                    {item.icon}
                                </span>
                                {item.name}
                            </Link>
                        ))}
                    </nav>
                </aside>

                {}
                <main className="flex-1 space-y-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
