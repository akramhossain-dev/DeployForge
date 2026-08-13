'use client';

import { useState, useMemo } from 'react';
import {
    Bell, Check, CheckCheck, Trash2, Search, Filter, X,
    AlertTriangle, AlertCircle, Info, CheckCircle, Server,
    Cpu, HardDrive, MemoryStick, Wifi, WifiOff, Rocket,
    Shield, Database, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import {
    useNotifications,
    useMarkAsRead,
    useMarkAllAsRead,
    useDeleteNotification,
    useDeleteAllNotifications,
} from '@/hooks/useNotifications';
import type { AlertLevel, AlertType, AppNotification } from '@/lib/api/types';
import { formatDate } from '@/components/ui';
import clsx from 'clsx';

const ALERT_TYPE_OPTIONS: { value: AlertType | ''; label: string }[] = [
    { value: '', label: 'All Alert Types' },
    { value: 'CPU_HIGH', label: 'High CPU' },
    { value: 'RAM_HIGH', label: 'High RAM' },
    { value: 'DISK_HIGH', label: 'High Disk' },
    { value: 'SERVER_OFFLINE', label: 'Server Offline' },
    { value: 'SERVER_RECONNECTED', label: 'Server Online' },
    { value: 'DEPLOYMENT_FAILED', label: 'Deploy Failed' },
    { value: 'DEPLOYMENT_COMPLETED', label: 'Deploy Completed' },
];

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function LevelBadge({ level }: { level: AlertLevel }) {
    const s = String(level).toUpperCase();
    const style = s === 'CRITICAL'
        ? 'border-rose-900/40 bg-rose-950/20 text-rose-400 font-bold'
        : s === 'WARNING'
        ? 'border-amber-900/40 bg-amber-950/20 text-amber-400 font-bold'
        : s === 'SUCCESS'
        ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-400 font-bold'
        : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider', style)}>
            {s}
        </span>
    );
}

export default function NotificationsPage() {
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [showClearAllModal, setShowClearAllModal] = useState(false);

    const queryParams = useMemo(() => {
        const params: Record<string, string> = { page: String(page), limit: '20' };
        if (filters.type) params.type = filters.type;
        if (filters.isRead) params.isRead = filters.isRead;
        if (search.trim()) params.search = search.trim();
        return params;
    }, [filters, search, page]);

    const { data, isLoading } = useNotifications(queryParams);
    const markAsRead = useMarkAsRead();
    const markAllAsRead = useMarkAllAsRead();
    const deleteNotification = useDeleteNotification();
    const deleteAll = useDeleteAllNotifications();

    const notifications = data?.notifications || [];
    const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 };

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Notification Center
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Monitor system alerts, deployment execution events, and operational audit records.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => markAllAsRead.mutate()}
                        disabled={markAllAsRead.isPending}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                    >
                        <CheckCheck size={13} />
                        <span>Mark All Read</span>
                    </button>
                    <button
                        onClick={() => setShowClearAllModal(true)}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-rose-900/40 bg-rose-950/20 px-3 font-semibold text-rose-300 hover:bg-rose-900/30"
                    >
                        <Trash2 size={13} />
                        <span>Clear All</span>
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col gap-3 sm:flex-row">
                <input
                    type="text"
                    placeholder="Search notifications by title or message..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className={clsx(INPUT_STYLE, 'flex-1')}
                />
                <select
                    value={filters.type || ''}
                    onChange={(e) => { setFilters(f => ({ ...f, type: e.target.value })); setPage(1); }}
                    className={clsx(INPUT_STYLE, 'sm:w-44')}
                >
                    {ALERT_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <select
                    value={filters.isRead || ''}
                    onChange={(e) => { setFilters(f => ({ ...f, isRead: e.target.value })); setPage(1); }}
                    className={clsx(INPUT_STYLE, 'sm:w-36')}
                >
                    <option value="">All Status</option>
                    <option value="false">Unread</option>
                    <option value="true">Read</option>
                </select>
            </div>

            {/* Notifications Feed */}
            {isLoading ? (
                <div className="flex h-40 items-center justify-center font-mono text-xs text-[#666666]">
                    <Loader2 size={16} className="animate-spin mr-2" /> Loading notification feed...
                </div>
            ) : notifications.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center text-[#666666]">
                    <Bell size={24} className="mx-auto mb-2 text-[#666666]" />
                    <p className="text-white font-semibold">No Notifications Found</p>
                    <p className="mt-1 text-xs">
                        {search || filters.type || filters.isRead ? 'No alerts match your filter selection.' : 'System alerts and events will appear here.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {notifications.map((n) => (
                        <div
                            key={n.id}
                            className={clsx(
                                'rounded-md border p-4 flex items-start justify-between gap-4 transition-colors',
                                n.isRead ? 'border-[#1F1F1F] bg-[#0A0A0A] opacity-60' : 'border-[#1F1F1F] bg-[#000000]'
                            )}
                        >
                            <div className="space-y-1.5 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <LevelBadge level={n.level} />
                                    <span className="inline-flex items-center rounded border border-[#1F1F1F] bg-[#111111] px-1.5 py-0.5 text-[10px] text-[#A1A1A1]">
                                        {n.type.replace(/_/g, ' ')}
                                    </span>
                                    {n.serverName && (
                                        <span className="text-[10px] text-[#666666]">
                                            Node: {n.serverName}
                                        </span>
                                    )}
                                </div>
                                <p className="font-bold text-white text-xs">{n.title}</p>
                                <p className="text-[#A1A1A1] text-xs leading-relaxed">{n.message}</p>
                                <p className="text-[10px] text-[#666666]">{formatDate(n.createdAt)}</p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                {!n.isRead && (
                                    <button
                                        onClick={() => markAsRead.mutate(n.id)}
                                        className="h-7 w-7 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white"
                                        title="Mark Read"
                                    >
                                        <Check size={12} />
                                    </button>
                                )}
                                <button
                                    onClick={() => deleteNotification.mutate(n.id)}
                                    className="h-7 w-7 flex items-center justify-center rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30"
                                    title="Delete"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#1F1F1F] pt-4 text-xs text-[#A1A1A1]">
                    <span>Page {page} of {pagination.totalPages} ({pagination.total} total)</span>
                    <div className="flex items-center gap-1">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-7 w-7 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#0A0A0A] text-white disabled:opacity-30"
                        >
                            <ChevronLeft size={13} />
                        </button>
                        <button
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="h-7 w-7 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#0A0A0A] text-white disabled:opacity-30"
                        >
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}

            {/* Clear Modal */}
            {showClearAllModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                        <div className="border-b border-[#1F1F1F] pb-3">
                            <h3 className="text-sm font-bold text-white">Clear All Notifications</h3>
                            <p className="mt-1 text-[#666666]">This action permanently purges all alert history records.</p>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setShowClearAllModal(false)} className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    deleteAll.mutate(undefined, {
                                        onSuccess: () => setShowClearAllModal(false)
                                    });
                                }}
                                disabled={deleteAll.isPending}
                                className="flex h-8 items-center gap-1 rounded border border-rose-900/40 bg-rose-950/40 px-3 font-semibold text-rose-300 hover:bg-rose-900/60"
                            >
                                {deleteAll.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Confirm Purge
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
