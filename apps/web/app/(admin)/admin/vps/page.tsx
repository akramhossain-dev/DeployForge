'use client';

import { ErrorState, PageHeader } from '@/components/ui';
import { AdminTable, Button, Panel, ResourceBars, SectionHeading, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminVps } from '@/hooks/useDeployForgeData';

export default function AdminVpsPage() {
    const vps = useAdminVps();
    const action = useAdminAction();

    return (
        <div className="space-y-6">
            <PageHeader title="VPS Management" description="Fleet health, resource usage, active containers, ownership, and removal controls." />
            {vps.isError ? <ErrorState message={(vps.error as Error)?.message} onRetry={() => vps.refetch()} /> : null}
            {action.isError ? <ErrorState title="Admin action failed" message={(action.error as Error)?.message} /> : null}
            {vps.isLoading ? null : vps.data?.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {vps.data.slice(0, 6).map((server) => {
                        const health = server.healthRecords?.[0];
                        return (
                            <Panel key={server.id}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="truncate font-black text-white">{server.name}</p>
                                        <p className="mt-1 truncate text-xs text-slate-500">{server.user?.email || 'Unknown owner'}</p>
                                    </div>
                                    <StatusBadge status={server.status} />
                                </div>
                                <div className="mt-5">
                                    <ResourceBars cpu={health?.cpuUsage} ram={health?.memoryUsage} disk={health?.diskUsage} />
                                </div>
                            </Panel>
                        );
                    })}
                </div>
            ) : null}
            <Panel>
                <SectionHeading title="Fleet Table" description="Complete server inventory with health, ownership, containers, and controls." />
                <AdminTable
                    columns={['Server', 'Owner', 'Health', 'Usage', 'Containers', 'Updated', 'Actions']}
                    empty="No VPS records found."
                    rows={vps.isLoading ? undefined : vps.data?.map((server) => {
                        const health = server.healthRecords?.[0];
                        const metrics = server.systemMetrics?.[0];
                        return [
                            <div key="server">
                                <p className="font-bold text-white">{server.name}</p>
                                <p className="text-xs text-slate-500">{server.username}@{server.ipAddress}:{server.port}</p>
                            </div>,
                            <span key="owner">{server.user?.email || 'Unknown'}</span>,
                            <StatusBadge key="status" status={server.status} />,
                            <div key="usage" className="min-w-48"><ResourceBars cpu={health?.cpuUsage} ram={health?.memoryUsage} disk={health?.diskUsage} /></div>,
                            <span key="containers">{metrics?.activeContainers || 0}</span>,
                            <span key="updated">{formatDate(health?.checkedAt || server.updatedAt)}</span>,
                            <Button key="actions" variant="danger" onClick={() => action.mutate({ method: 'delete', path: `/admin/vps/${server.id}` })}>Remove</Button>,
                        ];
                    }) || []}
                />
            </Panel>
        </div>
    );
}
