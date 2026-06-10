'use client';

import { Activity, Github, GitBranch, Rocket, Server, Users } from 'lucide-react';
import { ErrorState, PageHeader } from '@/components/ui';
import { AdminStat, AdminTable, Panel, ResourceBars, SectionHeading, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminOverview } from '@/hooks/useDeployForgeData';

export default function AdminOverviewPage() {
    const overview = useAdminOverview();
    const data = overview.data;

    return (
        <div className="space-y-6">
            <PageHeader title="Admin Overview" description="Platform-wide health, usage, and recent administrative activity." />
            {overview.isError ? <ErrorState message={(overview.error as Error)?.message} onRetry={() => overview.refetch()} /> : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AdminStat title="Total Users" value={data?.totals.totalUsers ?? '...'} icon={<Users size={20} />} />
                <AdminStat title="Deployments" value={data?.totals.totalDeployments ?? '...'} detail={`${data?.totals.activeDeployments || 0} active`} icon={<Rocket size={20} />} />
                <AdminStat title="VPS" value={data?.totals.totalVps ?? '...'} icon={<Server size={20} />} />
                <AdminStat title="GitHub Accounts" value={data?.totals.connectedGitHubAccounts ?? '...'} icon={<Github size={20} />} />
                <AdminStat title="Repositories" value={data?.totals.totalRepositories ?? '...'} icon={<GitBranch size={20} />} />
                <AdminStat title="Queue Success" value={data ? `${data.queue.successRate}%` : '...'} detail={`${data?.queue.failedJobs || 0} failed jobs`} icon={<Activity size={20} />} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel>
                    <SectionHeading icon={<Activity size={18} />} title="Resource Summary" description="Aggregate pressure from recent platform metrics." />
                    <ResourceBars cpu={data?.resources.cpuUsage} ram={data?.resources.memoryUsage} disk={data?.resources.diskUsage} />
                </Panel>
                <Panel className="xl:col-span-2">
                    <SectionHeading icon={<Users size={18} />} title="Recent Activities" description="Latest administrative actions recorded by the backend." />
                    <AdminTable
                        columns={['Admin', 'Action', 'Target', 'Time']}
                        empty="No admin activity yet."
                        rows={overview.isLoading ? undefined : data?.recentActivities.map((activity) => [
                            <span key="admin">{activity.admin?.email || 'System'}</span>,
                            <span key="action" className="font-bold text-slate-100">{activity.action}</span>,
                            <span key="target">{activity.targetType} {activity.targetId ? activity.targetId.slice(0, 8) : ''}</span>,
                            <span key="time">{formatDate(activity.createdAt)}</span>,
                        ]) || []}
                    />
                </Panel>
            </div>
        </div>
    );
}
