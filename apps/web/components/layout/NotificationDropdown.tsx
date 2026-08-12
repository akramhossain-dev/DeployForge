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

function getLevelIcon(level: AlertLevel, size = 13) {
    switch (level) {
        case 'CRITICAL': return <AlertCircle size={size} className="text-rose-400" />;
        case 'WARNING': return <AlertTriangle size={size} className="text-amber-400" />;
        case 'SUCCESS': return <CheckCircle size={size} className="text-emerald-400" />;
        default: return <Info size={size} className="text-white" />;
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
                className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] transition-colors hover:bg-[#111111] hover:text-white"
                aria-label="Notifications"
            >
                <Bell size={14} />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-white px-1 font-mono text-[9px] font-bold text-black">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {open && (
                <div className="absolute right-0 top-10 z-50 w-[340px] rounded-md border border-[#1F1F1F] bg-[#0A0A0A] shadow-xl">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#1F1F1F] px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="rounded border border-[#1F1F1F] bg-[#111111] px-1.5 py-0.5 font-mono text-[10px] text-white">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markAllAsRead.mutate()}
                                className="flex items-center gap-1 text-[10px] font-mono text-[#A1A1A1] hover:text-white transition-colors"
                            >
                                <CheckCheck size={12} /> Mark Read
                            </button>
                        )}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[360px] overflow-y-auto no-scrollbar font-mono text-xs">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center text-[#666666]">
                                <Bell size={18} className="mb-2 text-[#666666]" />
                                <p className="text-xs font-mono">No notifications recorded</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-[#1F1F1F] p-2">
                        <Link
                            href="/notifications"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs text-[#A1A1A1] hover:bg-[#111111] hover:text-white transition-colors"
                        >
                            <span>View All Notifications</span>
                            <ExternalLink size={11} />
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
            className={`flex items-start gap-2.5 border-b border-[#1F1F1F] px-3.5 py-2.5 transition-colors hover:bg-[#111111]/60 ${
                !n.isRead ? 'bg-[#111111]/30' : ''
            }`}
        >
            <div className="mt-0.5 shrink-0">{getLevelIcon(n.level)}</div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-xs ${n.isRead ? 'text-[#A1A1A1]' : 'font-semibold text-white'}`}>
                        {n.title}
                    </p>
                    <span className="shrink-0 text-[10px] text-[#666666]">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-[#666666] line-clamp-2 leading-relaxed">{n.message}</p>
                {n.serverName && (
                    <p className="mt-1 text-[10px] text-[#666666]">
                        Server: <span className="text-[#A1A1A1]">{n.serverName}</span>
                    </p>
                )}
            </div>
            {!n.isRead && (
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
            )}
        </div>
    );
}
