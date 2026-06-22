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
    User,
    LogOut,
    AlertTriangle
} from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

interface AuditLog {
    id: string;
    action: string;
    details: string;
    ipAddress?: string;
    userAgent?: string;
    device?: string;
    browser?: string;
    os?: string;
    createdAt: string;
}

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

    // Filter, Search, Pagination state
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [page, setPage] = useState(1);
    const [limit] = useState(10);

    // Data state
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

            // api.get automatically unwraps response.data
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

    // Refetch when page, category, or search filters change
    useEffect(() => {
        fetchLogs(false);
    }, [page, category]);

    // Handle search submit
    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchLogs(false);
    };

    const getDeviceIcon = (device?: string) => {
        if (!device) return <Monitor size={15} className="text-slate-400" />;
        const d = device.toLowerCase();
        if (d.includes('mobile') || d.includes('phone')) return <Smartphone size={15} className="text-slate-400" />;
        if (d.includes('tablet') || d.includes('ipad')) return <Tablet size={15} className="text-slate-400" />;
        return <Monitor size={15} className="text-slate-400" />;
    };

    const getActionBadge = (action: string) => {
        const actionLower = action.toLowerCase();

        let colorClasses = 'bg-slate-500/10 border-slate-500/20 text-slate-300';
        let Icon = Shield;

        if (actionLower.includes('success') || actionLower.includes('verified')) {
            colorClasses = 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
        } else if (actionLower.includes('failure') || actionLower.includes('attempt') || actionLower.includes('warn')) {
            colorClasses = 'bg-rose-500/10 border-rose-500/25 text-rose-400';
            Icon = AlertTriangle;
        } else if (actionLower.includes('password') || actionLower.includes('reset')) {
            colorClasses = 'bg-amber-500/10 border-amber-500/25 text-amber-400';
            Icon = Key;
        } else if (actionLower.includes('github')) {
            colorClasses = 'bg-indigo-500/10 border-indigo-500/25 text-indigo-400';
            Icon = Github;
        } else if (actionLower.includes('logout') || actionLower.includes('revoke')) {
            colorClasses = 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400';
            Icon = LogOut;
        } else if (actionLower.includes('deleted')) {
            colorClasses = 'bg-rose-600/15 border-rose-600/30 text-rose-300';
            Icon = AlertTriangle;
        }

        return (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${colorClasses}`}>
                <Icon size={12} />
                {action.replace(/_/g, ' ')}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <Panel>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="text-cyan-400" size={18} />
                        <h3 className="font-bold text-white">Security Activity Log</h3>
                    </div>
                    <Button
                        variant="secondary"
                        className="self-end md:self-auto text-xs px-3 py-1.5"
                        onClick={() => fetchLogs(true)}
                        disabled={isLoading}
                    >
                        <RefreshCw size={14} className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh Logs
                    </Button>
                </div>

                <p className="text-xs text-slate-400 mb-6">
                    Audit log of the security-relevant events, logins, session changes, and credential updates for your account.
                </p>

                {/* Filter and Search Bar */}
                <div className="grid gap-4 md:grid-cols-12 mb-6">
                    <form onSubmit={handleSearchSubmit} className="relative md:col-span-7 flex">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by event, description, browser, OS or IP..."
                            className="w-full bg-slate-950 border border-white/10 rounded-l-md pl-9 pr-3 py-2 text-white focus:outline-none focus:border-cyan-500 text-sm placeholder-slate-500"
                        />
                        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                        <Button type="submit" className="rounded-l-none rounded-r-md px-4">
                            Search
                        </Button>
                    </form>

                    <div className="md:col-span-5">
                        <select
                            value={category}
                            onChange={(e) => {
                                setCategory(e.target.value);
                                setPage(1);
                            }}
                            className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                        >
                            <option value="all">All Events</option>
                            <option value="auth">Authentication (Logins & Logouts)</option>
                            <option value="sessions">Session Management</option>
                            <option value="password">Password Actions</option>
                            <option value="github">GitHub Integrations</option>
                            <option value="account">Account Modifications</option>
                        </select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 border border-dashed border-white/5 rounded-lg bg-slate-950/20">
                        <HelpCircle className="mx-auto text-slate-600 mb-2" size={32} />
                        <p className="text-sm font-medium">No activity matches your filters.</p>
                        <p className="text-xs text-slate-600 mt-1">Try clearing your search query or selecting another category filter.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border border-white/5 bg-slate-950/20">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/[0.02] text-slate-400">
                                        <th className="p-3 font-semibold">Event Type</th>
                                        <th className="p-3 font-semibold">Details</th>
                                        <th className="p-3 font-semibold">Context (OS / Browser)</th>
                                        <th className="p-3 font-semibold">IP Address</th>
                                        <th className="p-3 font-semibold">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-slate-300">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="p-3 font-medium text-white whitespace-nowrap">
                                                {getActionBadge(log.action)}
                                            </td>
                                            <td className="p-3 max-w-sm font-normal text-slate-300 leading-relaxed break-words">
                                                {log.details}
                                            </td>
                                            <td className="p-3 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    {getDeviceIcon(log.device)}
                                                    <span className="text-slate-300">{log.os || 'Unknown OS'}</span>
                                                    <span className="text-slate-500">•</span>
                                                    <span className="text-slate-400">{log.browser || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                                                {log.ipAddress || '—'}
                                            </td>
                                            <td className="p-3 text-slate-400 whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination controls */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <div className="text-xs text-slate-400">
                                    Showing page <span className="font-semibold text-white">{pagination.page}</span> of <span className="font-semibold text-white">{pagination.totalPages}</span> ({pagination.total} total events)
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="secondary"
                                        className="p-1.5 text-xs"
                                        disabled={pagination.page <= 1}
                                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                    >
                                        <ChevronLeft size={16} />
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="p-1.5 text-xs"
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                                    >
                                        <ChevronRight size={16} />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Panel>
        </div>
    );
}
