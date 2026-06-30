'use client';

import { useState } from 'react';
import {
    Activity, Cpu, HardDrive, Info, Loader2,
    MemoryStick, RefreshCw, Server, Trash2, User, WifiOff,
    CheckCircle2, XCircle, Clock, BarChart2
} from 'lucide-react';
import clsx from 'clsx';
import { ErrorState, PageHeader, SkeletonBlock, AppModal, Button } from '@/components/ui';
import { ResourceBars, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
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

// ── Radial progress ring ──────────────────────────────────────────────────────
function MetricRing({ value, color }: { value: number; color: string }) {
    const r = 20, circ = 2 * Math.PI * r;
    const pct = Math.min(Math.max(value, 0), 100);
    return (
        <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
            <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
                strokeLinecap="round" strokeDasharray={circ}
                strokeDashoffset={circ - (pct / 100) * circ}
                style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
    );
}

function MetricRingCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative">
                <MetricRing value={value} color={color} />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-white rotate-90">
                    {Math.round(value)}%
                </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        </div>
    );
}

// ── KPI stat card ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, valueClass, borderClass }: {
    label: string; value: React.ReactNode; valueClass: string; borderClass: string;
}) {
    return (
        <div className={clsx('relative overflow-hidden rounded-2xl border p-4 sm:p-5 backdrop-blur-sm', borderClass)}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-white/10 to-transparent" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className={clsx('mt-2 text-3xl font-black sm:text-4xl', valueClass)}>{value}</p>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminVpsPage() {
    const vps      = useAdminVps();
    const action   = useAdminAction();
    const testConn = useAdminTestVpsConnection();

    const [monitorVps, setMonitorVps] = useState<any | null>(null);
    const [infoVps,    setInfoVps]    = useState<any | null>(null);
    const [historyVps, setHistoryVps] = useState<any | null>(null);
    const [testingId,  setTestingId]  = useState<string | null>(null);

    const [confirmModal, setConfirmModal] = useState<{
        open: boolean; title: string; message: string; actionText: string;
        onConfirm: () => void; variant: 'primary' | 'secondary' | 'danger';
    }>({ open: false, title: '', message: '', actionText: '', onConfirm: () => {}, variant: 'danger' });

    const total   = vps.data?.length ?? 0;
    const active  = vps.data?.filter(s => s.status.toLowerCase() === 'active').length ?? 0;
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
            message: `Are you sure you want to permanently remove "${name}"? This will delete all associated deployments and data from DeployForge.`,
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
        <div className="space-y-6">
            {/* ── Header ── */}
            <PageHeader
                title="VPS Management"
                description="Fleet health, resource usage, active containers, ownership, and controls."
                action={
                    <Button variant="secondary" onClick={() => vps.refetch()} disabled={vps.isRefetching}>
                        {vps.isRefetching
                            ? <Loader2 size={14} className="animate-spin" />
                            : <RefreshCw size={14} />}
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                }
            />

            {/* ── Error states ── */}
            {vps.isError    && <ErrorState message={(vps.error as Error)?.message} onRetry={() => vps.refetch()} />}
            {action.isError && <ErrorState title="Action failed" message={(action.error as Error)?.message} />}

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-3 gap-3">
                <KpiCard
                    label="Total Servers" value={vps.isLoading ? '—' : total}
                    valueClass="text-white"
                    borderClass="border-white/[0.08] bg-white/[0.03]"
                />
                <KpiCard
                    label="Active" value={vps.isLoading ? '—' : active}
                    valueClass="text-emerald-300"
                    borderClass="border-emerald-400/20 bg-emerald-400/[0.05]"
                />
                <KpiCard
                    label="Offline" value={vps.isLoading ? '—' : offline}
                    valueClass={offline > 0 ? 'text-rose-300' : 'text-slate-500'}
                    borderClass={offline > 0 ? 'border-rose-400/25 bg-rose-400/[0.05]' : 'border-white/[0.08] bg-white/[0.03]'}
                />
            </div>

            {/* ── Skeletons ── */}
            {vps.isLoading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonBlock key={i} className="h-72 rounded-2xl" />
                    ))}
                </div>
            )}

            {/* ── Empty ── */}
            {!vps.isLoading && !vps.data?.length && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-slate-900/40 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04]">
                        <Server size={28} className="text-slate-600" />
                    </div>
                    <div>
                        <p className="font-black text-slate-300">No servers in the fleet</p>
                        <p className="mt-1 text-xs text-slate-600">Users can add VPS servers from their dashboard.</p>
                    </div>
                </div>
            )}

            {/* ── Server cards ── */}
            {!vps.isLoading && (vps.data?.length ?? 0) > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {vps.data!.map(server => {
                        const h        = server.healthRecords?.[0];
                        const m        = server.systemMetrics?.[0];
                        const isOnline = server.status.toLowerCase() === 'active';
                        const cpu      = Math.round(h?.cpuUsage    || 0);
                        const ram      = Math.round(h?.memoryUsage || 0);
                        const disk     = Math.round(h?.diskUsage   || 0);

                        return (
                            <div
                                key={server.id}
                                className={clsx(
                                    'group flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-900/80 to-slate-950/90 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300',
                                    isOnline
                                        ? 'border-white/[0.08] hover:border-emerald-400/25 hover:shadow-[0_0_40px_-10px_theme(colors.emerald.400/10)]'
                                        : 'border-white/[0.08] hover:border-rose-400/20'
                                )}
                            >
                                {/* Status stripe */}
                                <div className={clsx('h-[3px] bg-gradient-to-r to-transparent',
                                    isOnline ? 'from-emerald-400/80 via-emerald-400/20' : 'from-rose-500/60 via-rose-400/10'
                                )} />

                                <div className="flex flex-1 flex-col p-4 sm:p-5">
                                    {/* ── Card header ── */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={clsx(
                                                'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                                                isOnline
                                                    ? 'border-emerald-400/20 bg-emerald-400/10'
                                                    : 'border-rose-400/20 bg-rose-400/10'
                                            )}>
                                                <Server size={17} className={isOnline ? 'text-emerald-300' : 'text-rose-300'} />
                                                <span className={clsx(
                                                    'absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950',
                                                    isOnline ? 'bg-emerald-400' : 'bg-rose-400'
                                                )} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-white leading-tight">{server.name}</p>
                                                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                                                    {server.ipAddress}:{server.port}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusBadge status={server.status} />
                                    </div>

                                    {/* ── Owner row ── */}
                                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                                        <User size={11} className="shrink-0 text-slate-600" />
                                        <span className="truncate text-[11px] text-slate-400">
                                            {server.user?.name
                                                ? <><span className="font-bold text-slate-300">{server.user.name}</span> · {server.user.email}</>
                                                : server.user?.email || 'Unknown owner'
                                            }
                                        </span>
                                    </div>

                                    {/* ── Metric rings ── */}
                                    {h ? (
                                        <div className="mt-4 flex items-center justify-around rounded-xl border border-white/[0.05] bg-white/[0.02] px-2 py-3">
                                            <MetricRingCard
                                                label="CPU" value={cpu}
                                                color={cpu > 80 ? '#f87171' : cpu > 60 ? '#fbbf24' : '#22d3ee'}
                                            />
                                            <div className="h-8 w-px bg-white/[0.07]" />
                                            <MetricRingCard
                                                label="RAM" value={ram}
                                                color={ram > 80 ? '#f87171' : ram > 60 ? '#fbbf24' : '#34d399'}
                                            />
                                            <div className="h-8 w-px bg-white/[0.07]" />
                                            <MetricRingCard
                                                label="Disk" value={disk}
                                                color={disk > 85 ? '#f87171' : disk > 70 ? '#fbbf24' : '#a78bfa'}
                                            />
                                        </div>
                                    ) : (
                                        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-5 text-xs text-slate-500">
                                            <WifiOff size={13} />
                                            <span>No health data — test connection to refresh</span>
                                        </div>
                                    )}

                                    {/* ── Resource bars ── */}
                                    {h && (
                                        <div className="mt-4">
                                            <ResourceBars cpu={h.cpuUsage} ram={h.memoryUsage} disk={h.diskUsage} />
                                        </div>
                                    )}

                                    {/* ── Spacer ── */}
                                    <div className="flex-1" />

                                    {/* ── Meta row ── */}
                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.05] pt-3 text-[11px]">
                                        <span className="flex items-center gap-1 text-slate-500">
                                            {h?.dockerInstalled
                                                ? <CheckCircle2 size={11} className="text-emerald-400" />
                                                : <XCircle size={11} className="text-slate-600" />}
                                            Docker
                                        </span>
                                        <span className="text-slate-500">
                                            {m?.activeContainers ?? 0} containers
                                        </span>
                                        <span className="flex items-center gap-1 text-slate-600">
                                            <Clock size={10} />
                                            {formatDate(h?.checkedAt || server.updatedAt)}
                                        </span>
                                    </div>

                                    {/* ── Action grid ── */}
                                    <div className="mt-3 grid grid-cols-5 gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="col-span-1 h-9 px-0 text-xs justify-center"
                                            onClick={() => setInfoVps(server)}
                                            title="Server Info"
                                        >
                                            <Info size={14} />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="col-span-1 h-9 px-0 text-xs justify-center"
                                            onClick={() => setMonitorVps(server)}
                                            title="Live Monitor"
                                        >
                                            <Activity size={14} />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="col-span-1 h-9 px-0 text-xs justify-center"
                                            onClick={() => setHistoryVps(server)}
                                            title="Monitoring History"
                                        >
                                            <BarChart2 size={14} />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="col-span-1 h-9 px-0 text-xs justify-center"
                                            onClick={() => handleTestConnection(server.id)}
                                            loading={testingId === server.id}
                                            title="Test SSH Connection"
                                        >
                                            {testingId !== server.id && <RefreshCw size={14} />}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="danger"
                                            className="col-span-1 h-9 px-0 text-xs justify-center"
                                            onClick={() => triggerRemove(server.id, server.name)}
                                            title="Remove VPS"
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Footer count ── */}
            {!vps.isLoading && total > 0 && (
                <p className="text-center text-[11px] text-slate-600">
                    <span className="font-black text-slate-400">{total}</span> server{total !== 1 ? 's' : ''}{' · '}
                    <span className="font-black text-emerald-400">{active}</span> active{' · '}
                    <span className={clsx('font-black', offline > 0 ? 'text-rose-400' : 'text-slate-500')}>{offline}</span> offline
                </p>
            )}

            {/* ── Remove confirmation modal ── */}
            <AppModal
                open={confirmModal.open}
                onClose={() => !action.isPending && setConfirmModal(p => ({ ...p, open: false }))}
                title={confirmModal.title}
            >
                <div className="space-y-5">
                    <div className="rounded-lg border border-rose-400/20 bg-rose-500/8 px-4 py-3">
                        <p className="text-sm leading-relaxed text-slate-300">{confirmModal.message}</p>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button" variant="secondary"
                            onClick={() => setConfirmModal(p => ({ ...p, open: false }))}
                            disabled={action.isPending}
                            className="w-full sm:w-auto"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button" variant={confirmModal.variant}
                            onClick={confirmModal.onConfirm}
                            loading={action.isPending}
                            className="w-full sm:w-auto"
                        >
                            {confirmModal.actionText}
                        </Button>
                    </div>
                </div>
            </AppModal>

            {/* ── Live Monitor modal ── */}
            <AppModal
                open={!!monitorVps}
                onClose={() => setMonitorVps(null)}
                title={`Live Monitor — ${monitorVps?.name ?? ''}`}
                size="xl"
            >
                {monitorVps && (
                    <LiveMonitorTab
                        vps={monitorVps}
                        useLiveMetricsHook={useAdminVpsLiveMetrics}
                    />
                )}
            </AppModal>

            {/* ── Server Info modal ── */}
            <AppModal
                open={!!infoVps}
                onClose={() => setInfoVps(null)}
                title={`Server Info — ${infoVps?.name ?? ''}`}
                size="xl"
            >
                {infoVps && (
                    <ServerInfoTab
                        vps={infoVps}
                        useServerInfoHook={useAdminVpsServerInfo}
                    />
                )}
            </AppModal>

            {/* ── History Monitor modal ── */}
            <AppModal
                open={!!historyVps}
                onClose={() => setHistoryVps(null)}
                title={`Monitoring History — ${historyVps?.name ?? ''}`}
                size="xl"
            >
                {historyVps && (
                    <HistoryMonitorTab
                        vps={historyVps}
                        useHistoryMetricsHook={useAdminVpsHealthHistory}
                    />
                )}
            </AppModal>
        </div>
    );
}
