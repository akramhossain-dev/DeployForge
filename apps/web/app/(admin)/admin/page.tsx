'use client';

import { Activity, Github, Rocket, Server, ShieldCheck, Users, Zap, RefreshCw } from 'lucide-react';
import { AdminStat, AdminTable, ResourceBars, StatusBadge, formatDate, LoadingGrid } from '@/components/admin/AdminWidgets';
import { useAdminOverview } from '@/hooks/useDeployForgeData';

export default function AdminOverviewPage() {
    const overview = useAdminOverview();
    const data = overview.data;

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Admin Overview
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Platform-wide health metrics, user registration volume, and admin activity logs.
                    </p>
                </div>
                <button
                    onClick={() => overview.refetch()}
                    disabled={overview.isFetching}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                    <RefreshCw size={13} className={overview.isFetching ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {overview.isError && (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">
                    Failed to fetch admin metrics: {(overview.error as Error)?.message}
                </div>
            )}

            {/* Users row */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {overview.isLoading ? <LoadingGrid count={4} className="h-24" /> : (
                    <>
                        <AdminStat title="Total Users" value={data?.totals.totalUsers ?? '…'} icon={<Users size={16} />} />
                        <AdminStat title="Active Users" value={data?.totals.activeUsers ?? '…'} icon={<Users size={16} />} detail={`${(data?.totals.suspendedUsers || 0) + (data?.totals.disabledUsers || 0)} suspended`} />
                        <AdminStat title="Administrators" value={data?.totals.totalAdmins ?? '…'} icon={<ShieldCheck size={16} />} />
                        <AdminStat title="Moderators" value={data?.totals.totalModerators ?? '…'} icon={<ShieldCheck size={16} />} />
                    </>
                )}
            </div>

            {/* Platform row */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {overview.isLoading ? <LoadingGrid count={4} className="h-24" /> : (
                    <>
                        <AdminStat title="Deployments" value={data?.totals.totalDeployments ?? '…'} detail={`${data?.totals.activeDeployments || 0} active`} icon={<Rocket size={16} />} />
                        <AdminStat title="VPS Servers" value={data?.totals.totalVps ?? '…'} icon={<Server size={16} />} />
                        <AdminStat title="GitHub Accounts" value={data?.totals.connectedGitHubAccounts ?? '…'} icon={<Github size={16} />} />
                        <AdminStat title="Queue Success" value={data ? `${data.queue.successRate}%` : '…'} detail={`${data?.queue.failedJobs || 0} failed jobs`} icon={<Activity size={16} />} />
                    </>
                )}
            </div>

            {/* Content Grids */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Recent Registrations */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Users size={14} />
                        <span>Recent Registrations</span>
                    </div>
                    <AdminTable
                        columns={['User', 'Status', 'Joined']}
                        empty="No user accounts registered yet."
                        rows={overview.isLoading ? undefined : data?.recentRegistrations?.map(reg => [
                            <div key="user">
                                <p className="font-bold text-white text-xs">{reg.name || 'Unnamed'}</p>
                                <p className="text-[10px] text-[#666666]">{reg.email}</p>
                            </div>,
                            <StatusBadge key="status" status={reg.status} />,
                            <span key="joined" className="text-xs text-[#A1A1A1]">{formatDate(reg.createdAt)}</span>,
                        ]) || []}
                    />
                </div>

                {/* Resource Summary */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Zap size={14} />
                        <span>Resource Summary</span>
                    </div>
                    <ResourceBars cpu={data?.resources.cpuUsage} ram={data?.resources.memoryUsage} disk={data?.resources.diskUsage} />
                </div>

                {/* Recent Activities */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Activity size={14} />
                        <span>Admin Activity Stream</span>
                    </div>
                    <AdminTable
                        columns={['Admin', 'Action', 'Time']}
                        empty="No administrative actions logged."
                        rows={overview.isLoading ? undefined : data?.recentActivities.map(activity => [
                            <span key="admin" className="text-xs font-bold text-white">{activity.admin?.email || 'System'}</span>,
                            <span key="action" className="text-xs text-white">{activity.action}</span>,
                            <span key="time" className="text-xs text-[#666666]">{formatDate(activity.createdAt)}</span>,
                        ]) || []}
                    />
                </div>
            </div>
        </div>
    );
}
