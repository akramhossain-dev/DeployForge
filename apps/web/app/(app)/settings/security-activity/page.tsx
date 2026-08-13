'use client';

import { useState, useEffect } from 'react';
import {
    Clock,
    Search,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Monitor,
    Smartphone,
    Tablet,
    HelpCircle,
    Shield,
    Key,
    Github,
    LogOut,
    AlertTriangle,
    Loader2
} from 'lucide-react';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import type { AuditLog } from '@/lib/api/types';

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface ApiResponseShape {
    logs: AuditLog[];
    pagination: Pagination;
}

export default function SecurityActivityPage() {
    const addToast = useToastStore((state) => state.addToast);

    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [page, setPage] = useState(1);
    const [limit] = useState(10);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchLogs = async (isManualRefresh = false) => {
        setIsLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                category,
                ...(search && { search })
            });

            const response = await api.get<ApiResponseShape>(`/profile/audit-logs?${queryParams.toString()}`);

            setLogs(response.logs || []);
            setPagination(response.pagination || null);

            if (isManualRefresh) {
                addToast({
                    title: 'Logs Updated',
                    description: 'Security activity log successfully loaded.',
                    severity: 'success'
                });
            }
        } catch (err: any) {
            console.error('Failed to fetch security logs:', err);
            addToast({
                title: 'Load Failure',
                description: err.message || 'Failed to load security activity logs.',
                severity: 'error'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, category]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchLogs(false);
    };

    const getDeviceIcon = (device?: string) => {
        if (!device) return <Monitor size={13} className="text-[#666666]" />;
        const d = device.toLowerCase();
        if (d.includes('mobile') || d.includes('phone')) return <Smartphone size={13} className="text-[#666666]" />;
        if (d.includes('tablet') || d.includes('ipad')) return <Tablet size={13} className="text-[#666666]" />;
        return <Monitor size={13} className="text-[#666666]" />;
    };

    const getActionBadge = (action: string) => {
        const actionLower = action.toLowerCase();

        let colorClasses = 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';
        let Icon = Shield;

        if (actionLower.includes('success') || actionLower.includes('verified')) {
            colorClasses = 'border-[#1F1F1F] bg-[#0A0A0A] text-emerald-400';
        } else if (actionLower.includes('failure') || actionLower.includes('attempt') || actionLower.includes('warn')) {
            colorClasses = 'border-rose-900/40 bg-rose-950/20 text-rose-400';
            Icon = AlertTriangle;
        } else if (actionLower.includes('password') || actionLower.includes('reset')) {
            colorClasses = 'border-[#1F1F1F] bg-[#0A0A0A] text-amber-300';
            Icon = Key;
        } else if (actionLower.includes('github')) {
            colorClasses = 'border-[#1F1F1F] bg-[#0A0A0A] text-white';
            Icon = Github;
        } else if (actionLower.includes('logout') || actionLower.includes('revoke')) {
            colorClasses = 'border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1]';
            Icon = LogOut;
        } else if (actionLower.includes('deleted')) {
            colorClasses = 'border-rose-900/50 bg-rose-950/30 text-rose-300';
            Icon = AlertTriangle;
        }

        return (
            <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${colorClasses}`}>
                <Icon size={11} />
                {action.replace(/_/g, ' ')}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[#1F1F1F] pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <Clock size={15} className="text-white" />
                        <h3 className="text-sm font-semibold text-white">Security Activity Audit Log</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchLogs(true)}
                        disabled={isLoading}
                        className="flex h-7 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs font-mono text-[#A1A1A1] hover:text-white transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                        <span>Refresh Logs</span>
                    </button>
                </div>

                <p className="text-xs text-[#A1A1A1] mb-4">
                    Comprehensive audit trail of security events, login attempts, session changes, and account credential updates.
                </p>

                {/* Filter and Search Bar */}
                <div className="grid gap-3 md:grid-cols-12 mb-6">
                    <form onSubmit={handleSearchSubmit} className="relative md:col-span-7 flex">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search event, description, browser, OS, or IP..."
                            className="w-full rounded-l-md border border-[#1F1F1F] bg-[#000000] py-1.5 pl-8 pr-3 font-mono text-xs text-white outline-none placeholder:text-[#666666] focus:border-[#333333]"
                        />
                        <Search className="absolute left-2.5 top-2 text-[#666666]" size={14} />
                        <button
                            type="submit"
                            className="rounded-r-md border border-l-0 border-[#1F1F1F] bg-[#111111] px-3 font-mono text-xs text-white hover:bg-[#1A1A1A]"
                        >
                            Search
                        </button>
                    </form>

                    <div className="md:col-span-5">
                        <select
                            value={category}
                            onChange={(e) => {
                                setCategory(e.target.value);
                                setPage(1);
                            }}
                            className="w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#333333]"
                        >
                            <option value="all">All Event Categories</option>
                            <option value="auth">Authentication (Logins & Logouts)</option>
                            <option value="sessions">Session Management</option>
                            <option value="password">Password Actions</option>
                            <option value="github">GitHub Integrations</option>
                            <option value="account">Account Modifications</option>
                        </select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex h-48 items-center justify-center font-mono text-xs text-[#666666]">
                        <Loader2 size={16} className="animate-spin mr-2" /> Loading security activity logs...
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-12 text-center font-mono text-xs text-[#666666] border border-dashed border-[#1F1F1F] rounded bg-[#000000]">
                        <HelpCircle className="mx-auto mb-2 text-[#666666]" size={24} />
                        <p className="text-white font-semibold">No activity logs match your filter criteria.</p>
                        <p className="mt-1 text-[#666666]">Try searching with a different term or clearing category filters.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="overflow-x-auto rounded border border-[#1F1F1F] bg-[#000000]">
                            <table className="w-full text-left font-mono text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                                        <th className="p-2.5 font-semibold">EVENT TYPE</th>
                                        <th className="p-2.5 font-semibold">DETAILS</th>
                                        <th className="p-2.5 font-semibold">CONTEXT (OS / BROWSER)</th>
                                        <th className="p-2.5 font-semibold">IP ADDRESS</th>
                                        <th className="p-2.5 font-semibold">TIMESTAMP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-[#111111]/50 transition-colors">
                                            <td className="p-2.5 whitespace-nowrap">
                                                {getActionBadge(log.action)}
                                            </td>
                                            <td className="p-2.5 max-w-sm text-white leading-relaxed break-words">
                                                {log.details}
                                            </td>
                                            <td className="p-2.5 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    {getDeviceIcon(log.device)}
                                                    <span>{log.os || 'Unknown OS'}</span>
                                                    <span className="text-[#666666]">•</span>
                                                    <span>{log.browser || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="p-2.5 text-[#A1A1A1] whitespace-nowrap">
                                                {log.ipAddress || '—'}
                                            </td>
                                            <td className="p-2.5 text-[#666666] whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Bar */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-3 border-t border-[#1F1F1F] font-mono text-xs">
                                <div className="text-[#666666]">
                                    Page <span className="font-bold text-white">{pagination.page}</span> of <span className="font-bold text-white">{pagination.totalPages}</span> ({pagination.total} events)
                                </div>
                                <div className="flex gap-1.5">
                                    <button
                                        type="button"
                                        disabled={pagination.page <= 1}
                                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                        className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A] disabled:opacity-40"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                                        className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A] disabled:opacity-40"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
