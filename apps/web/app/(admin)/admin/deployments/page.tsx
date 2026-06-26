'use client';

import { useMemo, useState } from 'react';
import {
    GitBranch, Globe, Loader2, RefreshCw, RotateCcw,
    Rocket, Search, Server, Square, Trash2, User, XCircle, CheckCircle2, Zap, Clock
} from 'lucide-react';
import clsx from 'clsx';
import { ErrorState, PageHeader, SkeletonBlock } from '@/components/ui';
import { StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminDeployments } from '@/hooks/useDeployForgeData';

const STATUSES = ['PENDING', 'BUILDING', 'RUNNING', 'FAILED', 'STOPPED'];

function statusIcon(status: string) {
    const s = status.toUpperCase();
    if (s === 'RUNNING') return <CheckCircle2 size={13} className="text-emerald-400" />;
    if (['BUILDING', 'PENDING', 'CLONING', 'UPLOADING', 'DEPLOYING'].includes(s)) return <Zap size={13} className="text-cyan-400" />;
    if (s === 'FAILED') return <XCircle size={13} className="text-rose-400" />;
    return <Clock size={13} className="text-slate-500" />;
}

const STRIPE: Record<string, string> = {
    RUNNING:   'from-emerald-400/60 via-emerald-400/10',
    FAILED:    'from-rose-400/60 via-rose-400/10',
    BUILDING:  'from-cyan-400/60 via-cyan-400/10',
    PENDING:   'from-cyan-400/40 via-cyan-400/10',
    STOPPED:   'from-slate-500/40 via-slate-500/5',
};

const CARD_GLOW: Record<string, string> = {
    RUNNING: 'hover:border-emerald-400/30 hover:shadow-[0_0_32px_-8px_theme(colors.emerald.400/15)]',
    FAILED:  'hover:border-rose-400/30 hover:shadow-[0_0_32px_-8px_theme(colors.rose.400/15)]',
    BUILDING:'hover:border-cyan-400/30 hover:shadow-[0_0_32px_-8px_theme(colors.cyan.400/15)]',
};

export default function AdminDeploymentsPage() {
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const params = useMemo(() => ({ status }), [status]);
    const deployments = useAdminDeployments(params);
    const action      = useAdminAction();

    const filtered = useMemo(() => {
        if (!search.trim()) return deployments.data || [];
        const q = search.toLowerCase();
        return (deployments.data || []).filter(d =>
            (d.name || d.project?.name || d.id).toLowerCase().includes(q) ||
            (d.user?.email || '').toLowerCase().includes(q)
        );
    }, [deployments.data, search]);

    const running = (deployments.data || []).filter(d => d.status === 'RUNNING').length;
    const failed  = (deployments.data || []).filter(d => d.status === 'FAILED').length;
    const total   = deployments.data?.length ?? 0;

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <PageHeader
                title="Deployment Management"
                description="View, filter, stop, restart, and delete deployments across all users."
                action={
                    <button
                        onClick={() => deployments.refetch()}
                        disabled={deployments.isRefetching}
                        className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-bold text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
                    >
                        {deployments.isRefetching
                            ? <Loader2 size={14} className="animate-spin" />
                            : <RefreshCw size={14} />}
                        Refresh
                    </button>
                }
            />

            {deployments.isError && <ErrorState message={(deployments.error as Error)?.message} onRetry={() => deployments.refetch()} />}
            {action.isError      && <ErrorState title="Action failed" message={(action.error as Error)?.message} />}

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {[
                    { label: 'Total Deployments', value: total,   accent: 'border-white/[0.08]  bg-white/[0.03]',   val: 'text-white'       },
                    { label: 'Currently Running',  value: running, accent: 'border-emerald-400/20 bg-emerald-400/[0.06]', val: 'text-emerald-300' },
                    { label: 'Failed',             value: failed,  accent: failed > 0 ? 'border-rose-400/25 bg-rose-400/[0.06]' : 'border-white/[0.08] bg-white/[0.03]', val: failed > 0 ? 'text-rose-300' : 'text-slate-400' },
                ].map(k => (
                    <div key={k.label} className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${k.accent}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{k.label}</p>
                        <p className={`mt-2 text-3xl font-black sm:text-4xl ${k.val}`}>
                            {deployments.isLoading ? '—' : k.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* ── Filter bar ── */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* Search */}
                <div className="relative flex-1">
                    <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or user email…"
                        className="h-11 w-full rounded-xl border border-white/[0.08] bg-slate-900/80 pl-9 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40 transition-colors"
                    />
                </div>
                {/* Status pills */}
                <div className="flex flex-wrap gap-1.5">
                    {['all', ...STATUSES].map(s => (
                        <button key={s} onClick={() => setStatus(s === 'all' ? '' : s)}
                            className={clsx(
                                'h-9 rounded-xl px-3 text-[11px] font-black uppercase tracking-wider transition-all border',
                                (s === 'all' ? status === '' : status === s)
                                    ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200'
                                    : 'border-white/[0.07] bg-white/[0.03] text-slate-500 hover:border-white/15 hover:text-slate-300'
                            )}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Skeletons ── */}
            {deployments.isLoading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-52 rounded-2xl" />)}
                </div>
            )}

            {/* ── Empty ── */}
            {!deployments.isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-slate-900/50 py-16 text-center">
                    <Rocket size={36} className="text-slate-600" />
                    <p className="mt-4 font-black text-slate-300">No deployments found</p>
                    <p className="mt-1 text-xs text-slate-600">{search ? 'Try a different search term.' : 'No data returned.'}</p>
                </div>
            )}

            {/* ── Cards grid ── */}
            {!deployments.isLoading && filtered.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filtered.map(d => {
                        const name  = d.name || d.project?.name || d.id.slice(0, 10);
                        const repo  = d.project?.repositoryUrl?.replace('https://github.com/', '') || null;
                        const s     = d.status?.toUpperCase();
                        const stripe = STRIPE[s] || 'from-slate-500/30 via-slate-500/5';
                        const glow   = CARD_GLOW[s] || 'hover:border-white/15';

                        return (
                            <div key={d.id}
                                className={clsx(
                                    'group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/80 to-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300',
                                    glow
                                )}>

                                {/* Accent top strip */}
                                <div className={clsx('h-0.5 w-full bg-gradient-to-r to-transparent', stripe)} />

                                <div className="flex flex-1 flex-col gap-0 p-5">
                                    {/* Name + status */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {statusIcon(d.status)}
                                            <div className="min-w-0">
                                                <p className="truncate font-black text-white leading-tight">{name}</p>
                                                {repo && <p className="mt-0.5 truncate text-[10px] text-slate-500">{repo}</p>}
                                            </div>
                                        </div>
                                        <StatusBadge status={d.status} />
                                    </div>

                                    {/* Meta pills */}
                                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                                        <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-slate-800/60 px-2 py-1 text-[10px] font-semibold text-slate-400">
                                            <User size={9} className="text-slate-500" /> {d.user?.email?.split('@')[0] || 'Unknown'}
                                        </span>
                                        {d.vps?.name && (
                                            <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-slate-800/60 px-2 py-1 text-[10px] font-semibold text-slate-400">
                                                <Server size={9} className="text-slate-500" /> {d.vps.name}
                                            </span>
                                        )}
                                        {d.project?.branch && (
                                            <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-slate-800/60 px-2 py-1 text-[10px] font-semibold text-slate-400">
                                                <GitBranch size={9} className="text-slate-500" /> {d.project.branch}
                                            </span>
                                        )}
                                        {d.port && (
                                            <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-slate-800/60 px-2 py-1 text-[10px] font-semibold text-slate-400">
                                                <Globe size={9} className="text-slate-500" /> :{d.port}
                                            </span>
                                        )}
                                    </div>

                                    {/* Log snippet */}
                                    {d.deploymentLogs?.[0]?.message && (
                                        <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2">
                                            <p className="line-clamp-2 font-mono text-[10px] leading-[1.6] text-slate-500">
                                                {d.deploymentLogs[0].message}
                                            </p>
                                        </div>
                                    )}

                                    {/* Spacer */}
                                    <div className="flex-1" />

                                    {/* Footer */}
                                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
                                        <p className="text-[10px] text-slate-600">{formatDate(d.updatedAt || d.createdAt)}</p>

                                        <div className="flex items-center gap-1">
                                            <ActionBtn title="Stop"    onClick={() => action.mutate({ path: `/admin/deployments/${d.id}/stop` })}>
                                                <Square size={12} />
                                            </ActionBtn>
                                            <ActionBtn title="Restart" onClick={() => action.mutate({ path: `/admin/deployments/${d.id}/restart` })}>
                                                <RotateCcw size={12} />
                                            </ActionBtn>
                                            <ActionBtn title="Delete"  danger onClick={() => action.mutate({ method: 'delete', path: `/admin/deployments/${d.id}` })}>
                                                <Trash2 size={12} />
                                            </ActionBtn>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Result count */}
            {!deployments.isLoading && filtered.length > 0 && (
                <p className="text-center text-[11px] text-slate-600">
                    Showing <span className="font-black text-slate-400">{filtered.length}</span> of{' '}
                    <span className="font-black text-slate-400">{total}</span> deployments
                </p>
            )}
        </div>
    );
}

function ActionBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
    return (
        <button title={title} onClick={onClick}
            className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200',
                danger
                    ? 'border-rose-400/20 bg-rose-400/[0.07] text-rose-400/70 hover:border-rose-400/50 hover:bg-rose-400/15 hover:text-rose-300'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-500 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
            )}>
            {children}
        </button>
    );
}
