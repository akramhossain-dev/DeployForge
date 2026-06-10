'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState, PageHeader } from '@/components/ui';
import { AdminTable, Button, Panel, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminUsers } from '@/hooks/useDeployForgeData';

export default function AdminUsersPage() {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const params = useMemo(() => ({ search, status }), [search, status]);
    const users = useAdminUsers(params);
    const action = useAdminAction();

    return (
        <div className="space-y-6">
            <PageHeader title="User Management" description="Search, filter, suspend, activate, and inspect platform users." />
            {users.isError ? <ErrorState message={(users.error as Error)?.message} onRetry={() => users.refetch()} /> : null}
            {action.isError ? <ErrorState title="Admin action failed" message={(action.error as Error)?.message} /> : null}

            <Panel>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-400">
                        <Search size={16} />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="w-full bg-transparent text-slate-100 outline-none" />
                    </label>
                    <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100">
                        <option value="">All statuses</option>
                        <option>ACTIVE</option>
                        <option>SUSPENDED</option>
                    </select>
                </div>
            </Panel>

            <Panel>
                <AdminTable
                    columns={['User', 'Role', 'Status', 'Resources', 'GitHub', 'Joined', 'Actions']}
                    empty="No users match the filters."
                    rows={users.isLoading ? undefined : users.data?.map((user) => [
                        <div key="user">
                            <p className="font-bold text-white">{user.name || 'Unnamed user'}</p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                        </div>,
                        <span key="role" className="text-xs font-black text-cyan-200">USER</span>,
                        <StatusBadge key="status" status={user.status} />,
                        <span key="resources">{user._count?.deployments || 0} deployments / {user._count?.vps || 0} VPS</span>,
                        <span key="github">{user.githubAccount ? `@${user.githubAccount.username}` : 'Not connected'}</span>,
                        <span key="joined">{formatDate(user.createdAt)}</span>,
                        <div key="actions" className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => action.mutate({ method: 'patch', path: `/admin/platform-users/${user.id}/status`, body: { status: user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' } })}>
                                {user.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                            </Button>
                            <Button variant="danger" onClick={() => action.mutate({ method: 'delete', path: `/admin/platform-users/${user.id}` })}>Delete</Button>
                        </div>,
                    ]) || []}
                />
            </Panel>
        </div>
    );
}
