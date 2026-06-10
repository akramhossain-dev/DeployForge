'use client';

import { Activity, Github, Plus, Rocket, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader, Button, EmptyState, ErrorState, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import { useDeployments, useGitHubProfile, useRepositories, useVpsList } from '@/hooks/useDeployForgeData';

function StatCard({ title, value, icon, detail }: { title: string; value: string | number; icon: ReactNode; detail: string }) {
    return (
        <Panel>
            <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-800 text-cyan-300">{icon}</div>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-400">{detail}</span>
            </div>
            <p className="mt-5 text-sm font-medium text-slate-400">{title}</p>
            <p className="mt-1 text-3xl font-black text-white">{value}</p>
        </Panel>
    );
}

export default function DashboardPage() {
    const deployments = useDeployments();
    const vps = useVpsList();
    const github = useGitHubProfile();
    const repos = useRepositories(!!github.data);

    const deploymentList = deployments.data || [];
    const vpsList = vps.data || [];
    const running = deploymentList.filter((deployment) => deployment.status === 'RUNNING').length;
    const failed = deploymentList.filter((deployment) => deployment.status === 'FAILED').length;
    const successRate = deploymentList.length ? Math.round(((deploymentList.length - failed) / deploymentList.length) * 100) : 0;

    const isLoading = deployments.isLoading || vps.isLoading || github.isLoading;
    const isError = deployments.isError || vps.isError;

    return (
        <div className="space-y-8">
            <PageHeader
                title="System Overview"
                description="A synced view of deployments, GitHub connection state, and VPS health."
                action={<Button><Plus size={18} /> New Deployment</Button>}
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-36" />)
                ) : (
                    <>
                        <StatCard title="Total Deployments" value={deploymentList.length} icon={<Rocket size={22} />} detail={`${running} running`} />
                        <StatCard title="Active Servers" value={vpsList.filter((item) => item.status.toLowerCase() === 'active').length} icon={<Server size={22} />} detail={`${vpsList.length} total`} />
                        <StatCard title="Build Success" value={`${successRate}%`} icon={<Activity size={22} />} detail={failed ? `${failed} failed` : 'Stable'} />
                        <StatCard title="GitHub Repos" value={repos.data?.length || 0} icon={<Github size={22} />} detail={github.data ? 'Connected' : 'Disconnected'} />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel className="xl:col-span-2">
                    <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white">Recent Deployments</h3>
                    </div>
                    {deployments.isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-16" />)}
                        </div>
                    ) : deploymentList.length ? (
                        <div className="divide-y divide-slate-800">
                            {deploymentList.slice(0, 6).map((deployment) => (
                                <div key={deployment.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-100">{deployment.name || deployment.project?.name || 'Untitled deployment'}</p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {deployment.project?.repositoryUrl || 'No repository'} {deployment.port ? `- Port ${deployment.port}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500">{formatDate(deployment.updatedAt)}</span>
                                        <StatusBadge status={deployment.status} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No deployments yet" description="Connect GitHub and add a VPS to start deploying from your repositories." />
                    )}
                </Panel>

                <Panel>
                    <h3 className="mb-5 text-lg font-bold text-white">VPS Health</h3>
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
                                    <div key={server.id}>
                                        <div className="mb-2 flex items-center justify-between">
                                            <p className="truncate text-sm font-bold text-slate-200">{server.name}</p>
                                            <StatusBadge status={server.status} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                                            <span>CPU {cpu}%</span>
                                            <span>RAM {ram}%</span>
                                        </div>
                                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                                            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(cpu, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No VPS connected" description="Add a server to unlock health metrics and terminal access." />
                    )}
                </Panel>
            </div>
        </div>
    );
}
