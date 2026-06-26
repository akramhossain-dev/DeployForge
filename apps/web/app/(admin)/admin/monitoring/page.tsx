'use client';

import { Activity, Clock, Container, Cpu, Gauge, HardDrive, MemoryStick, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { ErrorState, PageHeader, SkeletonBlock } from '@/components/ui';
import { AdminStat, Panel, ResourceBars, SectionHeading, SmallMeta } from '@/components/admin/AdminWidgets';
import { useAdminMonitoring } from '@/hooks/useDeployForgeData';
import { Button } from '@/components/ui';

function formatUptime(seconds?: number) {
    if (!seconds) return '0m';
    const mins  = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    if (days)  return `${days}d ${hours % 24}h`;
    if (hours) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
}

function QueueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total ? Math.round((value / total) * 100) : 0;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400">{label}</span>
                <span className="font-black text-white tabular-nums">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={clsx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function AdminMonitoringPage() {
    const monitoring = useAdminMonitoring();
    const data = monitoring.data;

    const queueTotal = (data?.queueStatus.queued || 0) + (data?.queueStatus.running || 0) + (data?.queueStatus.failed || 0);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Monitoring Center"
                description="Platform resource usage, queue health, success rates, uptime, and error pressure."
                action={
                    <Button variant="secondary" onClick={() => monitoring.refetch()} loading={monitoring.isRefetching}>
                        <RefreshCw size={14} /> Refresh
                    </Button>
                }
            />

            {monitoring.isError ? <ErrorState message={(monitoring.error as Error)?.message} onRetry={() => monitoring.refetch()} /> : null}

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {monitoring.isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)
                ) : (
                    <>
                        <AdminStat
                            title="Deployment Success"
                            value={data ? `${data.deploymentSuccessRate}%` : '…'}
                            icon={<Gauge size={18} />}
                            accent={data && data.deploymentSuccessRate < 70 ? 'bg-gradient-to-r from-rose-400/30 to-transparent' : 'bg-gradient-to-r from-emerald-400/30 to-transparent'}
                        />
                        <AdminStat
                            title="Job Success"
                            value={data ? `${data.jobSuccessRate}%` : '…'}
                            icon={<Activity size={18} />}
                            accent={data && data.jobSuccessRate < 70 ? 'bg-gradient-to-r from-rose-400/30 to-transparent' : 'bg-gradient-to-r from-emerald-400/30 to-transparent'}
                        />
                        <AdminStat
                            title="Active Containers"
                            value={data?.activeContainers ?? '…'}
                            icon={<Container size={18} />}
                        />
                        <AdminStat
                            title="System Uptime"
                            value={formatUptime(data?.systemUptime)}
                            icon={<Clock size={18} />}
                            accent="bg-gradient-to-r from-cyan-400/20 to-transparent"
                        />
                    </>
                )}
            </div>

            {/* Resource + Queue row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Resource pressure */}
                <Panel>
                    <SectionHeading
                        icon={<Activity size={15} />}
                        title="Resource Pressure"
                        description="Platform aggregate CPU, RAM, and disk usage."
                    />
                    {monitoring.isLoading ? (
                        <SkeletonBlock className="h-32" />
                    ) : (
                        <div className="space-y-5">
                            <ResourceBars cpu={data?.cpuUsage} ram={data?.memoryUsage} disk={data?.diskUsage} />
                            {/* Metric chips */}
                            <div className="grid grid-cols-3 gap-3 border-t border-white/[0.05] pt-4">
                                {[
                                    { label: 'CPU',  value: data?.cpuUsage    || 0, icon: <Cpu size={14} /> },
                                    { label: 'RAM',  value: data?.memoryUsage || 0, icon: <MemoryStick size={14} /> },
                                    { label: 'Disk', value: data?.diskUsage   || 0, icon: <HardDrive size={14} /> },
                                ].map(m => {
                                    const pct   = Math.round(m.value);
                                    const color = pct > 85 ? 'text-rose-300' : pct > 65 ? 'text-amber-300' : 'text-emerald-300';
                                    return (
                                        <div key={m.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
                                            <div className="flex justify-center mb-1 text-slate-500">{m.icon}</div>
                                            <p className={clsx('text-lg font-black', color)}>{pct}%</p>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{m.label}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </Panel>

                {/* Queue status */}
                <Panel>
                    <SectionHeading
                        icon={<Gauge size={15} />}
                        title="Queue Status"
                        description="Current background deployment queue state."
                    />
                    {monitoring.isLoading ? (
                        <SkeletonBlock className="h-32" />
                    ) : (
                        <div className="space-y-5">
                            <div className="space-y-3">
                                <QueueBar label="Queued"  value={data?.queueStatus.queued  || 0} total={queueTotal} color="bg-cyan-400" />
                                <QueueBar label="Running" value={data?.queueStatus.running || 0} total={queueTotal} color="bg-emerald-400" />
                                <QueueBar label="Failed"  value={data?.queueStatus.failed  || 0} total={queueTotal} color="bg-rose-400" />
                            </div>
                            <div className="grid grid-cols-2 gap-3 border-t border-white/[0.05] pt-4">
                                <SmallMeta label="Total in Queue" value={queueTotal} />
                                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Error Rate</p>
                                    <p className={clsx('text-lg font-black', (data?.errorRate || 0) > 20 ? 'text-rose-300' : 'text-emerald-300')}>
                                        {data?.errorRate || 0}%
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}
