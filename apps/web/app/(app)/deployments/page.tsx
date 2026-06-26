'use client';

import Link from 'next/link';
import { Github, PackagePlus, RefreshCw, Rocket, Search, Zap, XCircle, CheckCircle2, Clock, GitBranch, Globe, Server } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate, inputClassName } from '@/components/ui';
import { useDeployments } from '@/hooks/useDeployForgeData';

const activeStates = new Set(['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING']);
const STATUS_FILTERS = ['all', 'running', 'building', 'failed', 'stopped', 'paused', 'deleted'] as const;

function statusIcon(status: string) {
    const s = status.toUpperCase();
    if (s === 'RUNNING') return <CheckCircle2 size={14} className="text-emerald-300" />;
    if (['BUILDING', 'PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'DEPLOYING'].includes(s)) return <Zap size={14} className="text-cyan-300" />;
    if (s === 'FAILED' || s === 'BROKEN') return <XCircle size={14} className="text-rose-300" />;
    return <Clock size={14} className="text-slate-500" />;
}

function getSourceType(d: { sourceType?: string; project?: { repositoryUrl?: string | null } | null }) {
    return d.sourceType || (d.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
}

function normalizeStatus(status?: string) {
    return (status || 'idle').toLowerCase();
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
    return (
        <Panel className="relative overflow-hidden">
            <div className={clsx('absolute inset-x-0 top-0 h-0.5', accent || 'bg-gradient-to-r from-cyan-300/30 to-transparent')} />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-3 text-4xl font-black text-white">{value}</p>
        </Panel>
    );
}

export default function DeploymentsPage() {
    const deployments = useDeployments();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return (deployments.data || []).filter((d) => {
            const haystack = [d.name, d.project?.name, d.project?.repositoryUrl, d.commitHash, d.status].filter(Boolean).join(' ').toLowerCase();
            const matchesSearch = !query || haystack.includes(query);
            const matchesStatus = status === 'all' || normalizeStatus(d.status).startsWith(status);
            return matchesSearch && matchesStatus;
        });
    }, [deployments.data, search, status]);

    const activeCount = deployments.data?.filter((d) => activeStates.has(d.status)).length || 0;
    const failedCount = deployments.data?.filter((d) => d.status === 'FAILED' || d.status === 'BROKEN').length || 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Deployments"
                description="Create, monitor, and recover GitHub or upload-based releases from one surface."
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => deployments.refetch()} loading={deployments.isFetching}><RefreshCw size={15} /> Refresh</Button>
                        <Link href="/deployments/new"><Button><Rocket size={15} /> New Deployment</Button></Link>
                    </div>
                }
            />

            {deployments.isError ? <ErrorState message={(deployments.error as Error)?.message} onRetry={() => deployments.refetch()} /> : null}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                <StatCard label="Total" value={deployments.data?.length || 0} />
                <StatCard label="Active" value={activeCount} accent="bg-gradient-to-r from-cyan-300/40 to-transparent" />
                <StatCard label="Failed" value={failedCount} accent={failedCount > 0 ? 'bg-gradient-to-r from-rose-400/40 to-transparent' : undefined} />
            </div>

            {/* Filters */}
            <Panel className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name, repo, commit…"
                            className={`${inputClassName} pl-10`}
                        />
                    </label>
                    {/* Status pill filters */}
                    <div className="flex flex-wrap gap-1.5">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f}
                                onClick={() => setStatus(f)}
                                className={clsx(
                                    'rounded-full px-3 py-1.5 text-[11px] font-black uppercase ring-1 transition-all',
                                    status === f
                                        ? 'bg-cyan-300/15 text-cyan-200 ring-cyan-300/30'
                                        : 'bg-white/[0.04] text-slate-500 ring-white/10 hover:text-slate-300 hover:ring-white/20'
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </Panel>

            {/* Cards grid */}
            {deployments.isLoading ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-44" />)}
                </div>
            ) : filtered.length ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filtered.map((d) => {
                        const sourceType = getSourceType(d);
                        const activeUrl = d.url || (d.vps?.ipAddress && d.port ? `http://${d.vps.ipAddress}:${d.port}` : null);

                        return (
                            <Link key={d.id} href={`/deployments/${d.id}`} className="group block">
                                <Panel className="h-full transition-all duration-200 group-hover:border-cyan-300/30 group-hover:bg-cyan-300/[0.05] group-hover:shadow-cyan-950/40">
                                    {/* Top stripe */}
                                    <div className={clsx('absolute inset-x-0 top-0 h-0.5 rounded-t-lg transition-opacity duration-200 group-hover:opacity-100',
                                        d.status === 'RUNNING' ? 'bg-gradient-to-r from-emerald-400/50 to-transparent opacity-40' :
                                            d.status === 'FAILED' ? 'bg-gradient-to-r from-rose-400/50 to-transparent opacity-40' :
                                                activeStates.has(d.status) ? 'bg-gradient-to-r from-cyan-300/50 to-transparent opacity-40' :
                                                    'bg-gradient-to-r from-slate-500/30 to-transparent opacity-0'
                                    )} />

                                    <div className="relative flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                                                {sourceType === 'upload' ? <PackagePlus size={16} className="text-violet-300" /> : <Github size={16} className="text-slate-300" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-black text-white">{d.name || d.project?.name || 'Untitled Deployment'}</p>
                                                <p className="mt-0.5 truncate text-xs text-slate-500">{d.project?.repositoryUrl?.replace('upload://', 'Upload: ') || 'Upload deployment'}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {statusIcon(d.status)}
                                            <StatusBadge status={d.status} />
                                        </div>
                                    </div>

                                    {/* Meta chips */}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {[
                                            { icon: <GitBranch size={11} />, label: d.branch || d.project?.branch || 'main' },
                                            { icon: <Server size={11} />, label: d.vps?.name || 'No VPS' },
                                            { icon: <Globe size={11} />, label: d.port ? `Port ${d.port}` : 'Port pending' },
                                        ].map(({ icon, label }) => (
                                            <span key={label} className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-slate-400">
                                                <span className="text-slate-500">{icon}</span>{label}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Commit + URL row */}
                                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
                                        <p className="truncate text-[11px] text-slate-500">
                                            {d.commitMessage || d.commitHash?.slice(0, 12) || 'No commit metadata'}
                                        </p>
                                        <p className="shrink-0 text-[11px] text-slate-600">{formatDate(d.updatedAt || d.createdAt)}</p>
                                    </div>
                                    {activeUrl && (
                                        <p className="mt-1.5 truncate font-mono text-[11px] text-cyan-400/70">{activeUrl}</p>
                                    )}
                                </Panel>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    title="No deployments found"
                    description={search || status !== 'all' ? 'No deployments match your current filters.' : 'Deployments will appear here after you trigger a GitHub or file upload release.'}
                    action={<Link href="/deployments/new"><Button><Rocket size={15} /> Create Deployment</Button></Link>}
                />
            )}
        </div>
    );
}
