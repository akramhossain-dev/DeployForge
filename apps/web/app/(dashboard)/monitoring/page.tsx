'use client';

import { Activity, RefreshCw } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge } from '@/components/ui';
import { useDeployments, useVpsList } from '@/hooks/useDeployForgeData';

export default function MonitoringPage() {
    const deployments = useDeployments();
    const vps = useVpsList();

    return (
        <div className="space-y-6">
            <PageHeader
                title="Monitoring"
                description="Flat health charts for active deployments and server resource pressure."
                action={<Button variant="secondary" onClick={() => { deployments.refetch(); vps.refetch(); }} loading={deployments.isFetching || vps.isFetching}><RefreshCw size={16} /> Refresh</Button>}
            />

            {deployments.isError || vps.isError ? (
                <ErrorState message={(deployments.error as Error)?.message || (vps.error as Error)?.message} onRetry={() => { deployments.refetch(); vps.refetch(); }} />
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Panel>
                    <div className="mb-5 flex items-center gap-2">
                        <Activity size={18} className="text-cyan-300" />
                        <h3 className="font-bold text-white">Deployment Status Mix</h3>
                    </div>
                    {deployments.isLoading ? (
                        <SkeletonBlock className="h-56" />
                    ) : deployments.data?.length ? (
                        <div className="space-y-4">
                            {['RUNNING', 'BUILDING', 'FAILED', 'STOPPED', 'PENDING'].map((status) => {
                                const count = deployments.data.filter((item) => item.status === status).length;
                                const percent = Math.round((count / deployments.data.length) * 100);
                                return (
                                    <div key={status}>
                                        <div className="mb-2 flex items-center justify-between text-sm">
                                            <StatusBadge status={status} />
                                            <span className="text-slate-400">{count}</span>
                                        </div>
                                        <div className="h-3 overflow-hidden rounded bg-slate-800">
                                            <div className="h-full bg-cyan-400" style={{ width: `${percent}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No deployment telemetry" description="Deploy an app to start collecting status metrics." />
                    )}
                </Panel>

                <Panel>
                    <h3 className="mb-5 font-bold text-white">Server Resource Pressure</h3>
                    {vps.isLoading ? (
                        <SkeletonBlock className="h-56" />
                    ) : vps.data?.length ? (
                        <div className="space-y-5">
                            {vps.data.map((server) => {
                                const health = server.healthRecords?.[0];
                                const pressure = Math.max(health?.cpuUsage || 0, health?.memoryUsage || 0, health?.diskUsage || 0);
                                return (
                                    <div key={server.id}>
                                        <div className="mb-2 flex items-center justify-between text-sm">
                                            <span className="font-bold text-slate-200">{server.name}</span>
                                            <span className="text-slate-400">{Math.round(pressure)}%</span>
                                        </div>
                                        <div className="h-6 overflow-hidden rounded bg-slate-800">
                                            <div className="flex h-full items-center bg-emerald-400 px-2 text-xs font-bold text-slate-950" style={{ width: `${Math.min(pressure, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No servers to monitor" description="Connect a VPS to see resource charts." />
                    )}
                </Panel>
            </div>
        </div>
    );
}
