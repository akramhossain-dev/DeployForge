'use client';

import { FileText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import { useDeploymentLogs, useDeployments } from '@/hooks/useDeployForgeData';

export default function DeploymentsPage() {
    const deployments = useDeployments();
    const [selectedId, setSelectedId] = useState<string | undefined>();
    const selected = deployments.data?.find((deployment) => deployment.id === selectedId) || deployments.data?.[0];
    const logs = useDeploymentLogs(selected?.id);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Deployments"
                description="Live deployment status and logs. Active builds refresh more frequently until they settle."
                action={<Button variant="secondary" onClick={() => deployments.refetch()} loading={deployments.isFetching}><RefreshCw size={16} /> Refresh</Button>}
            />

            {deployments.isError ? <ErrorState message={(deployments.error as Error)?.message} onRetry={() => deployments.refetch()} /> : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Panel>
                    {deployments.isLoading ? (
                        <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-20" />)}</div>
                    ) : deployments.data?.length ? (
                        <div className="divide-y divide-slate-800">
                            {deployments.data.map((deployment) => (
                                <button
                                    key={deployment.id}
                                    onClick={() => setSelectedId(deployment.id)}
                                    className="flex w-full flex-col gap-3 py-4 text-left transition-colors hover:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0 px-1">
                                        <p className="truncate font-bold text-white">{deployment.name || deployment.project?.name || 'Untitled deployment'}</p>
                                        <p className="mt-1 truncate text-xs text-slate-500">{deployment.commitMessage || deployment.project?.repositoryUrl || 'No commit details'}</p>
                                    </div>
                                    <div className="flex items-center gap-3 px-1">
                                        <span className="text-xs text-slate-500">{formatDate(deployment.updatedAt)}</span>
                                        <StatusBadge status={deployment.status} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No deployments found" description="Deployments will appear here once a repository is deployed to a VPS." />
                    )}
                </Panel>

                <Panel className="min-h-[420px]">
                    <div className="mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-cyan-300" />
                        <h3 className="font-bold text-white">Deployment Logs</h3>
                    </div>
                    {!selected ? (
                        <p className="text-sm text-slate-400">Select a deployment to view logs.</p>
                    ) : logs.isError ? (
                        <ErrorState title="Unable to load logs" message={(logs.error as Error)?.message} onRetry={() => logs.refetch()} />
                    ) : logs.isLoading ? (
                        <div className="space-y-3"><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /></div>
                    ) : logs.data?.length ? (
                        <pre className="terminal-scrollbar max-h-[520px] overflow-auto rounded-lg bg-black p-4 font-mono text-xs leading-6 text-emerald-100">
                            {logs.data.map((log) => `[${formatDate(log.createdAt || log.timestamp)}] ${log.message || log.output || ''}`).join('\n')}
                        </pre>
                    ) : (
                        <p className="rounded-lg bg-black p-4 font-mono text-xs text-slate-500">No logs have been recorded for this deployment yet.</p>
                    )}
                </Panel>
            </div>
        </div>
    );
}
