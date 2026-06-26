'use client';

import { Activity, Github, Rocket, Server, ShieldCheck, Users, Zap } from 'lucide-react';
import { ErrorState, PageHeader, Panel, SectionHeading } from '@/components/ui';
import { AdminStat, AdminTable, ResourceBars, StatusBadge, formatDate, LoadingGrid } from '@/components/admin/AdminWidgets';
import { useAdminOverview } from '@/hooks/useDeployForgeData';

export default function AdminOverviewPage() {
    const overview = useAdminOverview();
    const data = overview.data;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Admin Overview"
                description="Platform-wide health, usage, and recent administrative activity."
            />

            {overview.isError ? <ErrorState message={(overview.error as Error)?.message} onRetry={() => overview.refetch()} /> : null}

            {/* Users row */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {overview.isLoading ? <LoadingGrid count={4} className="h-32" /> : (
                    <>
                        <AdminStat title="Total Users"      value={data?.totals.totalUsers ?? '…'}      icon={<Users size={18} />} />
                        <AdminStat title="Active Users"     value={data?.totals.activeUsers ?? '…'}     icon={<Users size={18} />}  accent="bg-gradient-to-r from-emerald-400/30 to-transparent" detail={`${(data?.totals.suspendedUsers || 0) + (data?.totals.disabledUsers || 0)} suspended/disabled`} />
                        <AdminStat title="Administrators"   value={data?.totals.totalAdmins ?? '…'}     icon={<ShieldCheck size={18} />} accent="bg-gradient-to-r from-rose-300/30 to-transparent" />
                        <AdminStat title="Moderators"       value={data?.totals.totalModerators ?? '…'} icon={<ShieldCheck size={18} />} accent="bg-gradient-to-r from-amber-300/20 to-transparent" />
                    </>
                )}
            </div>

            {/* Platform row */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {overview.isLoading ? <LoadingGrid count={4} className="h-32" /> : (
                    <>
                        <AdminStat title="Deployments"    value={data?.totals.totalDeployments ?? '…'} detail={`${data?.totals.activeDeployments || 0} active`} icon={<Rocket size={18} />} />
                        <AdminStat title="VPS Servers"    value={data?.totals.totalVps ?? '…'}         icon={<Server size={18} />} />
                        <AdminStat title="GitHub Accounts" value={data?.totals.connectedGitHubAccounts ?? '…'} icon={<Github size={18} />} accent="bg-gradient-to-r from-violet-400/20 to-transparent" />
                        <AdminStat title="Queue Success"   value={data ? `${data.queue.successRate}%` : '…'} detail={`${data?.queue.failedJobs || 0} failed jobs`} icon={<Activity size={18} />} accent={data?.queue.failedJobs ? 'bg-gradient-to-r from-rose-400/30 to-transparent' : 'bg-gradient-to-r from-emerald-400/30 to-transparent'} />
                    </>
                )}
            </div>

            {/* Tables + resource row */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Recent registrations */}
                <Panel>
                    <SectionHeading icon={<Users size={16} />} title="Recent Registrations" description="Latest developer accounts created on the platform." />
                    <AdminTable
                        columns={['User', 'Status', 'Joined']}
                        empty="No users registered yet."
                        rows={overview.isLoading ? undefined : data?.recentRegistrations?.map(reg => [
                            <div key="user">
                                <p className="font-bold text-white text-xs">{reg.name || 'Unnamed user'}</p>
                                <p className="text-[10px] text-slate-500">{reg.email}</p>
                            </div>,
                            <StatusBadge key="status" status={reg.status} />,
                            <span key="joined" className="text-xs text-slate-400">{formatDate(reg.createdAt)}</span>,
                        ]) || []}
                    />
                </Panel>

                {/* Resource bars */}
                <Panel>
                    <SectionHeading icon={<Zap size={16} />} title="Resource Summary" description="Aggregate CPU, RAM, and disk pressure from recent platform metrics." />
                    <ResourceBars cpu={data?.resources.cpuUsage} ram={data?.resources.memoryUsage} disk={data?.resources.diskUsage} />
                </Panel>

                {/* Recent admin activity */}
                <Panel>
                    <SectionHeading icon={<Activity size={16} />} title="Recent Activities" description="Latest administrative actions recorded by the backend." />
                    <AdminTable
                        columns={['Admin', 'Action', 'Time']}
                        empty="No admin activity yet."
                        rows={overview.isLoading ? undefined : data?.recentActivities.map(activity => [
                            <span key="admin" className="text-xs font-bold text-slate-300">{activity.admin?.email || 'System'}</span>,
                            <span key="action" className="text-xs font-bold text-slate-100">{activity.action}</span>,
                            <span key="time" className="text-xs text-slate-500">{formatDate(activity.createdAt)}</span>,
                        ]) || []}
                    />
                </Panel>
            </div>
        </div>
    );
}
