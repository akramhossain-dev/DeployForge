'use client';

import { CheckCircle2, Github, GitBranch, Lock, RefreshCw, Rocket, Unlock, XCircle, Search, Loader2 } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useGitHubProfile, useRepositories, useSyncRepositories } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import Link from 'next/link';
import { formatDate } from '@/components/ui';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

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
            const response = await api.get<{ url: string }>('/auth/github/connect');
            window.location.href = response.url;
        } catch (err: any) {
            setConnectError(err.message || 'Unable to start GitHub OAuth authorization flow.');
        } finally {
            setIsConnecting(false);
        }
    }

    const filtered = (repos.data || []).filter(r =>
        !search.trim() || r.fullName.toLowerCase().includes(search.trim().toLowerCase())
    );

    const webhookReady = repos.data?.filter(r => r.webhookId).length || 0;

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        GitHub Repositories
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Synced GitHub repositories for automated release triggers, branch builds, and webhooks.
                    </p>
                </div>
                <div>
                    {profile.data ? (
                        <button
                            onClick={() => sync.mutate()}
                            disabled={sync.isPending}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white transition-colors hover:bg-[#1A1A1A] disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={sync.isPending ? 'animate-spin' : ''} />
                            <span>{sync.isPending ? 'Syncing...' : 'Sync Repositories'}</span>
                        </button>
                    ) : (
                        <button
                            onClick={connectGitHub}
                            disabled={isConnecting}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-3 font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {isConnecting ? <Loader2 size={13} className="animate-spin" /> : <Github size={13} />}
                            <span>Connect GitHub</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Error banners */}
            {connectError && (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                    GitHub Connect Error: {connectError}
                </div>
            )}

            {/* GitHub profile status banner */}
            {profile.data && (
                <div className="flex items-center justify-between rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <div className="flex items-center gap-3">
                        {profile.data.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.data.avatarUrl} alt="GitHub User Profile Avatar" className="h-8 w-8 rounded-full border border-[#1F1F1F]" />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-white">
                                <Github size={15} />
                            </div>
                        )}
                        <div>
                            <p className="font-bold text-white">@{profile.data.username}</p>
                            <p className="text-[11px] text-[#A1A1A1]">{profile.data.email || 'No public email'} · Connected</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded border border-[#1F1F1F] bg-[#000000] px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                        <CheckCircle2 size={11} /> Connected
                    </span>
                </div>
            )}

            {/* Stats Overview */}
            {profile.data && repos.data?.length ? (
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                        <p className="text-[10px] uppercase text-[#666666]">TOTAL REPOS</p>
                        <p className="text-2xl font-bold text-white">{repos.data.length}</p>
                    </div>
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                        <p className="text-[10px] uppercase text-[#666666]">WEBHOOK READY</p>
                        <p className="text-2xl font-bold text-emerald-400">{webhookReady}</p>
                    </div>
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                        <p className="text-[10px] uppercase text-[#666666]">PENDING WEBHOOK</p>
                        <p className="text-2xl font-bold text-[#A1A1A1]">{repos.data.length - webhookReady}</p>
                    </div>
                </div>
            ) : null}

            {/* Search toolbar */}
            {repos.data?.length ? (
                <div className="relative">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search synced repositories..."
                        className={INPUT_STYLE}
                    />
                </div>
            ) : null}

            {/* Repository grid */}
            {profile.isLoading || repos.isLoading ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-36 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                    ))}
                </div>
            ) : filtered.length ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {filtered.map((repo) => (
                        <div key={repo.id} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4 hover:border-[#333333] transition-colors flex flex-col justify-between">
                            <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2 border-b border-[#1F1F1F] pb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Github size={14} className="text-white shrink-0" />
                                        <p className="font-bold text-white text-sm truncate">{repo.fullName}</p>
                                    </div>
                                    <span className="text-[#666666] shrink-0">{repo.private ? <Lock size={13} /> : <Unlock size={13} />}</span>
                                </div>
                                <p className="text-[#A1A1A1] text-xs leading-relaxed line-clamp-2">
                                    {repo.description || 'No description provided.'}
                                </p>
                            </div>

                            {/* Tags */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F1F1F] pt-3">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded border border-[#1F1F1F] bg-[#000000] px-2 py-0.5 text-[10px] text-[#A1A1A1]">
                                        <GitBranch size={10} /> {repo.defaultBranch}
                                    </span>
                                    {repo.webhookId ? (
                                        <span className="inline-flex items-center gap-1 rounded border border-[#1F1F1F] bg-[#000000] px-2 py-0.5 text-[10px] text-emerald-400">
                                            <CheckCircle2 size={10} /> Webhook Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded border border-[#1F1F1F] bg-[#000000] px-2 py-0.5 text-[10px] text-[#666666]">
                                            <XCircle size={10} /> No Webhook
                                        </span>
                                    )}
                                </div>

                                <Link href={`/deployments/new?repo=${encodeURIComponent(repo.fullName)}&branch=${encodeURIComponent(repo.defaultBranch)}`}>
                                    <button className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-white px-3 text-[11px] font-semibold text-black hover:bg-[#E5E5E5] transition-colors">
                                        <Rocket size={12} />
                                        <span>Deploy</span>
                                    </button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center text-[#666666]">
                    <Github size={24} className="mx-auto mb-2 text-[#666666]" />
                    <p className="text-white font-semibold">
                        {profile.data ? (search ? 'No matching repositories found' : 'No repositories synced') : 'GitHub is not connected'}
                    </p>
                    <p className="mt-1 text-xs">
                        {profile.data ? 'Run sync to pull latest repositories from GitHub.' : 'Connect your GitHub account to sync repositories.'}
                    </p>
                    {profile.data ? (
                        <button
                            onClick={() => sync.mutate()}
                            disabled={sync.isPending}
                            className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-4 font-semibold text-black hover:bg-[#E5E5E5]"
                        >
                            <RefreshCw size={13} className={sync.isPending ? 'animate-spin' : ''} />
                            <span>Sync Repositories</span>
                        </button>
                    ) : (
                        <button
                            onClick={connectGitHub}
                            disabled={isConnecting}
                            className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-4 font-semibold text-black hover:bg-[#E5E5E5]"
                        >
                            <Github size={13} />
                            <span>Connect GitHub</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
