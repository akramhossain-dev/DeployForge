'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
    Bell, CheckCheck, AlertCircle, AlertTriangle,
    CheckCircle, Info, ExternalLink,
} from 'lucide-react';
import {
    useRecentNotifications,
    useUnreadCount,
    useMarkAllAsRead,
    useNotificationStream,
} from '@/hooks/useNotifications';
import type { AlertLevel, AppNotification } from '@/lib/api/types';

function getLevelIcon(level: AlertLevel, size = 14) {
    switch (level) {
        case 'CRITICAL': return <AlertCircle size={size} className="text-rose-400" />;
        case 'WARNING': return <AlertTriangle size={size} className="text-amber-400" />;
        case 'SUCCESS': return <CheckCircle size={size} className="text-emerald-400" />;
        default: return <Info size={size} className="text-cyan-400" />;
    }
}

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

export function NotificationDropdown() {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { data: recentData } = useRecentNotifications();
    const { data: unreadData } = useUnreadCount();
    const markAllAsRead = useMarkAllAsRead();

    // Real-time connection
    useNotificationStream(true);

    const notifications = recentData || [];
    const unreadCount = unreadData?.count || 0;

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setOpen(!open)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-400 transition-colors hover:bg-white/[0.1] hover:text-white"
                aria-label="Notifications"
            >
                <Bell size={16} />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-black text-white shadow-lg shadow-cyan-500/30 animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {open && (
                <div className="absolute right-0 top-12 z-50 w-[360px] rounded-xl border border-white/[0.08] bg-slate-950/95 shadow-2xl shadow-slate-950/80 backdrop-blur-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-bold text-cyan-400">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markAllAsRead.mutate()}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                            >
                                <CheckCheck size={12} /> Mark All Read
                            </button>
                        )}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[400px] overflow-y-auto terminal-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <Bell size={24} className="mb-2 text-slate-700" />
                                <p className="text-xs font-bold text-slate-500">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-white/[0.07] p-2">
                        <Link
                            href="/notifications"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                        >
                            View All Notifications <ExternalLink size={11} />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

function NotificationItem({ notification: n, onClose }: { notification: AppNotification; onClose: () => void }) {
    return (
        <div
            className={`flex items-start gap-3 border-b border-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.03] ${
                !n.isRead ? 'bg-cyan-500/[0.02]' : ''
            }`}
        >
            <div className="mt-0.5 shrink-0">{getLevelIcon(n.level)}</div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-xs font-bold ${n.isRead ? 'text-slate-400' : 'text-white'}`}>
                        {n.title}
                    </p>
                    <span className="shrink-0 text-[10px] text-slate-600">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{n.message}</p>
                {n.serverName && (
                    <p className="mt-1 text-[10px] text-slate-600">
                        Server: <span className="text-slate-400">{n.serverName}</span>
                    </p>
                )}
            </div>
            {!n.isRead && (
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
            )}
        </div>
    );
}
