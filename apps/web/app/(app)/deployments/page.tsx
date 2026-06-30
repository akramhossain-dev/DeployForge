'use client';

import Link from 'next/link';
import { Github, PackagePlus, RefreshCw, Rocket, Search, Zap, XCircle, CheckCircle2, Clock, GitBranch, Globe, Server, BarChart3, ChevronDown, Calendar, AlertTriangle, Gauge, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate, inputClassName } from '@/components/ui';
import { useDeployments, useDeploymentAnalytics } from '@/hooks/useDeployForgeData';

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

            {/* Tab Selector */}
            <div className="flex space-x-1 rounded-xl bg-white/[0.03] p-1 border border-white/[0.07] max-w-xs">
                <button
                    onClick={() => setActiveTab('list')}
                    className={clsx(
                        'flex items-center justify-center gap-1.5 w-full rounded-lg py-2 text-xs font-black uppercase tracking-wider transition-all border',
                        activeTab === 'list'
                            ? 'bg-cyan-300/10 text-cyan-200 shadow-md border-cyan-300/20'
                            : 'text-slate-400 border-transparent hover:text-slate-200'
                    )}
                >
                    <Rocket size={13} />
                    List View
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={clsx(
                        'flex items-center justify-center gap-1.5 w-full rounded-lg py-2 text-xs font-black uppercase tracking-wider transition-all border',
                        activeTab === 'analytics'
                            ? 'bg-cyan-300/10 text-cyan-200 shadow-md border-cyan-300/20'
                            : 'text-slate-400 border-transparent hover:text-slate-200'
                    )}
                >
                    <BarChart3 size={13} />
                    Analytics
                </button>
            </div>

            {activeTab === 'list' ? (
                <>
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
                </>
            ) : (
                <div className="space-y-6 animate-fadeIn">
                    {/* Project dropdown / selector */}
                    {analytics.isLoading ? (
                        <div className="space-y-6">
                            <SkeletonBlock className="h-16 w-full" />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <SkeletonBlock className="h-56" />
                                <SkeletonBlock className="h-56" />
                            </div>
                        </div>
                    ) : analytics.isError ? (
                        <ErrorState message={(analytics.error as Error)?.message} onRetry={() => analytics.refetch()} />
                    ) : !analyticsList.length ? (
                        <EmptyState title="No analytics data available" description="You have not deployed any projects yet. Start a new deployment to populate statistics." />
                    ) : (
                        <>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-5 rounded-xl border border-white/[0.07] bg-white/[0.03]">
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Project Telemetry</h3>
                                    <p className="text-xs text-slate-500">Choose a project repository to view detailed telemetry metrics.</p>
                                </div>
                                <div className="relative min-w-[240px]">
                                    <select
                                        value={selectedProject}
                                        onChange={(e) => setSelectedProject(e.target.value)}
                                        className={clsx(inputClassName, 'pr-10 appearance-none bg-neutral-900 border border-white/10 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500')}
                                    >
                                        <option value="all">All Projects Combined</option>
                                        {analyticsList.map(p => (
                                            <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                                </div>
                            </div>

                            {computedMetrics && (
                                <>
                                    {/* Stat cards grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <Panel className="relative overflow-hidden">
                                            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400/30 to-transparent" />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Runs</p>
                                            <p className="mt-3 text-3xl font-black text-white">{computedMetrics.totalDeployments}</p>
                                            <p className="text-[10px] text-slate-500 mt-1">Total deployments triggered</p>
                                        </Panel>

                                        <Panel className="relative overflow-hidden">
                                            <div className={clsx(
                                                'absolute inset-x-0 top-0 h-0.5',
                                                computedMetrics.successRate > 80 ? 'bg-gradient-to-r from-emerald-400/30 to-transparent' :
                                                computedMetrics.successRate > 50 ? 'bg-gradient-to-r from-amber-400/30 to-transparent' :
                                                'bg-gradient-to-r from-rose-400/30 to-transparent'
                                            )} />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Success Rate</p>
                                            <p className={clsx(
                                                'mt-3 text-3xl font-black',
                                                computedMetrics.successRate > 80 ? 'text-emerald-400' :
                                                computedMetrics.successRate > 50 ? 'text-amber-400' :
                                                'text-rose-400'
                                            )}>{computedMetrics.successRate}%</p>
                                            <p className="text-[10px] text-slate-500 mt-1">Percentage of non-failing runs</p>
                                        </Panel>

                                        <Panel className="relative overflow-hidden">
                                            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-500/30 to-transparent" />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Failed Runs</p>
                                            <p className="mt-3 text-3xl font-black text-rose-400">{computedMetrics.failedDeployments}</p>
                                            <p className="text-[10px] text-slate-500 mt-1">Deployments in FAILED state</p>
                                        </Panel>

                                        <Panel className="relative overflow-hidden">
                                            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-400/30 to-transparent" />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rollbacks</p>
                                            <p className="mt-3 text-3xl font-black text-amber-400">{computedMetrics.rollbackCount}</p>
                                            <p className="text-[10px] text-slate-500 mt-1">Superseded versions restored</p>
                                        </Panel>
                                    </div>

                                    {/* Details grid */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Lifecycle Duration */}
                                        <Panel className="flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/8 text-cyan-200">
                                                        <Gauge size={15} />
                                                    </div>
                                                    <h3 className="font-black text-white text-sm uppercase tracking-wider">Lifecycle Duration</h3>
                                                </div>
                                                <div className="space-y-6 mt-4">
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                                            <span className="font-bold text-slate-400">Average Build Time</span>
                                                            <span className="font-black text-cyan-300">{computedMetrics.avgBuildTime}s</span>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06] border border-white/[0.05]">
                                                            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500" style={{ width: `${Math.min((computedMetrics.avgBuildTime / 120) * 100, 100)}%` }} />
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-1">Preparation, dependency resolution, and build packaging.</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                                            <span className="font-bold text-slate-400">Average Deploy Time</span>
                                                            <span className="font-black text-emerald-300">{computedMetrics.avgDeployTime}s</span>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06] border border-white/[0.05]">
                                                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${Math.min((computedMetrics.avgDeployTime / 60) * 100, 100)}%` }} />
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-1">Host mapping, container replacement, and healthchecks.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </Panel>

                                        {/* Last Deployment */}
                                        <Panel className="flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/8 text-cyan-200">
                                                            <Rocket size={15} />
                                                        </div>
                                                        <h3 className="font-black text-white text-sm uppercase tracking-wider">Last Deployment</h3>
                                                    </div>
                                                    {computedMetrics.lastDeployment && (
                                                        <StatusBadge status={computedMetrics.lastDeployment.status} />
                                                    )}
                                                </div>
                                                {computedMetrics.lastDeployment ? (
                                                    <div className="space-y-4 mt-4">
                                                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                                                            <p className="text-xs font-bold text-slate-300 truncate">
                                                                {computedMetrics.lastDeployment.name || "Untitled Release"}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 mt-1 font-mono">
                                                                ID: {computedMetrics.lastDeployment.id}
                                                            </p>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                <GitBranch size={13} className="text-slate-500" />
                                                                <span className="truncate font-medium">{computedMetrics.lastDeployment.branch || 'main'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                <Clock size={13} className="text-slate-500" />
                                                                <span>{formatDate(computedMetrics.lastDeployment.createdAt)}</span>
                                                            </div>
                                                        </div>
                                                        {computedMetrics.lastDeployment.commitHash && (
                                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                <Github size={13} className="text-slate-500" />
                                                                <span className="font-mono text-[10px] bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.07] text-slate-300">
                                                                    {computedMetrics.lastDeployment.commitHash.slice(0, 7)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex h-36 flex-col items-center justify-center text-slate-500 text-xs">
                                                        <AlertTriangle size={20} className="mb-2 text-slate-600" />
                                                        No recent deployments found.
                                                    </div>
                                                )}
                                            </div>
                                            {computedMetrics.lastDeployment && (
                                                <Link href={`/deployments/${computedMetrics.lastDeployment.id}`} className="mt-4 block">
                                                    <Button variant="secondary" className="w-full justify-center text-xs">
                                                        View Run Details <ArrowRight size={12} className="ml-1.5" />
                                                    </Button>
                                                </Link>
                                            )}
                                        </Panel>
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
