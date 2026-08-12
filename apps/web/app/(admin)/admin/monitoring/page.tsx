'use client';

import { Activity, Clock, Container, Cpu, Gauge, HardDrive, MemoryStick, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { AdminStat, ResourceBars, SmallMeta } from '@/components/admin/AdminWidgets';
import { useAdminMonitoring } from '@/hooks/useDeployForgeData';

function formatUptime(seconds?: number) {
    if (!seconds) return '0m';
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days) return `${days}d ${hours % 24}h`;
    if (hours) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
}

function QueueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total ? Math.round((value / total) * 100) : 0;
    return (
        <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between text-[11px]">
                <span className="text-[#666666] font-semibold uppercase">{label}</span>
                <span className="font-bold text-white">{value} ({pct}%)</span>
            </div>
            <div className="h-1.5 w-full rounded bg-[#000000] border border-[#1F1F1F] overflow-hidden">
                <div className={clsx('h-full transition-all duration-300', color)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function AdminMonitoringPage() {
    const monitoring = useAdminMonitoring();
    const data = monitoring.data;

    const queueTotal = (data?.queueStatus.queued || 0) + (data?.queueStatus.running || 0) + (data?.queueStatus.failed || 0);

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Monitoring Center
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Platform resource pressure metrics, deployment queue status, and system error rates.
                    </p>
                </div>
                <button
                    onClick={() => monitoring.refetch()}
                    disabled={monitoring.isRefetching}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                    <RefreshCw size={13} className={monitoring.isRefetching ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {monitoring.isError && <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">{(monitoring.error as Error)?.message}</div>}

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <AdminStat title="Deployment Success" value={data ? `${data.deploymentSuccessRate}%` : '…'} icon={<Gauge size={16} />} />
                <AdminStat title="Job Success Rate" value={data ? `${data.jobSuccessRate}%` : '…'} icon={<Activity size={16} />} />
                <AdminStat title="Active Containers" value={data?.activeContainers ?? '…'} icon={<Container size={16} />} />
                <AdminStat title="System Uptime" value={formatUptime(data?.systemUptime)} icon={<Clock size={16} />} />
            </div>

            {/* Content row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Resource pressure */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Activity size={14} />
                        <span>Platform Aggregate Resource Pressure</span>
                    </div>
                    <ResourceBars cpu={data?.cpuUsage} ram={data?.memoryUsage} disk={data?.diskUsage} />
                </div>

                {/* Queue status */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Gauge size={14} />
                        <span>Background Job Queue Status</span>
                    </div>
                    <div className="space-y-3">
                        <QueueBar label="Queued" value={data?.queueStatus.queued || 0} total={queueTotal} color="bg-white" />
                        <QueueBar label="Running" value={data?.queueStatus.running || 0} total={queueTotal} color="bg-emerald-400" />
                        <QueueBar label="Failed" value={data?.queueStatus.failed || 0} total={queueTotal} color="bg-rose-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#1F1F1F]">
                        <SmallMeta label="Total in Queue" value={queueTotal} />
                        <SmallMeta label="Queue Error Rate" value={`${data?.errorRate || 0}%`} />
                    </div>
                </div>
            </div>
        </div>
    );
}
