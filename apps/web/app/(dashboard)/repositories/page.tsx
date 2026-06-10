'use client';

import { Github, Lock, RefreshCw, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, formatDate } from '@/components/ui';
import { useGitHubProfile, useRepositories, useSyncRepositories } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';

export default function RepositoriesPage() {
    const profile = useGitHubProfile();
    const repos = useRepositories(!!profile.data);
    const sync = useSyncRepositories();
    const [connectError, setConnectError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    async function connectGitHub() {
        setConnectError(null);
        setIsConnecting(true);
        try {
            const response = await api.get<{ url: string }>('/github/connect');
            window.location.href = response.url;
        } catch (err: any) {
            setConnectError(err.message || 'Unable to start GitHub OAuth.');
        } finally {
            setIsConnecting(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Repositories"
                description="GitHub repositories synced into DeployForge for deployment selection and webhook setup."
                action={
                    profile.data ? (
                        <Button variant="secondary" onClick={() => sync.mutate()} loading={sync.isPending}>
                            <RefreshCw size={16} /> Sync
                        </Button>
                    ) : (
                        <Button onClick={connectGitHub} loading={isConnecting}>
                            <Github size={16} /> Connect GitHub
                        </Button>
                    )
                }
            />

            {connectError ? (
                <ErrorState title="GitHub connect failed" message={connectError} />
            ) : profile.isError ? (
                <ErrorState message={(profile.error as Error)?.message} onRetry={() => profile.refetch()} />
            ) : sync.isError ? (
                <ErrorState title="Repository sync failed" message={(sync.error as Error)?.message} onRetry={() => sync.mutate()} />
            ) : repos.isError ? (
                <ErrorState message={(repos.error as Error)?.message} onRetry={() => repos.refetch()} />
            ) : profile.isLoading || repos.isLoading ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-28" />)}
                </div>
            ) : repos.data?.length ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {repos.data.map((repo) => (
                        <Panel key={repo.id}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="truncate font-bold text-white">{repo.fullName}</p>
                                    <p className="mt-2 line-clamp-2 text-sm text-slate-400">{repo.description || 'No description provided.'}</p>
                                </div>
                                <span className="shrink-0 text-slate-400">{repo.private ? <Lock size={16} /> : <Unlock size={16} />}</span>
                            </div>
                            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
                                <span className="rounded-full bg-slate-800 px-2.5 py-1">Branch: {repo.defaultBranch}</span>
                                <span className="rounded-full bg-slate-800 px-2.5 py-1">{repo.webhookId ? 'Webhook ready' : 'Webhook missing'}</span>
                                <span className="rounded-full bg-slate-800 px-2.5 py-1">Updated {formatDate(repo.updatedAt)}</span>
                            </div>
                        </Panel>
                    ))}
                </div>
            ) : (
                <EmptyState
                    title={profile.data ? 'No repositories synced' : 'GitHub is not connected'}
                    description={profile.data ? 'Run sync to pull your latest repositories from GitHub.' : 'Connect your GitHub account before syncing repositories.'}
                    action={profile.data ? <Button onClick={() => sync.mutate()} loading={sync.isPending}>Sync repositories</Button> : <Button onClick={connectGitHub} loading={isConnecting}><Github size={16} /> Connect GitHub</Button>}
                />
            )}
        </div>
    );
}
