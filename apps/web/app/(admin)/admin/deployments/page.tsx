'use client';

import { useMemo, useState } from 'react';
import { ErrorState, PageHeader } from '@/components/ui';
import { AdminTable, Button, Panel, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminDeployments } from '@/hooks/useDeployForgeData';

export default function AdminDeploymentsPage() {
    const [status, setStatus] = useState('');
    const params = useMemo(() => ({ status }), [status]);
    const deployments = useAdminDeployments(params);
    const action = useAdminAction();

    return (
        <div className="space-y-6">
            <PageHeader title="Deployment Management" description="View, filter, stop, restart, delete, and inspect deployment history." />
            {deployments.isError ? <ErrorState message={(deployments.error as Error)?.message} onRetry={() => deployments.refetch()} /> : null}
            {action.isError ? <ErrorState title="Admin action failed" message={(action.error as Error)?.message} /> : null}
            <Panel>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100">
                    <option value="">All statuses</option>
                    {['PENDING', 'BUILDING', 'RUNNING', 'FAILED', 'STOPPED'].map((item) => <option key={item}>{item}</option>)}
                </select>
            </Panel>
            <Panel>
                <AdminTable
                    columns={['Deployment', 'User', 'Status', 'VPS', 'Recent Log', 'Updated', 'Actions']}
                    empty="No deployments found."
                    rows={deployments.isLoading ? undefined : deployments.data?.map((deployment) => [
                        <div key="deployment">
                            <p className="font-bold text-white">{deployment.name || deployment.project?.name || deployment.id.slice(0, 8)}</p>
                            <p className="text-xs text-slate-500">{deployment.project?.repositoryUrl || 'No repository'}</p>
                        </div>,
                        <span key="user">{deployment.user?.email || 'Unknown'}</span>,
                        <StatusBadge key="status" status={deployment.status} />,
                        <span key="vps">{deployment.vps?.name || 'No VPS'} {deployment.port ? `:${deployment.port}` : ''}</span>,
                        <span key="log" className="line-clamp-2 max-w-xs text-xs text-slate-400">{deployment.deploymentLogs?.[0]?.message || 'No logs'}</span>,
                        <span key="updated">{formatDate(deployment.updatedAt)}</span>,
                        <div key="actions" className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => action.mutate({ path: `/admin/deployments/${deployment.id}/stop` })}>Stop</Button>
                            <Button variant="secondary" onClick={() => action.mutate({ path: `/admin/deployments/${deployment.id}/restart` })}>Restart</Button>
                            <Button variant="danger" onClick={() => action.mutate({ method: 'delete', path: `/admin/deployments/${deployment.id}` })}>Delete</Button>
                        </div>,
                    ]) || []}
                />
            </Panel>
        </div>
    );
}
