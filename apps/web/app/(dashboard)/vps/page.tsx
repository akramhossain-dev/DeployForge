'use client';

import { RefreshCw, Server } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import { useVpsList } from '@/hooks/useDeployForgeData';

export default function VpsPage() {
    const vps = useVpsList();

    return (
        <div className="space-y-6">
            <PageHeader
                title="VPS Manager"
                description="Connected servers, health snapshots, and deployment capacity."
                action={<Button variant="secondary" onClick={() => vps.refetch()} loading={vps.isFetching}><RefreshCw size={16} /> Refresh</Button>}
            />

            {vps.isError ? <ErrorState message={(vps.error as Error)?.message} onRetry={() => vps.refetch()} /> : null}

            {vps.isLoading ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-48" />)}
                </div>
            ) : vps.data?.length ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {vps.data.map((server) => {
                        const health = server.healthRecords?.[0];
                        return (
                            <Panel key={server.id}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Server size={18} className="text-cyan-300" />
                                            <p className="truncate font-bold text-white">{server.name}</p>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-400">{server.username}@{server.ipAddress}:{server.port}</p>
                                    </div>
                                    <StatusBadge status={server.status} />
                                </div>

                                <div className="mt-6 space-y-4">
                                    {[
                                        ['CPU', health?.cpuUsage || 0],
                                        ['RAM', health?.memoryUsage || 0],
                                        ['Disk', health?.diskUsage || 0],
                                    ].map(([label, raw]) => {
                                        const value = Math.round(Number(raw));
                                        return (
                                            <div key={label}>
                                                <div className="mb-1 flex justify-between text-xs text-slate-400">
                                                    <span>{label}</span>
                                                    <span>{value}%</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                                    <div className="h-full bg-cyan-400" style={{ width: `${Math.min(value, 100)}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <p className="mt-5 text-xs text-slate-500">Last updated {formatDate(health?.checkedAt || server.updatedAt)}</p>
                            </Panel>
                        );
                    })}
                </div>
            ) : (
                <EmptyState title="No VPS connected" description="Add a VPS through the API or onboarding flow to start deploying and monitoring workloads." />
            )}
        </div>
    );
}
