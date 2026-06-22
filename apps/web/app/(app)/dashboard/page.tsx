'use client';

import Link from 'next/link';
import { Activity, ArrowRight, GitBranch, Github, Plus, Rocket, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SectionHeading, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import { useDeployments, useGitHubProfile, useRepositories, useVpsList } from '@/hooks/useDeployForgeData';

function StatCard({ title, value, icon, detail }: { title: string; value: string | number; icon: ReactNode; detail: string }) {
    return (
        <Panel>
            <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">{icon}</div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black text-slate-400">{detail}</span>
            </div>
            <p className="mt-5 text-sm font-bold text-slate-400">{title}</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-white">{value}</p>
        </Panel>
    );
}

const EMPTY_ARRAY: any[] = [];

export default function DashboardPage() {
    const deployments = useDeployments();
    const vps = useVpsList();
    const github = useGitHubProfile();
    const repos = useRepositories(!!github.data);

    const deploymentList = deployments.data || EMPTY_ARRAY;
    const vpsList = vps.data || EMPTY_ARRAY;
    const repoList = repos.data || EMPTY_ARRAY;
    const running = deploymentList.filter((deployment) => deployment.status === 'RUNNING').length;
    const failed = deploymentList.filter((deployment) => deployment.status === 'FAILED').length;
    const successRate = deploymentList.length ? Math.round(((deploymentList.length - failed) / deploymentList.length) * 100) : 0;
    const activeServers = vpsList.filter((item) => item.status.toLowerCase() === 'active').length;

    const recentActivity = useMemo(() => {
        return [
            ...deploymentList.map((deployment) => ({
                id: `deployment-${deployment.id}`,
                title: deployment.name || deployment.project?.name || 'Untitled deployment',
                detail: deployment.status,
                time: deployment.updatedAt,
                href: '/deployments',
            })),
            ...vpsList.map((server) => ({
                id: `vps-${server.id}`,
                title: server.name,
                detail: server.status,
                time: server.lastCheckedAt || server.updatedAt,
                href: '/vps',
            })),
            ...repoList.map((repo) => ({
                id: `repo-${repo.id}`,
                title: repo.fullName,
                detail: repo.webhookId ? 'Webhook ready' : 'Synced',
                time: repo.updatedAt,
                href: '/repositories',
            })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 7);
    }, [deploymentList, repoList, vpsList]);

    const isLoading = deployments.isLoading || vps.isLoading || github.isLoading;
    const isError = deployments.isError || vps.isError;

    return (
        <div className="space-y-8">
            <PageHeader
                title="System Overview"
                description="Live deployment health, repository sync, server readiness, and recent operations in one Aurora-aligned workspace."
                action={
                    <Link
                        href="/deployments"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition-all hover:scale-[1.01] hover:bg-cyan-50"
                    >
                        <Plus size={16} /> New Deployment
                    </Link>
                }
            />

            {isError ? (
                <ErrorState
                    message={(deployments.error as Error)?.message || (vps.error as Error)?.message}
                    onRetry={() => {
                        deployments.refetch();
                        vps.refetch();
                    }}
                />
            ) : null}

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-36" />)
                ) : (
                    <>
                        <StatCard title="Total Deployments" value={deploymentList.length} icon={<Rocket size={22} />} detail={`${running} running`} />
                        <StatCard title="Active Servers" value={activeServers} icon={<Server size={22} />} detail={`${vpsList.length} total`} />
                        <StatCard title="Build Success" value={`${successRate}%`} icon={<Activity size={22} />} detail={failed ? `${failed} failed` : 'Stable'} />
                        <StatCard title="GitHub Repos" value={repoList.length} icon={<Github size={22} />} detail={github.data ? 'Connected' : 'Disconnected'} />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel className="xl:col-span-2">
                    <SectionHeading icon={<Rocket size={18} />} title="Deployment Status" description="Recent deployments with their latest backend status." />
                    {deployments.isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-16" />)}
                        </div>
                    ) : deploymentList.length ? (
                        <div className="divide-y divide-white/10">
                            {deploymentList.slice(0, 6).map((deployment) => (
                                <Link key={deployment.id} href="/deployments" className="flex flex-col gap-3 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0 px-1">
                                        <p className="truncate font-black text-slate-100">{deployment.name || deployment.project?.name || 'Untitled deployment'}</p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {deployment.project?.repositoryUrl || 'No repository'} {deployment.port ? `- Port ${deployment.port}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 px-1">
                                        <span className="text-xs text-slate-500">{formatDate(deployment.updatedAt)}</span>
                                        <StatusBadge status={deployment.status} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No deployments yet" description="Connect GitHub and add a VPS to start deploying from your repositories." />
                    )}
                </Panel>

                <Panel>
                    <SectionHeading icon={<Server size={18} />} title="VPS Status" description="Server readiness and current resource snapshots." />
                    {vps.isLoading ? (
                        <div className="space-y-3">
                            <SkeletonBlock className="h-20" />
                            <SkeletonBlock className="h-20" />
                        </div>
                    ) : vpsList.length ? (
                        <div className="space-y-5">
                            {vpsList.slice(0, 4).map((server) => {
                                const health = server.healthRecords?.[0];
                                const cpu = Math.round(health?.cpuUsage || 0);
                                const ram = Math.round(health?.memoryUsage || 0);
                                return (
                                    <Link key={server.id} href="/vps" className="block rounded-lg border border-white/10 bg-slate-950/35 p-4 transition-colors hover:border-cyan-300/30">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="truncate text-sm font-black text-slate-100">{server.name}</p>
                                            <StatusBadge status={server.status} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-400">
                                            <span>CPU {cpu}%</span>
                                            <span>RAM {ram}%</span>
                                        </div>
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                                            <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${Math.min(cpu, 100)}%` }} />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No VPS connected" description="Add a server to unlock health metrics and terminal access." />
                    )}
                </Panel>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel>
                    <SectionHeading icon={<Github size={18} />} title="GitHub Repositories" description="Synced repositories ready for deployment selection." />
                    {github.isLoading || repos.isLoading ? (
                        <div className="space-y-3">
                            <SkeletonBlock className="h-16" />
                            <SkeletonBlock className="h-16" />
                            <SkeletonBlock className="h-16" />
                        </div>
                    ) : github.data && repoList.length ? (
                        <div className="space-y-3">
                            {repoList.slice(0, 4).map((repo) => (
                                <Link key={repo.id} href="/repositories" className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/35 p-3 transition-colors hover:border-cyan-300/30">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-white">{repo.fullName}</p>
                                        <p className="mt-1 text-xs text-slate-500">Updated {formatDate(repo.updatedAt)}</p>
                                    </div>
                                    <GitBranch size={16} className="shrink-0 text-cyan-300" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title={github.data ? 'No repositories synced' : 'GitHub disconnected'} description={github.data ? 'Sync repositories to populate this panel.' : 'Connect GitHub to deploy from repositories.'} />
                    )}
                </Panel>

                <Panel>
                    <SectionHeading icon={<Activity size={18} />} title="Monitoring Snapshot" description="Resource pressure from the latest VPS health checks." />
                    {vps.isLoading ? (
                        <SkeletonBlock className="h-56" />
                    ) : vpsList.length ? (
                        <div className="space-y-4">
                            {vpsList.slice(0, 5).map((server) => {
                                const health = server.healthRecords?.[0];
                                const pressure = Math.max(health?.cpuUsage || 0, health?.memoryUsage || 0, health?.diskUsage || 0);
                                return (
                                    <div key={server.id}>
                                        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                                            <span className="truncate font-black text-slate-200">{server.name}</span>
                                            <span className="text-slate-400">{Math.round(pressure)}%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                                            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.min(pressure, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No monitoring data" description="Connect a VPS to collect resource pressure metrics." />
                    )}
                </Panel>

                <Panel>
                    <SectionHeading icon={<ArrowRight size={18} />} title="Recent Activity" description="Latest deployments, server checks, and repository syncs." />
                    {isLoading || repos.isLoading ? (
                        <div className="space-y-3">
                            <SkeletonBlock className="h-14" />
                            <SkeletonBlock className="h-14" />
                            <SkeletonBlock className="h-14" />
                        </div>
                    ) : recentActivity.length ? (
                        <div className="space-y-3">
                            {recentActivity.map((item) => (
                                <Link key={item.id} href={item.href} className="block rounded-lg border border-white/10 bg-slate-950/35 p-3 transition-colors hover:border-cyan-300/30">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="min-w-0 truncate text-sm font-black text-white">{item.title}</p>
                                        <span className="shrink-0 text-xs text-slate-500">{formatDate(item.time)}</span>
                                    </div>
                                    <p className="mt-1 text-xs font-bold uppercase text-cyan-300">{item.detail}</p>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No activity yet" description="Deployments, VPS checks, and repository events will appear here." />
                    )}
                </Panel>
            </div>
        </div>
    );
}
