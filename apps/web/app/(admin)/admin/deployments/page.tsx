'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Rocket, Search, Square, Trash2, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { AppModal } from '@/components/ui';
import { AdminTable, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminDeployments } from '@/hooks/useDeployForgeData';

const STATUSES = ['PENDING', 'BUILDING', 'RUNNING', 'FAILED', 'STOPPED'];
const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

export default function AdminDeploymentsPage() {
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const params = useMemo(() => ({ status }), [status]);
    const deployments = useAdminDeployments(params);
    const action = useAdminAction();

    const [confirmModal, setConfirmModal] = useState<{
        open: boolean; title: string; message: string; actionText: string;
        onConfirm: () => void; variant: 'primary' | 'secondary' | 'danger';
    }>({ open: false, title: '', message: '', actionText: '', onConfirm: () => {}, variant: 'primary' });

    const filtered = useMemo(() => {
        if (!search.trim()) return deployments.data || [];
        const q = search.toLowerCase();
        return (deployments.data || []).filter((d: any) =>
            (d.name || d.project?.name || d.id).toLowerCase().includes(q) ||
            (d.user?.email || '').toLowerCase().includes(q)
        );
    }, [deployments.data, search]);

    const running = (deployments.data || []).filter((d: any) => d.status === 'RUNNING').length;
    const failed = (deployments.data || []).filter((d: any) => d.status === 'FAILED').length;
    const total = deployments.data?.length ?? 0;

    const triggerStop = (id: string, name: string) => {
        setConfirmModal({
            open: true,
            title: 'Stop Deployment',
            message: `Are you sure you want to stop "${name}"?`,
            actionText: 'Stop Deployment',
            variant: 'danger',
            onConfirm: () => {
                action.mutate({ path: `/admin/deployments/${id}/stop` }, {
                    onSuccess: () => {
                        setConfirmModal(p => ({ ...p, open: false }));
                        deployments.refetch();
                    }
                });
            }
        });
    };

    const triggerRestart = (id: string, name: string) => {
        setConfirmModal({
            open: true,
            title: 'Restart Deployment',
            message: `Are you sure you want to restart "${name}"?`,
            actionText: 'Restart',
            variant: 'primary',
            onConfirm: () => {
                action.mutate({ path: `/admin/deployments/${id}/restart` }, {
                    onSuccess: () => {
                        setConfirmModal(p => ({ ...p, open: false }));
                        deployments.refetch();
                    }
                });
            }
        });
    };

    const triggerDelete = (id: string, name: string) => {
        setConfirmModal({
            open: true,
            title: 'Delete Deployment',
            message: `Permanently delete deployment "${name}"?`,
            actionText: 'Delete',
            variant: 'danger',
            onConfirm: () => {
                action.mutate({ method: 'delete', path: `/admin/deployments/${id}` }, {
                    onSuccess: () => {
                        setConfirmModal(p => ({ ...p, open: false }));
                        deployments.refetch();
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
                        Platform Deployments
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Monitor, filter, restart, or terminate build & container releases across all developer accounts.
                    </p>
                </div>
                <button
                    onClick={() => deployments.refetch()}
                    disabled={deployments.isRefetching}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                    <RefreshCw size={13} className={deployments.isRefetching ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {deployments.isError && <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">{(deployments.error as Error)?.message}</div>}

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Total Deployments</p>
                    <p className="text-2xl font-bold text-white mt-1">{deployments.isLoading ? '—' : total}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Currently Running</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{deployments.isLoading ? '—' : running}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Failed Releases</p>
                    <p className={clsx('text-2xl font-bold mt-1', failed > 0 ? 'text-rose-400' : 'text-[#666666]')}>{deployments.isLoading ? '—' : failed}</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search release name or user email..."
                    className={clsx(INPUT_STYLE, 'flex-1')}
                />
                <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className={clsx(INPUT_STYLE, 'sm:w-44')}
                >
                    <option value="">All Statuses</option>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* Deployments Table */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                <AdminTable
                    columns={['Deployment', 'User', 'Target VPS', 'Status', 'Updated', 'Actions']}
                    empty="No deployment records found."
                    rows={deployments.isLoading ? undefined : filtered.map((d: any) => {
                        const name = d.name || d.project?.name || d.id.slice(0, 10);
                        return [
                            <div key="d">
                                <p className="font-bold text-white text-xs">{name}</p>
                                <p className="text-[10px] text-[#666666]">{d.id.slice(0, 16)}</p>
                            </div>,
                            <span key="u" className="text-[#A1A1A1]">{d.user?.email || 'System'}</span>,
                            <span key="v" className="text-[#A1A1A1]">{d.vps?.name || '—'}</span>,
                            <StatusBadge key="s" status={d.status} />,
                            <span key="t" className="text-[#666666]">{formatDate(d.updatedAt || d.createdAt)}</span>,
                            <div key="act" className="flex items-center gap-1">
                                <button onClick={() => triggerRestart(d.id, name)} className="h-6 w-6 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white" title="Restart">
                                    <RotateCcw size={11} />
                                </button>
                                <button onClick={() => triggerStop(d.id, name)} className="h-6 w-6 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white" title="Stop">
                                    <Square size={11} />
                                </button>
                                <button onClick={() => triggerDelete(d.id, name)} className="h-6 w-6 flex items-center justify-center rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30" title="Delete">
                                    <Trash2 size={11} />
                                </button>
                            </div>,
                        ];
                    }) || []}
                />
            </div>

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
