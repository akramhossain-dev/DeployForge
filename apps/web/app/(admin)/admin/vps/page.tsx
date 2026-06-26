'use client';

import { Cpu, HardDrive, Loader2, MemoryStick, RefreshCw, Server, Trash2, User } from 'lucide-react';
import clsx from 'clsx';
import { ErrorState, PageHeader, SkeletonBlock } from '@/components/ui';
import { ResourceBars, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminVps } from '@/hooks/useDeployForgeData';

function MetricTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    const pct   = Math.round(value);
    const cls   = pct > 85 ? 'text-rose-300 bg-rose-400/10 border-rose-400/20'
                : pct > 65 ? 'text-amber-300 bg-amber-400/10 border-amber-400/20'
                :             'text-emerald-300 bg-emerald-400/10 border-emerald-400/20';
    return (
        <div className={clsx('flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2.5', cls)}>
            <span className="text-base font-black">{pct}%</span>
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest opacity-60">
                {icon} {label}
            </span>
        </div>
    );
}

export default function AdminVpsPage() {
    const vps    = useAdminVps();
    const action = useAdminAction();

    const total   = vps.data?.length ?? 0;
    const active  = vps.data?.filter(s => s.status.toLowerCase() === 'active').length ?? 0;
    const offline = total - active;

    return (
        <div className="space-y-6">
            <PageHeader
                title="VPS Management"
                description="Fleet health, resource usage, active containers, ownership, and removal controls."
                action={
                    <button onClick={() => vps.refetch()} disabled={vps.isRefetching}
                        className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-bold text-slate-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50">
                        {vps.isRefetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </button>
                }
            />

            {vps.isError    && <ErrorState message={(vps.error as Error)?.message} onRetry={() => vps.refetch()} />}
            {action.isError && <ErrorState title="Action failed" message={(action.error as Error)?.message} />}

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {[
                    { label: 'Total Servers', value: total,   cls: 'border-white/[0.08] bg-white/[0.03]',       val: 'text-white'       },
                    { label: 'Active',        value: active,  cls: 'border-emerald-400/20 bg-emerald-400/[0.06]', val: 'text-emerald-300' },
                    { label: 'Offline',       value: offline, cls: offline > 0 ? 'border-rose-400/25 bg-rose-400/[0.06]' : 'border-white/[0.08] bg-white/[0.03]', val: offline > 0 ? 'text-rose-300' : 'text-slate-500' },
                ].map(k => (
                    <div key={k.label} className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${k.cls}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{k.label}</p>
                        <p className={`mt-2 text-3xl font-black sm:text-4xl ${k.val}`}>{vps.isLoading ? '—' : k.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Skeletons ── */}
            {vps.isLoading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-64 rounded-2xl" />)}
                </div>
            )}

            {/* ── Empty ── */}
            {!vps.isLoading && !vps.data?.length && (
                <div className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-slate-900/50 py-16 text-center">
                    <Server size={36} className="text-slate-600" />
                    <p className="mt-4 font-black text-slate-300">No servers in the fleet.</p>
                    <p className="mt-1 text-xs text-slate-600">Add VPS servers via the user dashboard.</p>
                </div>
            )}

            {/* ── Server cards ── */}
            {!vps.isLoading && vps.data?.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {vps.data.map(server => {
                        const h        = server.healthRecords?.[0];
                        const m        = server.systemMetrics?.[0];
                        const isOnline = server.status.toLowerCase() === 'active';

                        return (
                            <div key={server.id}
                                className={clsx(
                                    'group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-900/80 to-slate-950/80 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300',
                                    isOnline
                                        ? 'border-white/[0.08] hover:border-emerald-400/30 hover:shadow-[0_0_32px_-8px_theme(colors.emerald.400/12)]'
                                        : 'border-white/[0.08] hover:border-rose-400/25'
                                )}>

                                {/* Top stripe */}
                                <div className={clsx('h-0.5 bg-gradient-to-r to-transparent',
                                    isOnline ? 'from-emerald-400/70 via-emerald-400/20' : 'from-rose-400/60 via-rose-400/15')} />

                                <div className="flex flex-1 flex-col p-5">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={clsx('relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                                                isOnline ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-rose-400/20 bg-rose-400/10')}>
                                                <Server size={16} className={isOnline ? 'text-emerald-300' : 'text-rose-300'} />
                                                <span className={clsx('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950',
                                                    isOnline ? 'bg-emerald-400' : 'bg-rose-400')} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-black text-white">{server.name}</p>
                                                <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                                                    {server.ipAddress}:{server.port}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusBadge status={server.status} />
                                    </div>

                                    {/* Owner */}
                                    <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                                        <User size={11} className="shrink-0 text-slate-600" />
                                        <span className="truncate text-[11px] text-slate-400">{server.user?.email || 'Unknown owner'}</span>
                                    </div>

                                    {/* Metric tiles */}
                                    <div className="mt-3 flex gap-2">
                                        <MetricTile icon={<Cpu size={9} />}         label="CPU"  value={h?.cpuUsage    || 0} />
                                        <MetricTile icon={<MemoryStick size={9} />} label="RAM"  value={h?.memoryUsage || 0} />
                                        <MetricTile icon={<HardDrive size={9} />}   label="Disk" value={h?.diskUsage   || 0} />
                                    </div>

                                    {/* Resource bars */}
                                    <div className="mt-3">
                                        <ResourceBars cpu={h?.cpuUsage} ram={h?.memoryUsage} disk={h?.diskUsage} />
                                    </div>

                                    {/* Spacer */}
                                    <div className="flex-1" />

                                    {/* Footer */}
                                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400">{m?.activeContainers ?? 0} containers</p>
                                            <p className="text-[9px] text-slate-600">{formatDate(h?.checkedAt || server.updatedAt)}</p>
                                        </div>
                                        <button
                                            title="Remove Server"
                                            onClick={() => action.mutate({ method: 'delete', path: `/admin/vps/${server.id}` })}
                                            className="flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3 py-1.5 text-[11px] font-black text-rose-400/80 transition-all hover:border-rose-400/50 hover:bg-rose-400/15 hover:text-rose-300"
                                        >
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {!vps.isLoading && total > 0 && (
                <p className="text-center text-[11px] text-slate-600">
                    <span className="font-black text-slate-400">{total}</span> server{total !== 1 ? 's' : ''} ·{' '}
                    <span className="font-black text-emerald-400">{active}</span> active
                </p>
            )}
        </div>
    );
}
