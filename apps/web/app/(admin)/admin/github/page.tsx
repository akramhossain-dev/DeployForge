'use client';

import { ErrorState, PageHeader } from '@/components/ui';
import { AdminTable, Button, Panel, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminGithubAccounts } from '@/hooks/useDeployForgeData';

export default function AdminGithubPage() {
    const accounts = useAdminGithubAccounts();
    const action = useAdminAction();

    return (
        <div className="space-y-6">
            <PageHeader title="GitHub Management" description="Connected accounts, repositories, forced sync, and connection removal." />
            {accounts.isError ? <ErrorState message={(accounts.error as Error)?.message} onRetry={() => accounts.refetch()} /> : null}
            {action.isError ? <ErrorState title="Admin action failed" message={(action.error as Error)?.message} /> : null}
            <Panel>
                <AdminTable
                    columns={['Account', 'User', 'Repositories', 'Private', 'Connected', 'Actions']}
                    empty="No GitHub accounts connected."
                    rows={accounts.isLoading ? undefined : accounts.data?.map((account) => [
                        <div key="account">
                            <p className="font-bold text-white">@{account.username}</p>
                            <p className="text-xs text-slate-500">{account.email || 'No public email'}</p>
                        </div>,
                        <span key="user">{account.user?.email || 'Unknown'}</span>,
                        <span key="repos">{account.repositories.length}</span>,
                        <span key="private">{account.repositories.filter((repo) => repo.private).length}</span>,
                        <span key="connected">{formatDate(account.connectedAt)}</span>,
                        <div key="actions" className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => action.mutate({ path: `/admin/github/accounts/${account.user?.id}/sync` })}>Force Sync</Button>
                            <Button variant="danger" onClick={() => action.mutate({ method: 'delete', path: `/admin/github/accounts/${account.user?.id}` })}>Remove</Button>
                        </div>,
                    ]) || []}
                />
            </Panel>
        </div>
    );
}
