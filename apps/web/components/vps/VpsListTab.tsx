'use client';

import { ReactNode } from 'react';
import { Activity, CheckCircle2, Info, KeyRound, LockKeyhole, RefreshCw, Server, Trash2, WifiOff, XCircle, ShieldCheck, Network, Zap } from 'lucide-react';
import clsx from 'clsx';
import { formatDate } from '@/components/ui';
import { useBootstrapVps } from '@/hooks/useDeployForgeData';
import type { Vps } from '@/lib/api/types';

interface VpsListTabProps {
    vpsList: Vps[];
    isLoading: boolean;
    isError: boolean;
    errorMessage?: string;
    onRetry: () => void;
    testingId: string | null;
    deletingId: string | null;
    onTest: (id: string) => void;
    onDelete: (vps: Vps) => void;
    onViewInfo: (vps: Vps) => void;
    onMonitor: (vps: Vps) => void;
}

function ProgressMeter({ label, value }: { label: string; value: number }) {
    const colorClass = value > 85 ? 'bg-rose-400' : value > 70 ? 'bg-amber-400' : 'bg-white';
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] uppercase font-mono">
                <span className="text-[#666666]">{label}</span>
                <span className="text-white font-bold">{Math.round(value)}%</span>
            </div>
            <div className="h-1.5 w-full rounded bg-[#000000] overflow-hidden border border-[#1F1F1F]">
                <div className={clsx('h-full transition-all duration-300', colorClass)} style={{ width: `${Math.min(value, 100)}%` }} />
            </div>
        </div>
    );
}

function StatusTag({ status }: { status?: string }) {
    const s = String(status || 'active').toLowerCase();
    const style = s === 'active'
        ? 'border-[#1F1F1F] bg-[#000000] text-emerald-400'
        : s === 'failed'
        ? 'border-rose-900/40 bg-rose-950/20 text-rose-400'
        : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', style)}>
            {status}
        </span>
    );
}

export default function VpsListTab({ vpsList, isLoading, isError, errorMessage, onRetry, testingId, deletingId, onTest, onDelete, onViewInfo, onMonitor }: VpsListTabProps) {
    const bootstrapVps = useBootstrapVps();

    if (isError) {
        return (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-6 font-mono text-xs text-rose-300 space-y-2">
                <p className="font-bold text-white">Failed to load server list</p>
                <p>{errorMessage}</p>
                <button onClick={onRetry} className="h-7 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">Retry</button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 font-mono text-xs">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-64 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                ))}
            </div>
        );
    }

    if (!vpsList.length) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <Server size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">No VPS Server Nodes Registered</p>
                <p className="mt-1">Connect an Ubuntu server node via SSH to start hosting deployments.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 font-mono text-xs">
            {vpsList.map((server) => {
                const health = server.healthRecords?.[0];
                const cpu = Math.round(health?.cpuUsage || 0);
                const ram = Math.round(health?.memoryUsage || 0);
                const disk = Math.round(health?.diskUsage || 0);
                const lastSeen = server.lastCheckedAt || health?.checkedAt || server.updatedAt;
                const isBootstrapping = bootstrapVps.isPending && bootstrapVps.variables?.id === server.id;

                return (
                    <div key={server.id} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 flex flex-col justify-between space-y-4 hover:border-[#333333] transition-colors">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 border-b border-[#1F1F1F] pb-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Server size={14} className="text-white shrink-0" />
                                    <p className="font-bold text-white text-sm truncate">{server.name}</p>
                                </div>
                                <p className="mt-0.5 text-xs text-[#A1A1A1] truncate">{server.ipAddress}:{server.port}</p>
                            </div>
                            <StatusTag status={server.status} />
                        </div>

                        {/* Ingress Gateway Chip */}
                        <div className="rounded border border-[#1F1F1F] bg-[#000000] p-2 flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                <ShieldCheck size={12} className="shrink-0" />
                                <span>Traefik Gateway Ready</span>
                            </div>
                            <span className="text-[#666666] font-mono">deployforge-net</span>
                        </div>

                        {/* Resource Health Metrics */}
                        {health ? (
                            <div className="space-y-2 border-b border-[#1F1F1F] pb-3">
                                <ProgressMeter label="CPU Utilization" value={cpu} />
                                <ProgressMeter label="RAM Memory" value={ram} />
                                <ProgressMeter label="Disk Storage" value={disk} />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-xs text-[#666666] border-b border-[#1F1F1F] pb-3">
                                <WifiOff size={13} />
                                <span>No telemetry — run SSH test probe</span>
                            </div>
                        )}

                        {/* Metadata Rows */}
                        <div className="space-y-1.5 text-[11px] text-[#A1A1A1]">
                            <div className="flex justify-between">
                                <span className="text-[#666666]">SSH USER</span>
                                <span className="text-white">{server.username}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#666666]">MULTI-TENANT</span>
                                <span className="text-emerald-400 font-semibold">ENABLED</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#666666]">LAST PROBE</span>
                                <span>{formatDate(lastSeen)}</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-[#1F1F1F]">
                            <button
                                onClick={() => onViewInfo(server)}
                                title="Server Info"
                                className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white hover:bg-[#1A1A1A]"
                            >
                                <Info size={13} />
                            </button>
                            <button
                                onClick={() => onMonitor(server)}
                                title="Live Monitor"
                                className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white hover:bg-[#1A1A1A]"
                            >
                                <Activity size={13} />
                            </button>
                            <button
                                onClick={() => bootstrapVps.mutate({ id: server.id })}
                                disabled={isBootstrapping}
                                title="Bootstrap / Repair Ingress Gateway"
                                className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-cyan-400 hover:text-cyan-300 hover:bg-[#1A1A1A] disabled:opacity-50"
                            >
                                <Zap size={13} className={isBootstrapping ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={() => onTest(server.id)}
                                disabled={testingId === server.id}
                                title="Test SSH Connection"
                                className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={testingId === server.id ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={() => onDelete(server)}
                                disabled={deletingId === server.id}
                                title="Delete VPS"
                                className="flex h-8 items-center justify-center rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 disabled:opacity-50"
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
