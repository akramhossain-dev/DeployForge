'use client';

import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, Github, GitBranch, Plus, Rocket, Server, XCircle, Zap, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import clsx from 'clsx';
import { formatDate } from '@/components/ui';
import { useDeployments, useGitHubProfile, useRepositories, useVpsList } from '@/hooks/useDeployForgeData';

const EMPTY: any[] = [];

function StatCard({ title, value, icon, detail }: {
    title: string; value: string | number; icon: React.ReactNode; detail: string;
}) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 lg:p-5 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between text-[#666666]">
                <span className="uppercase tracking-wider text-[10px] font-semibold">{title}</span>
                <div className="text-white">{icon}</div>
            </div>
            <p className="text-2xl lg:text-3xl font-bold tracking-tight text-white">{value}</p>
            <p className="text-[11px] text-[#A1A1A1]">{detail}</p>
        </div>
    );
}

function MiniProgressBar({ pct, color }: { pct: number; color?: string }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded bg-[#111111]">
            <div className={clsx('h-full transition-all', color || 'bg-white')} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
    );
}

function StatusTag({ status }: { status: string }) {
    const s = status.toUpperCase();
    let style = 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';
    if (['RUNNING', 'SUCCESS', 'ACTIVE', 'COMPLETED'].includes(s)) style = 'border-[#1F1F1F] bg-[#000000] text-emerald-400';
    else if (['FAILED', 'ERROR', 'CRITICAL'].includes(s)) style = 'border-rose-900/40 bg-rose-950/20 text-rose-400';
    else if (['BUILDING', 'DEPLOYING', 'CLONING', 'PENDING'].includes(s)) style = 'border-[#1F1F1F] bg-[#000000] text-cyan-400';

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', style)}>
            {s}
        </span>
    );
}

export default function DashboardPage() {
    const deployments = useDeployments();
    const vps = useVpsList();
    const github = useGitHubProfile();
    const repos = useRepositories(!!github.data);

    const deploymentList = deployments.data || EMPTY;
    const vpsList = vps.data || EMPTY;
    const repoList = repos.data || EMPTY;
    const running = deploymentList.filter(d => d.status === 'RUNNING').length;
    const failed  = deploymentList.filter(d => d.status === 'FAILED').length;
    const successRate = deploymentList.length ? Math.round(((deploymentList.length - failed) / deploymentList.length) * 100) : 0;
    const activeServers = vpsList.filter(v => v.status.toLowerCase() === 'active').length;

    const recentActivity = useMemo(() => [
        ...deploymentList.map(d => ({ id: `d-${d.id}`, title: d.name || d.project?.name || 'Untitled', detail: d.status, time: d.updatedAt, href: `/deployments/${d.id}`, type: 'deployment' as const })),
        ...vpsList.map(s => ({ id: `v-${s.id}`, title: s.name, detail: s.status, time: s.lastCheckedAt || s.updatedAt, href: '/vps', type: 'vps' as const })),
        ...repoList.map(r => ({ id: `r-${r.id}`, title: r.fullName, detail: r.webhookId ? 'Webhook ready' : 'Synced', time: r.updatedAt, href: '/repositories', type: 'repo' as const })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10), [deploymentList, repoList, vpsList]);

    const isLoading = deployments.isLoading || vps.isLoading || github.isLoading;
    const isError   = deployments.isError || vps.isError;

    return (
        <div className="space-y-6">

            {/* ── 1. Header Section ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Overview
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Live deployment health, server metrics, repository sync, and operational events.
                    </p>
                </div>
                <Link
                    href="/deployments/new"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                >
                    <Plus size={14} />
                    <span>New Deployment</span>
                </Link>
            </div>

            {/* ── Error Banner ── */}
            {isError && (
                <div className="flex items-center justify-between rounded-md border border-rose-900/50 bg-rose-950/20 p-3 font-mono text-xs text-rose-300">
                    <span>Unable to fetch real-time dashboard data.</span>
                    <button
                        type="button"
                        onClick={() => { deployments.refetch(); vps.refetch(); }}
                        className="flex items-center gap-1 text-rose-200 underline hover:text-white"
                    >
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            )}

            {/* ── 2. Stat Cards Grid ── */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:gap-6">
                {isLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                )) : (
                    <>
                        <StatCard title="Total Deployments" value={deploymentList.length} icon={<Rocket size={16} />} detail={`${running} running`} />
                        <StatCard title="Active Servers"    value={activeServers}          icon={<Server size={16} />}  detail={`${vpsList.length} total nodes`} />
                        <StatCard title="Build Success"     value={`${successRate}%`}      icon={<Activity size={16} />} detail={failed ? `${failed} failed builds` : 'All builds passing'} />
                        <StatCard title="GitHub Repos"      value={repoList.length}        icon={<Github size={16} />}  detail={github.data ? 'Connected' : 'Disconnected'} />
                    </>
                )}
            </div>

            {/* ── 3. Deployments & Server Status Grid ── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 2xl:grid-cols-12 2xl:gap-8">

                {/* Left Column: Recent Deployments (2 cols / 8 cols on 2xl) */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 lg:p-6 xl:col-span-2 2xl:col-span-8 space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                        <div className="flex items-center gap-2">
                            <Rocket size={15} className="text-white" />
                            <h2 className="text-sm font-semibold text-white">Recent Deployments</h2>
                        </div>
                        <Link href="/deployments" className="flex items-center gap-1 font-mono text-xs text-[#A1A1A1] hover:text-white transition-colors">
                            <span>View all</span>
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    {deployments.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-[#000000] border border-[#1F1F1F]" />)}</div>
                    ) : deploymentList.length ? (
                        <div className="overflow-x-auto rounded border border-[#1F1F1F] bg-[#000000]">
                            <table className="w-full text-left font-mono text-xs">
                                <thead className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                                    <tr>
                                        <th className="px-3.5 py-2.5 font-semibold">NAME / REPOSITORY</th>
                                        <th className="px-3.5 py-2.5 font-semibold">PORT</th>
                                        <th className="px-3.5 py-2.5 font-semibold">UPDATED</th>
                                        <th className="px-3.5 py-2.5 font-semibold text-right">STATUS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                                    {deploymentList.slice(0, 8).map(d => (
                                        <tr key={d.id} className="hover:bg-[#111111]/50 transition-colors">
                                            <td className="px-3.5 py-3">
                                                <Link href={`/deployments/${d.id}`} className="font-semibold text-white hover:underline">
                                                    {d.name || d.project?.name || 'Untitled'}
                                                </Link>
                                                <p className="text-[10px] text-[#666666] truncate max-w-sm">
                                                    {d.project?.repositoryUrl?.replace('upload://', '') || 'Direct Upload'}
                                                </p>
                                            </td>
                                            <td className="px-3.5 py-3 text-[#A1A1A1]">{d.port ? `:${d.port}` : '—'}</td>
                                            <td className="px-3.5 py-3 text-[#666666]">{formatDate(d.updatedAt)}</td>
                                            <td className="px-3.5 py-3 text-right">
                                                <StatusTag status={d.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="rounded border border-dashed border-[#1F1F1F] bg-[#000000] py-8 text-center font-mono text-xs text-[#666666]">
                            <p className="text-white font-semibold">No deployments yet</p>
                            <p className="mt-1 text-[#666666]">Connect a GitHub repository or add a VPS server to start deploying.</p>
                            <Link href="/deployments/new" className="mt-3 inline-flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                                Create Deployment
                            </Link>
                        </div>
                    )}
                </div>

                {/* Right Column: Server Status VPS Nodes (1 col / 4 cols on 2xl) */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 lg:p-6 2xl:col-span-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                        <div className="flex items-center gap-2">
                            <Server size={15} className="text-white" />
                            <h2 className="text-sm font-semibold text-white">Server Nodes</h2>
                        </div>
                        <Link href="/vps" className="flex items-center gap-1 font-mono text-xs text-[#A1A1A1] hover:text-white transition-colors">
                            <span>Manage</span>
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    {vps.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded bg-[#000000] border border-[#1F1F1F]" />)}</div>
                    ) : vpsList.length ? (
                        <div className="space-y-2.5 font-mono text-xs">
                            {vpsList.slice(0, 5).map(server => {
                                const health = server.healthRecords?.[0];
                                const cpu  = Math.round(health?.cpuUsage    || 0);
                                const ram  = Math.round(health?.memoryUsage || 0);
                                const disk = Math.round(health?.diskUsage   || 0);
                                return (
                                    <Link key={server.id} href="/vps"
                                        className="block rounded border border-[#1F1F1F] bg-[#000000] p-3 transition-colors hover:border-[#333333] hover:bg-[#111111]/40">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="font-semibold text-white truncate max-w-[140px]">{server.name}</span>
                                            <StatusTag status={server.status} />
                                        </div>
                                        <div className="space-y-1.5 text-[10px] text-[#666666]">
                                            <div className="flex justify-between">
                                                <span>CPU {cpu}%</span><span>RAM {ram}%</span><span>DISK {disk}%</span>
                                            </div>
                                            <MiniProgressBar pct={cpu} color={cpu > 80 ? 'bg-rose-400' : 'bg-white'} />
                                            <MiniProgressBar pct={ram} color={ram > 80 ? 'bg-rose-400' : 'bg-emerald-400'} />
                                            <MiniProgressBar pct={disk} color={disk > 80 ? 'bg-rose-400' : 'bg-[#666666]'} />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded border border-dashed border-[#1F1F1F] bg-[#000000] py-6 text-center font-mono text-xs text-[#666666]">
                            <p className="text-white font-semibold">No VPS connected</p>
                            <p className="mt-1">Add a VPS node to view server health.</p>
                            <Link href="/vps" className="mt-3 inline-flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                                Add Server Node
                            </Link>
                        </div>
                    )}
                </div>

            </div>

            {/* ── 4. Repositories & Recent Activity Stream ── */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 2xl:gap-8">

                {/* Left Column: Repositories */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 lg:p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                        <div className="flex items-center gap-2">
                            <Github size={15} className="text-white" />
                            <h2 className="text-sm font-semibold text-white">GitHub Repositories</h2>
                        </div>
                        <Link href="/repositories" className="flex items-center gap-1 font-mono text-xs text-[#A1A1A1] hover:text-white transition-colors">
                            <span>Sync</span>
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    {github.isLoading || repos.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-[#000000] border border-[#1F1F1F]" />)}</div>
                    ) : github.data && repoList.length ? (
                        <div className="space-y-2 font-mono text-xs">
                            {repoList.slice(0, 6).map(repo => (
                                <Link key={repo.id} href="/repositories"
                                    className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-3 transition-colors hover:bg-[#111111]/40">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Github size={13} className="shrink-0 text-[#666666]" />
                                        <span className="truncate text-white font-semibold">{repo.fullName}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3 text-[10px] text-[#A1A1A1]">
                                        {repo.webhookId ? (
                                            <span className="flex items-center gap-1 text-emerald-400">
                                                <CheckCircle2 size={11} /> Hook Ready
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[#666666]">
                                                <XCircle size={11} /> No Hook
                                            </span>
                                        )}
                                        <GitBranch size={11} className="text-[#666666]" />
                                        <span>{repo.defaultBranch}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded border border-dashed border-[#1F1F1F] bg-[#0A0A0A] py-6 text-center font-mono text-xs text-[#666666]">
                            <p className="text-white font-semibold">{github.data ? 'No repositories synced' : 'GitHub disconnected'}</p>
                            <p className="mt-1">{github.data ? 'Sync repos to start deploying.' : 'Authorize GitHub to connect code repositories.'}</p>
                        </div>
                    )}
                </div>

                {/* Right Column: Recent Activity Feed */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 lg:p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3">
                        <Zap size={15} className="text-white" />
                        <h2 className="text-sm font-semibold text-white">Recent Operations</h2>
                    </div>

                    {isLoading || repos.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-[#000000] border border-[#1F1F1F]" />)}</div>
                    ) : recentActivity.length ? (
                        <div className="space-y-2 font-mono text-xs">
                            {recentActivity.map(item => (
                                <Link key={item.id} href={item.href}
                                    className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-3 transition-colors hover:bg-[#111111]/40">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white">
                                            {item.type === 'deployment' ? <Rocket size={11} /> : item.type === 'vps' ? <Server size={11} /> : <Github size={11} />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-white">{item.title}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <StatusTag status={item.detail} />
                                        <span className="text-[10px] text-[#666666]">{formatDate(item.time)}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded border border-dashed border-[#1F1F1F] bg-[#0A0A0A] py-6 text-center font-mono text-xs text-[#666666]">
                            <p className="text-white font-semibold">No recent activity</p>
                            <p className="mt-1">Deployment and server health events will appear here.</p>
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
}
