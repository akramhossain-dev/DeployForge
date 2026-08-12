'use client';

import Link from 'next/link';
import { Github, PackagePlus, RefreshCw, Rocket, Search, Zap, XCircle, CheckCircle2, Clock, GitBranch, Globe, Server, BarChart3, ChevronDown, AlertTriangle, Gauge, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { formatDate } from '@/components/ui';
import { useDeployments, useDeploymentAnalytics } from '@/hooks/useDeployForgeData';

const activeStates = new Set(['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING']);
const STATUS_FILTERS = ['all', 'running', 'building', 'failed', 'stopped', 'paused', 'deleted'] as const;

function statusIndicator(status: string) {
    const s = status.toUpperCase();
    if (s === 'RUNNING') return <CheckCircle2 size={13} className="text-emerald-400" />;
    if (['BUILDING', 'PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'DEPLOYING'].includes(s)) return <Zap size={13} className="text-cyan-400" />;
    if (s === 'FAILED' || s === 'BROKEN') return <XCircle size={13} className="text-rose-400" />;
    return <Clock size={13} className="text-[#666666]" />;
}

function StatusTag({ status }: { status: string }) {
    const s = status.toUpperCase();
    let style = 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';
    if (['RUNNING', 'SUCCESS', 'ACTIVE', 'COMPLETED'].includes(s)) style = 'border-[#1F1F1F] bg-[#000000] text-emerald-400';
    else if (['FAILED', 'ERROR', 'BROKEN'].includes(s)) style = 'border-rose-900/40 bg-rose-950/20 text-rose-400';
    else if (['BUILDING', 'DEPLOYING', 'CLONING', 'PENDING'].includes(s)) style = 'border-[#1F1F1F] bg-[#000000] text-cyan-400';

    return (
        <span className={clsx('inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', style)}>
            {statusIndicator(status)}
            <span>{s}</span>
        </span>
    );
}

function getSourceType(d: { sourceType?: string; project?: { repositoryUrl?: string | null } | null }) {
    return d.sourceType || (d.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
}

function normalizeStatus(status?: string) {
    return (status || 'idle').toLowerCase();
}

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 lg:p-5 font-mono text-xs space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">{label}</p>
            <p className="text-2xl lg:text-3xl font-bold tracking-tight text-white">{value}</p>
        </div>
    );
}

export default function DeploymentsPage() {
    const deployments = useDeployments();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
    const [selectedProject, setSelectedProject] = useState('all');

    const analytics = useDeploymentAnalytics(activeTab === 'analytics');
    const analyticsList = analytics.data || [];

    const computedMetrics = useMemo(() => {
        const list = analytics.data || [];
        if (!list.length) return null;

        if (selectedProject === 'all') {
            const totalDeps = list.reduce((acc, p) => acc + p.totalDeployments, 0);
            const failedDeps = list.reduce((acc, p) => acc + p.failedDeployments, 0);
            const successRate = totalDeps > 0 ? Math.round(((totalDeps - failedDeps) / totalDeps) * 100) : 0;
            const totalRollbacks = list.reduce((acc, p) => acc + p.rollbackCount, 0);

            let buildTimeSum = 0;
            let deployTimeSum = 0;
            let validBuildProjects = 0;
            let validDeployProjects = 0;

            list.forEach(p => {
                if (p.avgBuildTime > 0) {
                    buildTimeSum += p.avgBuildTime;
                    validBuildProjects++;
                }
                if (p.avgDeployTime > 0) {
                    deployTimeSum += p.avgDeployTime;
                    validDeployProjects++;
                }
            });

            const avgBuild = validBuildProjects > 0 ? Math.round(buildTimeSum / validBuildProjects) : 0;
            const avgDeploy = validDeployProjects > 0 ? Math.round(deployTimeSum / validDeployProjects) : 0;

            const allLastDeps = list.map(p => p.lastDeployment).filter(Boolean);
            const overallLast = allLastDeps.sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime())[0] || null;

            return {
                totalDeployments: totalDeps,
                failedDeployments: failedDeps,
                successRate,
                avgBuildTime: avgBuild,
                avgDeployTime: avgDeploy,
                rollbackCount: totalRollbacks,
                lastDeployment: overallLast,
                projectName: 'All Projects',
                repositoryUrl: 'Combined stats across all synced repositories',
                branch: 'N/A'
            };
        } else {
            const p = list.find(item => item.projectId === selectedProject);
            if (!p) return null;
            return {
                totalDeployments: p.totalDeployments,
                failedDeployments: p.failedDeployments,
                successRate: p.successRate,
                avgBuildTime: p.avgBuildTime,
                avgDeployTime: p.avgDeployTime,
                rollbackCount: p.rollbackCount,
                lastDeployment: p.lastDeployment,
                projectName: p.projectName,
                repositoryUrl: p.repositoryUrl,
                branch: p.branch
            };
        }
    }, [analytics.data, selectedProject]);

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

            {/* ── 1. Page Header ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Deployments
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Monitor and manage deployments across your repositories and applications.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => deployments.refetch()}
                        disabled={deployments.isFetching}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-mono text-xs text-white hover:bg-[#1A1A1A] transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={deployments.isFetching ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                    <Link
                        href="/deployments/new"
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                    >
                        <Rocket size={13} />
                        <span>New Deployment</span>
                    </Link>
                </div>
            </div>

            {/* ── Error Banner ── */}
            {deployments.isError && (
                <div className="flex items-center justify-between rounded-md border border-rose-900/50 bg-rose-950/20 p-3 font-mono text-xs text-rose-300">
                    <span>Failed to load deployments data.</span>
                    <button
                        type="button"
                        onClick={() => deployments.refetch()}
                        className="flex items-center gap-1 text-rose-200 underline hover:text-white"
                    >
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            )}

            {/* ── 2. Mode Selector Tabs ── */}
            <div className="flex items-center gap-1 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-1 w-fit font-mono text-xs">
                <button
                    onClick={() => setActiveTab('list')}
                    className={clsx(
                        'flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors',
                        activeTab === 'list'
                            ? 'bg-[#111111] font-semibold text-white'
                            : 'text-[#A1A1A1] hover:text-white'
                    )}
                >
                    <Rocket size={13} />
                    <span>Deployment Runs</span>
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={clsx(
                        'flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors',
                        activeTab === 'analytics'
                            ? 'bg-[#111111] font-semibold text-white'
                            : 'text-[#A1A1A1] hover:text-white'
                    )}
                >
                    <BarChart3 size={13} />
                    <span>Telemetry Analytics</span>
                </button>
            </div>

            {activeTab === 'list' ? (
                <>
                    {/* ── Stat Cards Grid ── */}
                    <div className="grid grid-cols-3 gap-4 2xl:gap-6">
                        <StatCard label="Total Deployments" value={deployments.data?.length || 0} />
                        <StatCard label="Active Runs" value={activeCount} />
                        <StatCard label="Failed Runs" value={failedCount} />
                    </div>

                    {/* ── Filters & Search Toolbar ── */}
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center justify-between">
                            <div className="relative flex-1 max-w-md 2xl:max-w-xl">
                                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" size={14} />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Filter by deployment name, repo, or commit hash..."
                                    className="w-full rounded-md border border-[#1F1F1F] bg-[#000000] py-1.5 pl-9 pr-3 font-mono text-xs text-white outline-none placeholder:text-[#666666] focus:border-[#333333]"
                                />
                            </div>

                            {/* Status Filter Buttons */}
                            <div className="flex flex-wrap gap-1 font-mono text-xs">
                                {STATUS_FILTERS.map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setStatus(f)}
                                        className={clsx(
                                            'rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                                            status === f
                                                ? 'border-[#333333] bg-[#111111] text-white'
                                                : 'border-[#1F1F1F] bg-[#000000] text-[#666666] hover:text-[#A1A1A1]'
                                        )}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Deployment List Table ── */}
                    {deployments.isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                            ))}
                        </div>
                    ) : filtered.length ? (
                        <div className="overflow-x-auto rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                            <table className="w-full text-left font-mono text-xs border-collapse">
                                <thead className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                                    <tr>
                                        <th className="p-3.5 font-semibold">DEPLOYMENT / PROJECT</th>
                                        <th className="p-3.5 font-semibold">BRANCH</th>
                                        <th className="p-3.5 font-semibold">SERVER / PORT</th>
                                        <th className="p-3.5 font-semibold">COMMIT HASH & MESSAGE</th>
                                        <th className="p-3.5 font-semibold">CREATED</th>
                                        <th className="p-3.5 font-semibold text-right">STATUS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                                    {filtered.map((d) => {
                                        const sourceType = getSourceType(d);
                                        const activeUrl = d.url || (d.vps?.ipAddress && d.port ? `http://${d.vps.ipAddress}:${d.port}` : null);

                                        return (
                                            <tr
                                                key={d.id}
                                                className="hover:bg-[#111111]/60 transition-colors"
                                            >
                                                {/* Deployment Name & Repo */}
                                                <td className="p-3.5">
                                                    <Link href={`/deployments/${d.id}`} className="font-semibold text-white hover:underline flex items-center gap-1.5">
                                                        {sourceType === 'upload' ? <PackagePlus size={13} className="text-[#A1A1A1]" /> : <Github size={13} className="text-[#A1A1A1]" />}
                                                        <span>{d.name || d.project?.name || 'Untitled Deployment'}</span>
                                                    </Link>
                                                    <p className="mt-0.5 text-[10px] text-[#666666] truncate max-w-sm">
                                                        {d.project?.repositoryUrl?.replace('upload://', 'Upload: ') || 'File package release'}
                                                    </p>
                                                    {activeUrl && (
                                                        <p className="mt-0.5 font-mono text-[10px] text-[#A1A1A1] truncate max-w-md">{activeUrl}</p>
                                                    )}
                                                </td>

                                                {/* Branch */}
                                                <td className="p-3.5 whitespace-nowrap">
                                                    <div className="flex items-center gap-1 text-[#A1A1A1]">
                                                        <GitBranch size={12} className="text-[#666666]" />
                                                        <span>{d.branch || d.project?.branch || 'main'}</span>
                                                    </div>
                                                </td>

                                                {/* Server & Port */}
                                                <td className="p-3.5 whitespace-nowrap">
                                                    <div className="flex items-center gap-1 text-[#A1A1A1]">
                                                        <Server size={12} className="text-[#666666]" />
                                                        <span>{d.vps?.name || 'Local Host'}</span>
                                                    </div>
                                                    <p className="text-[10px] text-[#666666]">{d.port ? `Port :${d.port}` : 'Port —'}</p>
                                                </td>

                                                {/* Commit Hash & Message (expanded width on large monitors) */}
                                                <td className="p-3.5 max-w-md 2xl:max-w-xl truncate">
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded border border-[#1F1F1F] bg-[#000000] px-1.5 py-0.5 font-mono text-[10px] text-white shrink-0">
                                                            {d.commitHash ? d.commitHash.slice(0, 7) : 'head'}
                                                        </span>
                                                        <span className="text-xs text-white truncate">
                                                            {d.commitMessage || 'Manual deployment trigger'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Created Date */}
                                                <td className="p-3.5 text-[#666666] whitespace-nowrap">
                                                    {formatDate(d.updatedAt || d.createdAt)}
                                                </td>

                                                {/* Status Tag */}
                                                <td className="p-3.5 text-right whitespace-nowrap">
                                                    <StatusTag status={d.status} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                            <Rocket size={24} className="mx-auto mb-2 text-[#666666]" />
                            <p className="text-white font-semibold">No deployments found</p>
                            <p className="mt-1">
                                {search || status !== 'all' ? 'No deployment runs match your selected filters.' : 'Deploy a project repository or zip package to view deployment history here.'}
                            </p>
                            <Link href="/deployments/new" className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-3 font-semibold text-black hover:bg-[#E5E5E5]">
                                <Rocket size={13} />
                                <span>Create Deployment</span>
                            </Link>
                        </div>
                    )}
                </>
            ) : (
                /* ── 3. Telemetry Analytics Tab ── */
                <div className="space-y-6 font-mono text-xs">
                    {analytics.isLoading ? (
                        <div className="space-y-4">
                            <div className="h-16 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 2xl:gap-6">
                                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />)}
                            </div>
                        </div>
                    ) : analytics.isError ? (
                        <div className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                            Failed to load analytics: {(analytics.error as Error)?.message}
                        </div>
                    ) : !analyticsList.length ? (
                        <div className="rounded border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center text-[#666666]">
                            No analytics data available yet.
                        </div>
                    ) : (
                        <>
                            {/* Project Filter Toolbar */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                                <div>
                                    <h3 className="font-bold text-white uppercase tracking-wider">Project Telemetry</h3>
                                    <p className="text-[#666666] text-[11px] mt-0.5">Filter telemetry metrics by connected repository project.</p>
                                </div>
                                <select
                                    value={selectedProject}
                                    onChange={(e) => setSelectedProject(e.target.value)}
                                    className="rounded border border-[#1F1F1F] bg-[#000000] px-3 py-1.5 text-xs text-white outline-none focus:border-[#333333]"
                                >
                                    <option value="all">All Projects Combined</option>
                                    {analyticsList.map(p => (
                                        <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
                                    ))}
                                </select>
                            </div>

                            {computedMetrics && (
                                <>
                                    {/* Stat Cards Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 2xl:gap-6">
                                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 lg:p-5 space-y-1">
                                            <p className="text-[10px] text-[#666666] uppercase">Total Runs</p>
                                            <p className="text-2xl lg:text-3xl font-bold text-white">{computedMetrics.totalDeployments}</p>
                                        </div>
                                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 lg:p-5 space-y-1">
                                            <p className="text-[10px] text-[#666666] uppercase">Success Rate</p>
                                            <p className="text-2xl lg:text-3xl font-bold text-emerald-400">{computedMetrics.successRate}%</p>
                                        </div>
                                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 lg:p-5 space-y-1">
                                            <p className="text-[10px] text-[#666666] uppercase">Failed Runs</p>
                                            <p className="text-2xl lg:text-3xl font-bold text-rose-400">{computedMetrics.failedDeployments}</p>
                                        </div>
                                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 lg:p-5 space-y-1">
                                            <p className="text-[10px] text-[#666666] uppercase">Rollbacks</p>
                                            <p className="text-2xl lg:text-3xl font-bold text-amber-300">{computedMetrics.rollbackCount}</p>
                                        </div>
                                    </div>

                                    {/* Lifecycle Duration & Last Deployment */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 2xl:gap-8">
                                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                                            <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3">
                                                <Gauge size={15} className="text-white" />
                                                <h3 className="font-bold text-white uppercase tracking-wider">Lifecycle Duration</h3>
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-[#A1A1A1]">Average Build Time</span>
                                                        <span className="font-bold text-white">{computedMetrics.avgBuildTime}s</span>
                                                    </div>
                                                    <div className="h-1.5 w-full overflow-hidden rounded bg-[#000000] border border-[#1F1F1F]">
                                                        <div className="h-full bg-white transition-all" style={{ width: `${Math.min((computedMetrics.avgBuildTime / 120) * 100, 100)}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-[#A1A1A1]">Average Deploy Time</span>
                                                        <span className="font-bold text-white">{computedMetrics.avgDeployTime}s</span>
                                                    </div>
                                                    <div className="h-1.5 w-full overflow-hidden rounded bg-[#000000] border border-[#1F1F1F]">
                                                        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.min((computedMetrics.avgDeployTime / 60) * 100, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                                            <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                                                <div className="flex items-center gap-2">
                                                    <Rocket size={15} className="text-white" />
                                                    <h3 className="font-bold text-white uppercase tracking-wider">Last Deployment Run</h3>
                                                </div>
                                                {computedMetrics.lastDeployment && (
                                                    <StatusTag status={computedMetrics.lastDeployment.status} />
                                                )}
                                            </div>
                                            {computedMetrics.lastDeployment ? (
                                                <div className="space-y-3">
                                                    <div className="rounded border border-[#1F1F1F] bg-[#000000] p-3 space-y-1">
                                                        <p className="font-semibold text-white">
                                                            {computedMetrics.lastDeployment.name || 'Untitled Release'}
                                                        </p>
                                                        <p className="text-[10px] text-[#666666]">
                                                            ID: {computedMetrics.lastDeployment.id}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center justify-between text-[#A1A1A1]">
                                                        <span>Branch: {computedMetrics.lastDeployment.branch || 'main'}</span>
                                                        <span>{formatDate(computedMetrics.lastDeployment.createdAt)}</span>
                                                    </div>
                                                    <Link href={`/deployments/${computedMetrics.lastDeployment.id}`} className="block pt-2">
                                                        <button type="button" className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] text-xs font-mono text-white hover:bg-[#1A1A1A]">
                                                            <span>View Run Details</span>
                                                            <ArrowRight size={13} />
                                                        </button>
                                                    </Link>
                                                </div>
                                            ) : (
                                                <div className="py-6 text-center text-[#666666]">
                                                    No recent deployment run recorded.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

        </div>
    );
}
