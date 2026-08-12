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
            icon: <User size={14} />,
            active: pathname === '/settings',
        },
        {
            name: 'Security',
            href: '/settings/security',
            icon: <Shield size={14} />,
            active: pathname === '/settings/security',
        },
        {
            name: 'Security Activity',
            href: '/settings/security-activity',
            icon: <Clock size={14} />,
            active: pathname === '/settings/security-activity',
        },
        {
            name: 'Notifications',
            href: '/settings/notifications',
            icon: <Bell size={14} />,
            active: pathname === '/settings/notifications',
        },
        {
            name: 'Account',
            href: '/settings/account',
            icon: <AlertTriangle size={14} />,
            active: pathname === '/settings/account',
        },
    ];

    return (
        <div className="space-y-6 font-mono text-xs">
            <PageHeader 
                title="Settings" 
                description="Manage your profile, security credentials, active sessions, and account options." 
            />

            <div className="flex flex-col gap-6 lg:flex-row">
                {/* Settings Sidebar */}
                <aside className="w-full shrink-0 lg:w-56">
                    <nav className="flex flex-row flex-wrap gap-1 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-1 lg:flex-col lg:p-1.5">
                        {navItems.map((item) => (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-2.5 rounded px-3 py-2 text-xs transition-colors ${
                                    item.active
                                        ? 'bg-[#111111] font-semibold text-white'
                                        : 'text-[#A1A1A1] hover:bg-[#111111]/50 hover:text-white'
                                }`}
                            >
                                <span className={item.active ? 'text-white' : 'text-[#666666]'}>
                                    {item.icon}
                                </span>
                                <span>{item.name}</span>
                            </Link>
                        ))}
                    </nav>
                </aside>

                {/* Main Settings Content */}
                <main className="flex-1 space-y-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
