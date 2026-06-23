'use client';

import { Activity, Github, GitBranch, Rocket, Server, Users } from 'lucide-react';
import { ErrorState, PageHeader } from '@/components/ui';
import { AdminStat, AdminTable, Panel, ResourceBars, SectionHeading, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminOverview } from '@/hooks/useDeployForgeData';

export default function AdminOverviewPage() {
    const overview = useAdminOverview();
    const data = overview.data;

    return (
        <div className="space-y-6">
            <PageHeader title="Admin Overview" description="Platform-wide health, usage, and recent administrative activity." />
            {overview.isError ? <ErrorState message={(overview.error as Error)?.message} onRetry={() => overview.refetch()} /> : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <AdminStat title="Total Users" value={data?.totals.totalUsers ?? '...'} icon={<Users size={20} />} />
                <AdminStat title="Total Admins" value={data?.totals.totalAdmins ?? '...'} icon={<Users size={20} />} />
                <AdminStat title="Total Moderators" value={data?.totals.totalModerators ?? '...'} icon={<Users size={20} />} />
                <AdminStat title="Active Users" value={data?.totals.activeUsers ?? '...'} detail={`${(data?.totals.suspendedUsers || 0) + (data?.totals.disabledUsers || 0)} suspended/disabled`} icon={<Users size={20} />} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <AdminStat title="Deployments" value={data?.totals.totalDeployments ?? '...'} detail={`${data?.totals.activeDeployments || 0} active`} icon={<Rocket size={20} />} />
                <AdminStat title="VPS" value={data?.totals.totalVps ?? '...'} icon={<Server size={20} />} />
                <AdminStat title="GitHub Accounts" value={data?.totals.connectedGitHubAccounts ?? '...'} icon={<Github size={20} />} />
                <AdminStat title="Queue Success" value={data ? `${data.queue.successRate}%` : '...'} detail={`${data?.queue.failedJobs || 0} failed jobs`} icon={<Activity size={20} />} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel>
                    <SectionHeading icon={<Users size={18} />} title="Recent Registrations" description="Latest developer accounts created on the platform." />
                    <AdminTable
                        columns={['User', 'Status', 'Joined']}
                        empty="No users registered yet."
                        rows={overview.isLoading ? undefined : data?.recentRegistrations?.map((reg) => [
                            <div key="user">
                                <p className="font-bold text-white text-xs">{reg.name || 'Unnamed user'}</p>
                                <p className="text-[10px] text-slate-500">{reg.email}</p>
                            </div>,
                            <StatusBadge key="status" status={reg.status} />,
                            <span key="joined" className="text-xs">{formatDate(reg.createdAt)}</span>
                        ]) || []}
                    />
                </Panel>
                <Panel>
                    <SectionHeading icon={<Activity size={18} />} title="Resource Summary" description="Aggregate pressure from recent platform metrics." />
                    <ResourceBars cpu={data?.resources.cpuUsage} ram={data?.resources.memoryUsage} disk={data?.resources.diskUsage} />
                </Panel>
                <Panel>
                    <SectionHeading icon={<Users size={18} />} title="Recent Activities" description="Latest administrative actions recorded by the backend." />
                    <AdminTable
                        columns={['Admin', 'Action', 'Time']}
                        empty="No admin activity yet."
                        rows={overview.isLoading ? undefined : data?.recentActivities.map((activity) => [
                            <span key="admin" className="text-xs">{activity.admin?.email || 'System'}</span>,
                            <span key="action" className="font-bold text-slate-100 text-xs">{activity.action}</span>,
                            <span key="time" className="text-xs">{formatDate(activity.createdAt)}</span>,
                        ]) || []}
                    />
                </Panel>
            </div>
        </div>
    );
}
