'use client';

import { CheckCircle2, Github, Loader2, RefreshCw, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { ErrorState, PageHeader, SkeletonBlock } from '@/components/ui';
import { formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminGithubAccounts } from '@/hooks/useDeployForgeData';

export default function AdminGithubPage() {
    const accounts = useAdminGithubAccounts();
    const action   = useAdminAction();
    const connected  = accounts.data?.length ?? 0;
    const totalRepos = accounts.data?.reduce((s, a) => s + a.repositories.length, 0) ?? 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="GitHub Management"
                description="Connected accounts, repositories, forced sync, and connection removal."
                action={
                    <button onClick={() => accounts.refetch()} disabled={accounts.isRefetching}
                        className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-bold text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50">
                        {accounts.isRefetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </button>
                }
            />

            {accounts.isError && <ErrorState message={(accounts.error as Error)?.message} onRetry={() => accounts.refetch()} />}
            {action.isError   && <ErrorState title="Action failed" message={(action.error as Error)?.message} />}

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {[
                    { label: 'Connected Accounts', value: connected,  cls: 'border-violet-400/20 bg-violet-400/[0.06]', val: 'text-violet-300' },
                    { label: 'Total Repositories',  value: totalRepos, cls: 'border-white/[0.08] bg-white/[0.03]',        val: 'text-white'      },
                ].map(k => (
                    <div key={k.label} className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${k.cls}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{k.label}</p>
                        <p className={`mt-2 text-3xl font-black sm:text-4xl ${k.val}`}>{accounts.isLoading ? '—' : k.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Loading ── */}
            {accounts.isLoading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-52 rounded-2xl" />)}
                </div>
            )}

            {/* ── Empty ── */}
            {!accounts.isLoading && !accounts.data?.length && (
                <div className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-slate-900/50 py-16 text-center">
                    <Github size={36} className="text-slate-600" />
                    <p className="mt-4 font-black text-slate-300">No GitHub accounts connected.</p>
                </div>
            )}

            {/* ── Account cards ── */}
            {!accounts.isLoading && accounts.data?.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {accounts.data.map(account => {
                        const repoCount    = account.repositories.length;
                        const privateCount = account.repositories.filter(r => r.private).length;
                        const publicCount  = repoCount - privateCount;

                        return (
                            <div key={account.id ?? account.username}
                                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/80 to-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300 hover:border-violet-400/30 hover:shadow-[0_0_32px_-8px_theme(colors.violet.400/15)]">

                                {/* Top stripe */}
                                <div className="h-0.5 bg-gradient-to-r from-violet-400/60 via-violet-400/15 to-transparent" />

                                <div className="flex flex-1 flex-col p-5">
                                    {/* Avatar + identity */}
                                    <div className="flex items-center gap-3">
                                        {account.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={account.avatarUrl} alt=""
                                                className="h-12 w-12 shrink-0 rounded-2xl border border-white/10 object-cover shadow-md" />
                                        ) : (
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10">
                                                <Github size={22} className="text-violet-300" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-black text-white">@{account.username}</p>
                                            <p className="truncate text-xs text-slate-500">{account.email || 'No public email'}</p>
                                            <p className="truncate text-[10px] text-slate-600">{account.user?.email || 'Unknown user'}</p>
                                        </div>
                                    </div>

                                    {/* Stat mini-grid */}
                                    <div className="mt-4 grid grid-cols-3 gap-2">
                                        {[
                                            { label: 'Total',   value: repoCount,    cls: 'border-white/[0.08] bg-white/[0.03]'        },
                                            { label: 'Private', value: privateCount,  cls: 'border-amber-400/15 bg-amber-400/[0.05]'   },
                                            { label: 'Public',  value: publicCount,   cls: 'border-emerald-400/15 bg-emerald-400/[0.05]' },
                                        ].map(stat => (
                                            <div key={stat.label} className={clsx('rounded-xl border p-2.5 text-center', stat.cls)}>
                                                <p className="text-lg font-black text-white">{stat.value}</p>
                                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-600">{stat.label}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Spacer */}
                                    <div className="flex-1" />

                                    {/* Footer */}
                                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                                            <CheckCircle2 size={10} />
                                            <span className="font-black">Connected</span>
                                            {formatDate(account.connectedAt) !== '—' && (
                                                <span className="text-slate-600">· {formatDate(account.connectedAt)}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button
                                                title="Force Sync"
                                                onClick={() => action.mutate({ path: `/admin/github/accounts/${account.user?.id}/sync` })}
                                                className="flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-black text-slate-400 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                                            >
                                                <RefreshCw size={10} /> Sync
                                            </button>
                                            <button
                                                title="Disconnect"
                                                onClick={() => action.mutate({ method: 'delete', path: `/admin/github/accounts/${account.user?.id}` })}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/[0.07] text-rose-400/70 transition-all hover:border-rose-400/50 hover:bg-rose-400/15 hover:text-rose-300"
                                            >
                                                <XCircle size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {!accounts.isLoading && connected > 0 && (
                <p className="text-center text-[11px] text-slate-600">
                    <span className="font-black text-slate-400">{connected}</span> account{connected !== 1 ? 's' : ''} ·{' '}
                    <span className="font-black text-slate-400">{totalRepos}</span> repositories
                </p>
            )}
        </div>
    );
}
