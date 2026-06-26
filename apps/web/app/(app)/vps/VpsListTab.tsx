'use client';

import { ReactNode } from 'react';
import { Activity, CheckCircle2, Info, KeyRound, LockKeyhole, RefreshCw, Server, Trash2, WifiOff, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
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

function RadialProgress({ value, color }: { value: number; color: string }) {
    const r = 18, circ = 2 * Math.PI * r;
    const pct = Math.min(Math.max(value, 0), 100);
    return (
        <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
            <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4"
                strokeLinecap="round" strokeDasharray={circ}
                strokeDashoffset={circ - (pct / 100) * circ}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
    );
}

function MetricRing({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative">
                <RadialProgress value={value} color={color} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white rotate-90">
                    {Math.round(value)}%
                </span>
            </div>
            <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase text-slate-500 shrink-0">{label}</span>
            <span className="text-xs text-slate-300 truncate text-right">{value}</span>
        </div>
    );
}

function statusDot(status: string) {
    const s = String(status).toLowerCase();
    if (s === 'active') return 'bg-emerald-400';
    if (s === 'failed') return 'bg-rose-400';
    return 'bg-slate-500';
}

export default function VpsListTab({ vpsList, isLoading, isError, errorMessage, onRetry, testingId, deletingId, onTest, onDelete, onViewInfo, onMonitor }: VpsListTabProps) {
    if (isError) return <ErrorState message={errorMessage} onRetry={onRetry} />;
    if (isLoading) return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-72" />)}
        </div>
    );
    if (!vpsList.length) return <EmptyState title="No servers connected" description="Add your first VPS to start deploying applications." />;

    return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {vpsList.map((server) => {
                const health = server.healthRecords?.[0];
                const cpu = Math.round(health?.cpuUsage || 0);
                const ram = Math.round(health?.memoryUsage || 0);
                const disk = Math.round(health?.diskUsage || 0);
                const lastSeen = server.lastCheckedAt || health?.checkedAt || server.updatedAt;

                return (
                    <Panel key={server.id} className="flex flex-col gap-0 p-0 overflow-hidden">
                        <div className="relative flex items-start justify-between gap-3 px-5 pt-5 pb-4">
                            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-300/40 via-cyan-200/20 to-transparent" />
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="relative shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/8">
                                    <Server size={18} className="text-cyan-300" />
                                    <span className={clsx('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-900', statusDot(server.status))} />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-black text-white text-sm leading-tight">{server.name}</p>
                                    <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{server.ipAddress}:{server.port}</p>
                                </div>
                            </div>
                            <StatusBadge status={server.status} />
                        </div>

                        {health ? (
                            <div className="flex items-center justify-around border-y border-white/[0.05] bg-white/[0.02] px-5 py-4">
                                <MetricRing label="CPU" value={cpu} color={cpu > 80 ? '#f87171' : cpu > 60 ? '#fbbf24' : '#22d3ee'} />
                                <MetricRing label="RAM" value={ram} color={ram > 80 ? '#f87171' : ram > 60 ? '#fbbf24' : '#34d399'} />
                                <MetricRing label="Disk" value={disk} color={disk > 85 ? '#f87171' : disk > 70 ? '#fbbf24' : '#a78bfa'} />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center border-y border-white/[0.05] bg-white/[0.02] px-5 py-5 gap-2 text-xs text-slate-500">
                                <WifiOff size={14} /><span>No health data — run a connection test</span>
                            </div>
                        )}

                        <div className="flex flex-col gap-2.5 px-5 py-4">
                            <InfoRow label="User" value={<span className="font-mono">{server.username}</span>} />
                            <InfoRow label="Auth" value={server.authType === 'password'
                                ? <span className="flex items-center gap-1"><LockKeyhole size={11} className="text-amber-300" />Password</span>
                                : <span className="flex items-center gap-1"><KeyRound size={11} className="text-cyan-300" />SSH Key</span>}
                            />
                            <InfoRow label="Last seen" value={formatDate(lastSeen)} />
                            {health?.dockerInstalled !== undefined && (
                                <InfoRow label="Docker" value={health.dockerInstalled
                                    ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={11} />Ready</span>
                                    : <span className="flex items-center gap-1 text-slate-500"><XCircle size={11} />Not installed</span>}
                                />
                            )}
                        </div>

                        <div className="mt-auto grid grid-cols-4 gap-2 border-t border-white/[0.05] px-5 py-4">
                            <Button variant="secondary" className="col-span-1 h-9 px-2 text-xs" onClick={() => onViewInfo(server)} title="Server Info"><Info size={14} /></Button>
                            <Button variant="secondary" className="col-span-1 h-9 px-2 text-xs" onClick={() => onMonitor(server)} title="Live Monitor"><Activity size={14} /></Button>
                            <Button variant="secondary" className="col-span-1 h-9 px-2 text-xs" onClick={() => onTest(server.id)} loading={testingId === server.id} title="Test SSH"><RefreshCw size={14} /></Button>
                            <Button variant="danger" className="col-span-1 h-9 px-2 text-xs" onClick={() => onDelete(server)} loading={deletingId === server.id} title="Delete"><Trash2 size={14} /></Button>
                        </div>
                    </Panel>
                );
            })}
        </div>
    );
}
