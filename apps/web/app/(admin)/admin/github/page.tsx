'use client';

import { useMemo, useState } from 'react';
import { Github, RefreshCw, XCircle } from 'lucide-react';
import { formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminGithubAccounts } from '@/hooks/useDeployForgeData';

export default function AdminGithubPage() {
    const accounts = useAdminGithubAccounts();
    const action = useAdminAction();

    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        actionText: string;
        onConfirm: () => void;
        variant: 'primary' | 'secondary' | 'danger';
    }>({
        open: false,
        title: '',
        message: '',
        actionText: '',
        onConfirm: () => {},
        variant: 'primary',
    });

    const connected = accounts.data?.length ?? 0;
    const totalRepos = accounts.data?.reduce((s, a) => s + a.repositories.length, 0) ?? 0;

    const triggerSync = (userId: string, username: string) => {
        setConfirmModal({
            open: true,
            title: 'Sync GitHub Account',
            message: `Force refetch repositories for @${username}?`,
            actionText: 'Sync Account',
            variant: 'primary',
            onConfirm: () => {
                action.mutate({ path: `/admin/github/accounts/${userId}/sync` }, {
                    onSuccess: () => {
                        setConfirmModal(prev => ({ ...prev, open: false }));
                        accounts.refetch();
                    }
                });
            }
        });
    };

    const triggerDisconnect = (userId: string, username: string) => {
        setConfirmModal({
            open: true,
            title: 'Disconnect GitHub Account',
            message: `Remove GitHub integration for @${username}?`,
            actionText: 'Disconnect',
            variant: 'danger',
            onConfirm: () => {
                action.mutate({ method: 'delete', path: `/admin/github/accounts/${userId}` }, {
                    onSuccess: () => {
                        setConfirmModal(prev => ({ ...prev, open: false }));
                        accounts.refetch();
                    }
                });
            }
        });
    };

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        GitHub App Integration
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Platform GitHub OAuth accounts, connected repository stats, and forced sync triggers.
                    </p>
                </div>
                <button
                    onClick={() => accounts.refetch()}
                    disabled={accounts.isRefetching}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                    <RefreshCw size={13} className={accounts.isRefetching ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {accounts.isError && <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">{(accounts.error as Error)?.message}</div>}

            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Connected Accounts</p>
                    <p className="text-2xl font-bold text-white mt-1">{accounts.isLoading ? '—' : connected}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Total Synced Repos</p>
                    <p className="text-2xl font-bold text-white mt-1">{accounts.isLoading ? '—' : totalRepos}</p>
                </div>
            </div>

            {/* Account Grid */}
            {!accounts.isLoading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(accounts.data || []).map(account => {
                        const repoCount = account.repositories.length;
                        const userId = account.user?.id;

                        return (
                            <div key={account.id ?? account.username} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                                <div className="flex items-center gap-3 border-b border-[#1F1F1F] pb-3">
                                    <Github size={18} className="text-white shrink-0" />
                                    <div className="min-w-0">
                                        <p className="font-bold text-white">@{account.username}</p>
                                        <p className="text-[10px] text-[#666666] truncate">{account.user?.email || 'System User'}</p>
                                    </div>
                                </div>

                                <div className="space-y-1 text-[#A1A1A1]">
                                    <p><span className="text-[#666666] font-semibold uppercase text-[10px]">Synced Repos:</span> {repoCount}</p>
                                    <p><span className="text-[#666666] font-semibold uppercase text-[10px]">Connected At:</span> {formatDate(account.connectedAt)}</p>
                                </div>

                                <div className="flex gap-2 pt-2 border-t border-[#1F1F1F]">
                                    <button
                                        onClick={() => userId && triggerSync(userId, account.username)}
                                        className="flex-1 h-7 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]"
                                    >
                                        Force Sync
                                    </button>
                                    <button
                                        onClick={() => userId && triggerDisconnect(userId, account.username)}
                                        className="h-7 px-3 rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                        <h3 className="text-sm font-bold text-white">{confirmModal.title}</h3>
                        <p className="text-[#A1A1A1]">{confirmModal.message}</p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-[#1F1F1F]">
                            <button onClick={() => setConfirmModal(p => ({ ...p, open: false }))} className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white">Cancel</button>
                            <button onClick={confirmModal.onConfirm} className="h-8 px-3 rounded border border-rose-900/40 bg-rose-950/40 text-rose-300 font-semibold">Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
