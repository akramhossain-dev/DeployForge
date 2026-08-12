'use client';

import { useState } from 'react';
import {
    Activity, Cpu, HardDrive, Info, Loader2,
    MemoryStick, RefreshCw, Server, Trash2, User, WifiOff,
    CheckCircle2, XCircle, Clock, BarChart2
} from 'lucide-react';
import clsx from 'clsx';
import { AppModal } from '@/components/ui';
import { StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import {
    useAdminAction,
    useAdminVps,
    useAdminVpsLiveMetrics,
    useAdminVpsServerInfo,
    useAdminTestVpsConnection,
    useAdminVpsHealthHistory,
} from '@/hooks/useDeployForgeData';
import LiveMonitorTab from '@/app/(app)/vps/LiveMonitorTab';
import ServerInfoTab from '@/app/(app)/vps/ServerInfoTab';
import HistoryMonitorTab from '@/app/(app)/vps/HistoryMonitorTab';

export default function AdminVpsPage() {
    const vps = useAdminVps();
    const action = useAdminAction();
    const testConn = useAdminTestVpsConnection();

    const [monitorVps, setMonitorVps] = useState<any | null>(null);
    const [infoVps, setInfoVps] = useState<any | null>(null);
    const [historyVps, setHistoryVps] = useState<any | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

    const [confirmModal, setConfirmModal] = useState<{
        open: boolean; title: string; message: string; actionText: string;
        onConfirm: () => void; variant: 'primary' | 'secondary' | 'danger';
    }>({ open: false, title: '', message: '', actionText: '', onConfirm: () => {}, variant: 'danger' });

    const total = vps.data?.length ?? 0;
    const active = vps.data?.filter((s: any) => String(s.status).toLowerCase() === 'active').length ?? 0;
    const offline = total - active;

    const handleTestConnection = async (id: string) => {
        setTestingId(id);
        try { await testConn.mutateAsync(id); }
        finally { setTestingId(null); }
    };

    const triggerRemove = (id: string, name: string) => {
        setConfirmModal({
            open: true,
            title: 'Remove VPS Server',
            message: `Permanently delete "${name}" and all associated deployments from DeployForge?`,
            actionText: 'Remove Server',
            variant: 'danger',
            onConfirm: () => {
                action.mutate({ method: 'delete', path: `/admin/vps/${id}` }, {
                    onSuccess: () => {
                        setConfirmModal(p => ({ ...p, open: false }));
                        vps.refetch();
                    },
                });
            },
        });
    };

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        VPS Node Fleet
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Monitor platform-wide server node status, telemetry streams, and hardware metrics.
                    </p>
                </div>
                <button
                    onClick={() => vps.refetch()}
                    disabled={vps.isRefetching}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                    <RefreshCw size={13} className={vps.isRefetching ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {vps.isError && <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">{(vps.error as Error)?.message}</div>}

            {/* KPI Cards Strip */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Total Fleet Nodes</p>
                    <p className="text-2xl font-bold text-white mt-1">{vps.isLoading ? '—' : total}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Active Online</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{vps.isLoading ? '—' : active}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Offline / Error</p>
                    <p className={clsx('text-2xl font-bold mt-1', offline > 0 ? 'text-rose-400' : 'text-[#666666]')}>{vps.isLoading ? '—' : offline}</p>
                </div>
            </div>

            {/* Server Grid */}
            {!vps.isLoading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(vps.data || []).map((server: any) => {
                        const isOnline = String(server.status).toLowerCase() === 'active';
                        return (
                            <div key={server.id} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Server size={14} className={isOnline ? 'text-emerald-400' : 'text-rose-400'} />
                                        <div className="min-w-0">
                                            <p className="font-bold text-white truncate">{server.name}</p>
                                            <p className="text-[10px] text-[#666666] truncate">{server.ipAddress}:{server.port}</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={server.status} />
                                </div>

                                <div className="space-y-1 text-[#A1A1A1]">
                                    <p><span className="text-[#666666] font-semibold uppercase text-[10px]">Owner:</span> {server.user?.email || 'System'}</p>
                                    <p><span className="text-[#666666] font-semibold uppercase text-[10px]">Checked:</span> {formatDate(server.updatedAt)}</p>
                                </div>

                                <div className="flex gap-2 pt-2 border-t border-[#1F1F1F]">
                                    <button onClick={() => setInfoVps(server)} className="flex-1 h-7 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">
                                        Info
                                    </button>
                                    <button onClick={() => setMonitorVps(server)} className="flex-1 h-7 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">
                                        Live
                                    </button>
                                    <button onClick={() => handleTestConnection(server.id)} disabled={testingId === server.id} className="flex-1 h-7 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">
                                        Test
                                    </button>
                                    <button onClick={() => triggerRemove(server.id, server.name)} className="h-7 w-7 flex items-center justify-center rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            {confirmModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                        <h3 className="text-sm font-bold text-white">{confirmModal.title}</h3>
                        <p className="text-[#A1A1A1]">{confirmModal.message}</p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-[#1F1F1F]">
                            <button onClick={() => setConfirmModal(p => ({ ...p, open: false }))} className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white">Cancel</button>
                            <button onClick={confirmModal.onConfirm} className="h-8 px-3 rounded border border-rose-900/40 bg-rose-950/40 text-rose-300 font-semibold">Confirm Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
