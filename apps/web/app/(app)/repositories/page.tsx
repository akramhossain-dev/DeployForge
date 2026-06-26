'use client';

import { CheckCircle2, Github, GitBranch, GitFork, Lock, RefreshCw, Rocket, Unlock, XCircle } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, formatDate, inputClassName } from '@/components/ui';
import { useGitHubProfile, useRepositories, useSyncRepositories } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import Link from 'next/link';

export default function RepositoriesPage() {
    const profile = useGitHubProfile();
    const repos = useRepositories(!!profile.data);
    const sync = useSyncRepositories();
    const [connectError, setConnectError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [search, setSearch] = useState('');

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

    const filtered = (repos.data || []).filter(r =>
        !search.trim() || r.fullName.toLowerCase().includes(search.trim().toLowerCase())
    );

    const webhookReady = repos.data?.filter(r => r.webhookId).length || 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Repositories"
                description="GitHub repositories synced into DeployForge for deployment selection and webhook setup."
                action={
                    profile.data ? (
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => sync.mutate()} loading={sync.isPending}>
                                <RefreshCw size={15} /> Sync
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={connectGitHub} loading={isConnecting}>
                            <Github size={15} /> Connect GitHub
                        </Button>
                    )
                }
            />

            {connectError  ? <ErrorState title="GitHub connect failed" message={connectError} /> : null}
            {profile.isError ? <ErrorState message={(profile.error as Error)?.message} onRetry={() => profile.refetch()} /> : null}
            {sync.isError    ? <ErrorState title="Sync failed" message={(sync.error as Error)?.message} onRetry={() => sync.mutate()} /> : null}
            {repos.isError   ? <ErrorState message={(repos.error as Error)?.message} onRetry={() => repos.refetch()} /> : null}

            {/* Stats row */}
            {profile.data && repos.data?.length ? (
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Total Repos',    value: repos.data.length,                         accent: 'bg-gradient-to-r from-violet-400/30 to-transparent' },
                        { label: 'Webhook Ready',  value: webhookReady,                              accent: 'bg-gradient-to-r from-emerald-400/30 to-transparent' },
                        { label: 'No Webhook',     value: repos.data.length - webhookReady,          accent: 'bg-gradient-to-r from-amber-400/20 to-transparent' },
                    ].map(({ label, value, accent }) => (
                        <Panel key={label} className="relative overflow-hidden py-4">
                            <div className={clsx('absolute inset-x-0 top-0 h-0.5', accent)} />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                            <p className="mt-2 text-3xl font-black text-white">{value}</p>
                        </Panel>
                    ))}
                </div>
            ) : null}

            {/* GitHub profile banner */}
            {profile.data ? (
                <Panel className="py-3">
                    <div className="flex items-center gap-3">
                        {profile.data.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.data.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-white/10" />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-300/20 bg-violet-300/10 text-violet-300"><Github size={15} /></div>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-white">@{profile.data.username}</p>
                            <p className="text-[11px] text-slate-500">{profile.data.email || 'No public email'} · GitHub connected</p>
                        </div>
                        <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 text-[11px] font-black text-emerald-300">
                            <CheckCircle2 size={11} /> Connected
                        </span>
                    </div>
                </Panel>
            ) : null}

            {/* Search */}
            {repos.data?.length ? (
                <Panel className="py-3">
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search repositories…"
                        className={inputClassName}
                    />
                </Panel>
            ) : null}

            {/* Repo grid */}
            {profile.isLoading || repos.isLoading ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-32" />)}
                </div>
            ) : filtered.length ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {filtered.map(repo => (
                        <Panel key={repo.id} className="group transition-all hover:border-violet-300/20 hover:bg-violet-300/[0.03]">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-slate-400">
                                    <Github size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="truncate font-black text-white">{repo.fullName}</p>
                                        <span className="shrink-0 text-slate-500">{repo.private ? <Lock size={14} /> : <Unlock size={14} />}</span>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                        {repo.description || 'No description provided.'}
                                    </p>
                                </div>
                            </div>

                            {/* Chips */}
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-slate-400">
                                    <GitBranch size={10} />{repo.defaultBranch}
                                </span>
                                {repo.webhookId ? (
                                    <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                                        <CheckCircle2 size={10} />Webhook ready
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 rounded-full border border-amber-400/15 bg-amber-400/5 px-2.5 py-1 text-[10px] font-black text-amber-400/70">
                                        <XCircle size={10} />No webhook
                                    </span>
                                )}
                                <span className="ml-auto text-[10px] text-slate-600">{formatDate(repo.updatedAt)}</span>
                            </div>

                            {/* Action row */}
                            <div className="mt-4 border-t border-white/[0.05] pt-3">
                                <Link href={`/deployments/new`}>
                                    <Button variant="secondary" className="h-8 text-xs w-full">
                                        <Rocket size={13} /> Deploy this repo
                                    </Button>
                                </Link>
                            </div>
                        </Panel>
                    ))}
                </div>
            ) : (
                <EmptyState
                    title={profile.data ? (search ? 'No matches found' : 'No repositories synced') : 'GitHub is not connected'}
                    description={profile.data ? (search ? 'Try a different search term.' : 'Run sync to pull your latest repositories from GitHub.') : 'Connect your GitHub account before syncing repositories.'}
                    action={profile.data
                        ? <Button onClick={() => sync.mutate()} loading={sync.isPending}><RefreshCw size={15} /> Sync repositories</Button>
                        : <Button onClick={connectGitHub} loading={isConnecting}><Github size={15} /> Connect GitHub</Button>}
                />
            )}
        </div>
    );
}
