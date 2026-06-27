'use client';

import { useState, useMemo } from 'react';
import {
    Bell, Check, CheckCheck, Trash2, Search, Filter, X,
    AlertTriangle, AlertCircle, Info, CheckCircle, Server,
    Cpu, HardDrive, MemoryStick, Wifi, WifiOff, Rocket,
    Shield, Database, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button, Panel, PageHeader } from '@/components/ui';
import {
    useNotifications,
    useMarkAsRead,
    useMarkAllAsRead,
    useDeleteNotification,
    useDeleteAllNotifications,
    useNotificationStream,
} from '@/hooks/useNotifications';
import type { AlertLevel, AlertType, AppNotification } from '@/lib/api/types';

const ALERT_TYPE_OPTIONS: { value: AlertType | ''; label: string }[] = [
    { value: '', label: 'All Types' },
    { value: 'CPU_HIGH', label: 'High CPU' },
    { value: 'RAM_HIGH', label: 'High RAM' },
    { value: 'DISK_HIGH', label: 'High Disk' },
    { value: 'SWAP_HIGH', label: 'High Swap' },
    { value: 'SERVER_OFFLINE', label: 'Server Offline' },
    { value: 'SERVER_RECONNECTED', label: 'Server Online' },
    { value: 'HIGH_LOAD', label: 'High Load' },
    { value: 'DEPLOYMENT_FAILED', label: 'Deploy Failed' },
    { value: 'DEPLOYMENT_COMPLETED', label: 'Deploy Completed' },
    { value: 'SSL_EXPIRING', label: 'SSL Expiring' },
    { value: 'BACKUP_FAILED', label: 'Backup Failed' },
    { value: 'BACKUP_COMPLETED', label: 'Backup Completed' },
];

function getLevelIcon(level: AlertLevel) {
    switch (level) {
        case 'CRITICAL': return <AlertCircle size={16} className="text-rose-400" />;
        case 'WARNING': return <AlertTriangle size={16} className="text-amber-400" />;
        case 'SUCCESS': return <CheckCircle size={16} className="text-emerald-400" />;
        default: return <Info size={16} className="text-cyan-400" />;
    }
}

function getLevelBadge(level: AlertLevel) {
    const styles: Record<AlertLevel, string> = {
        CRITICAL: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
        WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        SUCCESS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
        INFO: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    };
    return styles[level] || styles.INFO;
}

function getTypeIcon(type: AlertType) {
    switch (type) {
        case 'CPU_HIGH': return <Cpu size={14} />;
        case 'RAM_HIGH': return <MemoryStick size={14} />;
        case 'DISK_HIGH': return <HardDrive size={14} />;
        case 'SWAP_HIGH': return <HardDrive size={14} />;
        case 'SERVER_OFFLINE': return <WifiOff size={14} />;
        case 'SERVER_RECONNECTED': return <Wifi size={14} />;
        case 'HIGH_LOAD': return <Server size={14} />;
        case 'DEPLOYMENT_FAILED':
        case 'DEPLOYMENT_COMPLETED': return <Rocket size={14} />;
        case 'SSL_EXPIRING': return <Shield size={14} />;
        case 'BACKUP_FAILED':
        case 'BACKUP_COMPLETED': return <Database size={14} />;
        default: return <Bell size={14} />;
    }
}

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

export default function NotificationsPage() {
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    // Build query params
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

    // Real-time stream
    useNotificationStream(true);

    const notifications = data?.notifications || [];
    const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Notification Center"
                description="Monitor alerts and system notifications from all your connected servers."
            />

            {/* Filters Bar */}
            <Panel>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search notifications..."
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                className="h-9 w-56 rounded-lg border border-white/10 bg-slate-950/60 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Type Filter */}
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <select
                                value={filters.type || ''}
                                onChange={(e) => { setFilters(f => ({ ...f, type: e.target.value })); setPage(1); }}
                                className="h-9 appearance-none rounded-lg border border-white/10 bg-slate-950/60 pl-9 pr-8 text-xs text-white outline-none focus:border-cyan-500/40"
                            >
                                {ALERT_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Read Status Filter */}
                        <select
                            value={filters.isRead || ''}
                            onChange={(e) => { setFilters(f => ({ ...f, isRead: e.target.value })); setPage(1); }}
                            className="h-9 appearance-none rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-white outline-none focus:border-cyan-500/40"
                        >
                            <option value="" className="bg-slate-900">All Status</option>
                            <option value="false" className="bg-slate-900">Unread</option>
                            <option value="true" className="bg-slate-900">Read</option>
                        </select>
                    </div>

                    {/* Bulk Actions */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            className="h-9 text-xs"
                            onClick={() => markAllAsRead.mutate()}
                            loading={markAllAsRead.isPending}
                        >
                            <CheckCheck size={14} /> Mark All Read
                        </Button>
                        <Button
                            variant="secondary"
                            className="h-9 text-xs text-rose-400 hover:text-rose-300"
                            onClick={() => { if (confirm('Delete all notifications?')) deleteAll.mutate(); }}
                            loading={deleteAll.isPending}
                        >
                            <Trash2 size={14} /> Clear All
                        </Button>
                    </div>
                </div>
            </Panel>

            {/* Notifications List */}
            {isLoading ? (
                <Panel>
                    <div className="flex h-40 items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                    </div>
                </Panel>
            ) : notifications.length === 0 ? (
                <Panel>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800/50 border border-white/5">
                            <Bell size={28} className="text-slate-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-400">No notifications</p>
                        <p className="mt-1 text-xs text-slate-500">
                            {search || filters.type || filters.isRead
                                ? 'No notifications match your filters.'
                                : 'When alerts are triggered, they will appear here.'}
                        </p>
                    </div>
                </Panel>
            ) : (
                <div className="space-y-2">
                    {notifications.map((n) => (
                        <NotificationRow
                            key={n.id}
                            notification={n}
                            onMarkRead={() => markAsRead.mutate(n.id)}
                            onDelete={() => deleteNotification.mutate(n.id)}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-950/20 px-4 py-3">
                    <p className="text-xs text-slate-500">
                        Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 disabled:opacity-30"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="px-3 text-xs font-bold text-slate-300">{page}</span>
                        <button
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 disabled:opacity-30"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function NotificationRow({
    notification: n,
    onMarkRead,
    onDelete,
}: {
    notification: AppNotification;
    onMarkRead: () => void;
    onDelete: () => void;
}) {
    return (
        <div
            className={`group relative flex items-start gap-3 rounded-lg border p-4 transition-all ${
                n.isRead
                    ? 'border-white/5 bg-slate-950/20 opacity-70'
                    : 'border-white/10 bg-slate-950/40 hover:border-white/15'
            }`}
        >
            {/* Unread indicator */}
            {!n.isRead && (
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            )}

            {/* Level icon */}
            <div className="mt-0.5 shrink-0">{getLevelIcon(n.level)}</div>

            {/* Content */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${getLevelBadge(n.level)}`}>
                        {n.level}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                        {getTypeIcon(n.type)}
                        {n.type.replace(/_/g, ' ')}
                    </span>
                    {n.serverName && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Server size={10} /> {n.serverName}
                        </span>
                    )}
                </div>
                <p className="mt-1.5 text-sm font-bold text-white">{n.title}</p>
                <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{n.message}</p>
                <div className="mt-2 flex items-center gap-3">
                    <span className="text-[10px] text-slate-600">{timeAgo(n.createdAt)}</span>
                    {n.resourceValue != null && (
                        <span className="text-[10px] font-mono text-slate-500">{n.resourceValue}%</span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!n.isRead && (
                    <button
                        onClick={onMarkRead}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.08] hover:text-cyan-400 transition-colors"
                        title="Mark as read"
                    >
                        <Check size={12} />
                    </button>
                )}
                <button
                    onClick={onDelete}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                    title="Delete"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    );
}
