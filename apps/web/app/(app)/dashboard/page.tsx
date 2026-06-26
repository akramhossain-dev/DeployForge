'use client';

import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, Github, GitBranch, Plus, Rocket, Server, XCircle, Zap } from 'lucide-react';
import { useMemo } from 'react';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import { useDeployments, useGitHubProfile, useRepositories, useVpsList } from '@/hooks/useDeployForgeData';

const EMPTY: any[] = [];

function StatCard({ title, value, icon, detail, accent }: {
    title: string; value: string | number; icon: React.ReactNode; detail: string; accent?: string;
}) {
    return (
        <Panel className="relative overflow-hidden">
            <div className={clsx('absolute inset-x-0 top-0 h-0.5', accent || 'bg-gradient-to-r from-cyan-300/25 to-transparent')} />
            <div className="flex items-center justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/8 text-cyan-200">{icon}</div>
                <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{detail}</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">{title}</p>
            <p className="mt-1.5 text-4xl font-black tracking-tight text-white">{value}</p>
        </Panel>
    );
}

function MiniProgressBar({ pct, color }: { pct: number; color: string }) {
    return (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
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
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8), [deploymentList, repoList, vpsList]);

    const isLoading = deployments.isLoading || vps.isLoading || github.isLoading;
    const isError   = deployments.isError || vps.isError;

    return (
        <div className="space-y-6">
            <PageHeader
                title="System Overview"
                description="Live deployment health, repository sync, server readiness, and recent operations."
                action={<Link href="/deployments/new"><Button><Plus size={15} /> New Deployment</Button></Link>}
            />

            {isError ? <ErrorState message={(deployments.error as Error)?.message || (vps.error as Error)?.message} onRetry={() => { deployments.refetch(); vps.refetch(); }} /> : null}

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-36" />) : (
                    <>
                        <StatCard title="Total Deployments" value={deploymentList.length} icon={<Rocket size={20} />} detail={`${running} running`} />
                        <StatCard title="Active Servers"    value={activeServers}          icon={<Server size={20} />}  detail={`${vpsList.length} total`} />
                        <StatCard title="Build Success"     value={`${successRate}%`}      icon={<Activity size={20} />} detail={failed ? `${failed} failed` : 'Stable'} accent={failed > 0 ? 'bg-gradient-to-r from-rose-400/30 to-transparent' : 'bg-gradient-to-r from-emerald-400/30 to-transparent'} />
                        <StatCard title="GitHub Repos"      value={repoList.length}        icon={<Github size={20} />}  detail={github.data ? 'Connected' : 'Disconnected'} accent={github.data ? 'bg-gradient-to-r from-violet-400/25 to-transparent' : undefined} />
                    </>
                )}
            </div>

            {/* Deployments + VPS */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Deployment list */}
                <Panel className="xl:col-span-2">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/8 text-cyan-200"><Rocket size={15} /></div>
                            <h2 className="font-black text-white">Recent Deployments</h2>
                        </div>
                        <Link href="/deployments" className="flex items-center gap-1 text-xs font-bold text-slate-500 transition-colors hover:text-cyan-300">View all <ArrowRight size={12} /></Link>
                    </div>
                    {deployments.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-14" />)}</div>
                    ) : deploymentList.length ? (
                        <div className="divide-y divide-white/[0.05]">
                            {deploymentList.slice(0, 7).map(d => (
                                <Link key={d.id} href={`/deployments/${d.id}`}
                                    className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-white/[0.02] px-1 rounded-lg -mx-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={clsx('h-2 w-2 shrink-0 rounded-full',
                                            d.status === 'RUNNING' ? 'bg-emerald-400 shadow-lg shadow-emerald-500/40' :
                                            d.status === 'FAILED'  ? 'bg-rose-400'  :
                                            ['BUILDING','DEPLOYING','CLONING'].includes(d.status) ? 'bg-cyan-400 animate-pulse' :
                                            'bg-slate-600')} />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-slate-100">{d.name || d.project?.name || 'Untitled'}</p>
                                            <p className="truncate text-[11px] text-slate-500">{d.project?.repositoryUrl?.replace('upload://', '') || 'Upload'}{d.port ? ` · Port ${d.port}` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="hidden text-[11px] text-slate-600 sm:block">{formatDate(d.updatedAt)}</span>
                                        <StatusBadge status={d.status} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No deployments yet" description="Connect GitHub and add a VPS to start deploying." />
                    )}
                </Panel>

                {/* VPS panel */}
                <Panel>
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/8 text-cyan-200"><Server size={15} /></div>
                            <h2 className="font-black text-white">Server Status</h2>
                        </div>
                        <Link href="/vps" className="flex items-center gap-1 text-xs font-bold text-slate-500 transition-colors hover:text-cyan-300">Manage <ArrowRight size={12} /></Link>
                    </div>
                    {vps.isLoading ? (
                        <div className="space-y-3"><SkeletonBlock className="h-20" /><SkeletonBlock className="h-20" /></div>
                    ) : vpsList.length ? (
                        <div className="space-y-3">
                            {vpsList.slice(0, 4).map(server => {
                                const health = server.healthRecords?.[0];
                                const cpu  = Math.round(health?.cpuUsage    || 0);
                                const ram  = Math.round(health?.memoryUsage || 0);
                                const disk = Math.round(health?.diskUsage   || 0);
                                const isOnline = server.status.toLowerCase() === 'active';
                                return (
                                    <Link key={server.id} href="/vps"
                                        className="block rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 transition-all hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
                                        <div className="mb-2.5 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className={clsx('h-2 w-2 rounded-full', isOnline ? 'bg-emerald-400' : 'bg-rose-400')} />
                                                <p className="truncate text-sm font-black text-slate-100">{server.name}</p>
                                            </div>
                                            <StatusBadge status={server.status} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                                                <span>CPU {cpu}%</span><span>RAM {ram}%</span><span>Disk {disk}%</span>
                                            </div>
                                            <MiniProgressBar pct={cpu}  color={cpu  > 80 ? 'bg-rose-400' : cpu  > 60 ? 'bg-amber-400' : 'bg-cyan-400'} />
                                            <MiniProgressBar pct={ram}  color={ram  > 80 ? 'bg-rose-400' : ram  > 60 ? 'bg-amber-400' : 'bg-emerald-400'} />
                                            <MiniProgressBar pct={disk} color={disk > 80 ? 'bg-rose-400' : 'bg-slate-500'} />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No VPS connected" description="Add a server to see health metrics." />
                    )}
                </Panel>
            </div>

            {/* Repos + Activity */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* Repos */}
                <Panel>
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-300/15 bg-violet-300/8 text-violet-300"><Github size={15} /></div>
                            <h2 className="font-black text-white">GitHub Repositories</h2>
                        </div>
                        <Link href="/repositories" className="flex items-center gap-1 text-xs font-bold text-slate-500 transition-colors hover:text-cyan-300">Sync <ArrowRight size={12} /></Link>
                    </div>
                    {github.isLoading || repos.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-14" />)}</div>
                    ) : github.data && repoList.length ? (
                        <div className="space-y-2">
                            {repoList.slice(0, 5).map(repo => (
                                <Link key={repo.id} href="/repositories"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 transition-all hover:border-cyan-300/20">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Github size={14} className="shrink-0 text-slate-500" />
                                        <p className="truncate text-sm font-bold text-white">{repo.fullName}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {repo.webhookId
                                            ? <span className="flex items-center gap-1 text-[10px] font-black text-emerald-300"><CheckCircle2 size={11} />Hook</span>
                                            : <span className="flex items-center gap-1 text-[10px] font-black text-slate-600"><XCircle size={11} />No hook</span>}
                                        <GitBranch size={12} className="text-slate-600" />
                                        <span className="text-[10px] font-bold text-slate-500">{repo.defaultBranch}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title={github.data ? 'No repositories synced' : 'GitHub disconnected'} description={github.data ? 'Sync repos to populate this panel.' : 'Connect GitHub to deploy from repos.'} />
                    )}
                </Panel>

                {/* Activity feed */}
                <Panel>
                    <div className="mb-5 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/15 bg-amber-300/8 text-amber-300"><Zap size={15} /></div>
                        <h2 className="font-black text-white">Recent Activity</h2>
                    </div>
                    {isLoading || repos.isLoading ? (
                        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12" />)}</div>
                    ) : recentActivity.length ? (
                        <div className="space-y-1">
                            {recentActivity.map(item => (
                                <Link key={item.id} href={item.href}
                                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
                                    <div className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs',
                                        item.type === 'deployment' ? 'bg-cyan-300/10 text-cyan-300' :
                                        item.type === 'vps'        ? 'bg-emerald-300/10 text-emerald-300' :
                                        'bg-violet-300/10 text-violet-300')}>
                                        {item.type === 'deployment' ? <Rocket size={13} /> : item.type === 'vps' ? <Server size={13} /> : <Github size={13} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-black text-slate-200">{item.title}</p>
                                        <p className="text-[10px] font-bold uppercase text-slate-600">{item.detail}</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] text-slate-600">{formatDate(item.time)}</span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No activity yet" description="Deployments, VPS checks, and repo events will appear here." />
                    )}
                </Panel>
            </div>
        </div>
    );
}
