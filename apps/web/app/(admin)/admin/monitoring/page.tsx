'use client';

import { Activity, Clock, Container, Gauge } from 'lucide-react';
import { ErrorState, PageHeader } from '@/components/ui';
import { AdminStat, Panel, ResourceBars, SmallMeta } from '@/components/admin/AdminWidgets';
import { useAdminMonitoring } from '@/hooks/useDeployForgeData';

function formatUptime(seconds?: number) {
    if (!seconds) return '0m';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export default function AdminMonitoringPage() {
    const monitoring = useAdminMonitoring();
    const data = monitoring.data;

    return (
        <div className="space-y-6">
            <PageHeader title="Monitoring Center" description="Platform resource usage, queue health, success rate, uptime, and error pressure." />
            {monitoring.isError ? <ErrorState message={(monitoring.error as Error)?.message} onRetry={() => monitoring.refetch()} /> : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <AdminStat title="Deployment Success" value={data ? `${data.deploymentSuccessRate}%` : '...'} icon={<Gauge size={20} />} />
                <AdminStat title="Job Success" value={data ? `${data.jobSuccessRate}%` : '...'} icon={<Activity size={20} />} />
                <AdminStat title="Containers" value={data?.activeContainers ?? '...'} icon={<Container size={20} />} />
                <AdminStat title="System Uptime" value={formatUptime(data?.systemUptime)} icon={<Clock size={20} />} />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Panel>
                    <h3 className="mb-4 font-bold text-white">Resource Pressure</h3>
                    <ResourceBars cpu={data?.cpuUsage} ram={data?.memoryUsage} disk={data?.diskUsage} />
                </Panel>
                <Panel>
                    <h3 className="mb-4 font-bold text-white">Queue Status</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <SmallMeta label="Queued" value={data?.queueStatus.queued ?? 0} />
                        <SmallMeta label="Running" value={data?.queueStatus.running ?? 0} />
                        <SmallMeta label="Failed" value={data?.queueStatus.failed ?? 0} />
                    </div>
                    <div className="mt-6">
                        <SmallMeta label="Error Rate" value={`${data?.errorRate || 0}%`} />
                    </div>
                </Panel>
            </div>
        </div>
    );
}
