'use client';

import Link from 'next/link';
import { Github, PackagePlus, RefreshCw, Rocket, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate, inputClassName } from '@/components/ui';
import { useDeployments } from '@/hooks/useDeployForgeData';

const activeStates = new Set(['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING']);

export default function DeploymentsPage() {
    const deployments = useDeployments();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return (deployments.data || []).filter((deployment) => {
            const haystack = [deployment.name, deployment.project?.name, deployment.project?.repositoryUrl, deployment.commitHash, deployment.status].filter(Boolean).join(' ').toLowerCase();
            const matchesSearch = !query || haystack.includes(query);
            const matchesStatus = status === 'all' || normalizeStatus(deployment.status) === status;
            return matchesSearch && matchesStatus;
        });
    }, [deployments.data, search, status]);

    const activeCount = deployments.data?.filter((deployment) => activeStates.has(deployment.status)).length || 0;
    const failedCount = deployments.data?.filter((deployment) => deployment.status === 'FAILED').length || 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Deployments"
                description="Create, monitor, and recover GitHub or upload-based releases from one deployment surface."
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => deployments.refetch()} loading={deployments.isFetching}><RefreshCw size={16} /> Refresh</Button>
                        <Link href="/deployments/new"><Button><PackagePlus size={16} /> New Deployment</Button></Link>
                    </div>
                }
            />

            {deployments.isError ? <ErrorState message={(deployments.error as Error)?.message} onRetry={() => deployments.refetch()} /> : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Metric title="Total" value={deployments.data?.length || 0} />
                <Metric title="Active" value={activeCount} />
                <Metric title="Failed" value={failedCount} danger={failedCount > 0} />
            </div>

            <Panel>
                <div className="flex flex-col gap-3 md:flex-row">
                    <label className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by project, repo, commit, or status" className={`${inputClassName} pl-10`} />
                    </label>
                    <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClassName} md:max-w-56`}>
                        <option value="all">All statuses</option>
                        {['pending', 'cloning', 'uploading', 'extracting', 'building', 'deploying', 'running', 'failed', 'broken', 'rolled_back', 'stopped'].map((item) => (
                            <option key={item} value={item}>{item.replace('_', ' ')}</option>
                        ))}
                    </select>
                </div>
            </Panel>

            {deployments.isLoading ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-36" />)}</div>
            ) : filtered.length ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filtered.map((deployment) => (
                        <Link key={deployment.id} href={`/deployments/${deployment.id}`} className="group block">
                            <Panel className="h-full transition-colors group-hover:border-cyan-300/30 group-hover:bg-cyan-300/[0.08]">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-black text-white">{deployment.name || deployment.project?.name || 'Untitled deployment'}</p>
                                        <p className="mt-2 truncate text-sm text-slate-400">{deployment.project?.repositoryUrl || 'Upload deployment'}</p>
                                    </div>
                                    <StatusBadge status={deployment.status} />
                                </div>
                                <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
                                    <Chip label="Source" value={getSourceType(deployment)} />
                                    <Chip label="Branch" value={getSourceType(deployment) === 'github' ? deployment.branch || deployment.project?.branch || 'main' : 'manual'} />
                                    <Chip label="Port" value={deployment.port ? String(deployment.port) : 'pending'} />
                                </div>
                                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                                    {deployment.project?.repositoryUrl?.startsWith('upload://') ? <PackagePlus size={14} /> : <Github size={14} />}
                                    <span className="truncate">{deployment.commitMessage || deployment.commitHash || 'No commit metadata yet'}</span>
                                </div>
                                <p className="mt-3 truncate font-mono text-xs text-cyan-200">{deployment.url || (deployment.vps?.ipAddress && deployment.port ? `http://${deployment.vps.ipAddress}:${deployment.port}` : 'URL pending')}</p>
                            </Panel>
                        </Link>
                    ))}
                </div>
            ) : (
                <EmptyState
                    title="No deployments found"
                    description="Deployments will appear here after you trigger a GitHub or file upload release."
                    action={<Link href="/deployments/new"><Button><Rocket size={16} /> Create deployment</Button></Link>}
                />
            )}
        </div>
    );
}

function Metric({ title, value, danger }: { title: string; value: number; danger?: boolean }) {
    return (
        <Panel>
            <p className="text-xs font-black uppercase text-slate-500">{title}</p>
            <p className={danger ? 'mt-2 text-3xl font-black text-rose-300' : 'mt-2 text-3xl font-black text-white'}>{value}</p>
        </Panel>
    );
}

function Chip({ label, value }: { label: string; value: string }) {
    return <span className="rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2"><span className="text-slate-600">{label}: </span>{value}</span>;
}

function normalizeStatus(status?: string) {
    return (status || 'idle').toLowerCase().replace('rolled_back', 'rolled_back');
}

function getSourceType(deployment: { sourceType?: string; project?: { repositoryUrl?: string | null } | null }) {
    return deployment.sourceType || (deployment.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
}
