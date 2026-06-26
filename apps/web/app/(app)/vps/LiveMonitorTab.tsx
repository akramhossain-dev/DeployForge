'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, HardDrive, Thermometer, Wifi } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState, Panel } from '@/components/ui';
import { useVpsLiveMetrics } from '@/hooks/useDeployForgeData';
import type { Vps, VpsLiveMetrics } from '@/lib/api/types';

// ── Sparkline chart using inline SVG ────────────────────────────────────────
function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
    if (data.length < 2) return <div style={{ height }} className="w-full" />;
    const w = 200, h = height;
    const max = Math.max(...data, 1);
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    const fill = `${pts} ${w},${h} 0,${h}`;
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <polygon points={fill} fill={`url(#sg-${color.replace('#', '')})`} />
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

// ── Big metric card ──────────────────────────────────────────────────────────
function MetricCard({
    label, value, unit, history, color, icon, sub,
}: {
    label: string; value: number | string; unit?: string; history: number[];
    color: string; icon: React.ReactNode; sub?: string;
}) {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value));
    const isHigh = numVal > 80;
    const isWarn = numVal > 65;
    const dotColor = isHigh ? '#f87171' : isWarn ? '#fbbf24' : color;

    return (
        <Panel className="relative flex flex-col gap-3 overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(to right, ${dotColor}50, transparent)` }} />
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: `${dotColor}25`, background: `${dotColor}10`, color: dotColor }}>
                        {icon}
                    </div>
                    <span className="text-xs font-bold uppercase text-slate-400">{label}</span>
                </div>
                <span className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white">{typeof value === 'number' ? value.toFixed(1) : value}</span>
                    {unit && <span className="text-xs font-bold text-slate-500">{unit}</span>}
                </span>
            </div>
            {history.length > 1 && <Sparkline data={history} color={dotColor} height={36} />}
            {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
        </Panel>
    );
}

// ── Load average row ─────────────────────────────────────────────────────────
function LoadRow({ d }: { d: VpsLiveMetrics }) {
    const max = Math.max(d.loadAvg1, d.loadAvg5, d.loadAvg15, 2);
    return (
        <Panel>
            <p className="mb-4 text-xs font-bold uppercase text-slate-400">Load Average</p>
            <div className="grid grid-cols-3 gap-6">
                {([['1 min', d.loadAvg1], ['5 min', d.loadAvg5], ['15 min', d.loadAvg15]] as const).map(([label, val]) => (
                    <div key={label} className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">{label}</span>
                            <span className="font-black text-white">{val.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-violet-400 transition-all duration-500" style={{ width: `${Math.min((val / max) * 100, 100)}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

// ── Network & Disk IO row ────────────────────────────────────────────────────
function IoRow({ d }: { d: VpsLiveMetrics }) {
    return (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {([
                { label: 'Net Download', value: d.netRxMb.toFixed(2), unit: 'MB', icon: <ArrowDown size={14} />, color: '#22d3ee' },
                { label: 'Net Upload', value: d.netTxMb.toFixed(2), unit: 'MB', icon: <ArrowUp size={14} />, color: '#34d399' },
                { label: 'Disk Read', value: d.diskReadKb > 1024 ? (d.diskReadKb / 1024).toFixed(1) : d.diskReadKb.toFixed(0), unit: d.diskReadKb > 1024 ? 'MB' : 'KB', icon: <HardDrive size={14} />, color: '#a78bfa' },
                { label: 'Disk Write', value: d.diskWriteKb > 1024 ? (d.diskWriteKb / 1024).toFixed(1) : d.diskWriteKb.toFixed(0), unit: d.diskWriteKb > 1024 ? 'MB' : 'KB', icon: <HardDrive size={14} />, color: '#fb923c' },
            ]).map(({ label, value, unit, icon, color }) => (
                <Panel key={label} className="flex flex-col gap-2 p-4">
                    <div className="flex items-center gap-2">
                        <span style={{ color }} className="opacity-70">{icon}</span>
                        <span className="text-[11px] font-bold uppercase text-slate-500">{label}</span>
                    </div>
                    <p className="text-xl font-black text-white">{value} <span className="text-xs font-bold text-slate-500">{unit}</span></p>
                </Panel>
            ))}
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────
const MAX_HISTORY = 30;

interface LiveMonitorTabProps {
    vps: any | null;
    useLiveMetricsHook?: (vpsId?: string, enabled?: boolean) => any;
}

export default function LiveMonitorTab({ vps, useLiveMetricsHook = useVpsLiveMetrics }: LiveMonitorTabProps) {
    const metrics = useLiveMetricsHook(vps?.id, !!vps);

    const [cpuHist, setCpuHist] = useState<number[]>([]);
    const [ramHist, setRamHist] = useState<number[]>([]);
    const [diskHist, setDiskHist] = useState<number[]>([]);
    const pulseRef = useRef(false);
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        if (!metrics.data) return;
        const d = metrics.data;
        setCpuHist(h => [...h.slice(-(MAX_HISTORY - 1)), d.cpuPercent]);
        setRamHist(h => [...h.slice(-(MAX_HISTORY - 1)), d.ramPercent]);
        setDiskHist(h => [...h.slice(-(MAX_HISTORY - 1)), d.diskPercent]);
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 400);
        return () => clearTimeout(t);
    }, [metrics.data]);

    if (!vps) {
        return <EmptyState title="Select a server" description="Choose a VPS from the list to start live monitoring." />;
    }

    const d = metrics.data;

    return (
        <div className="space-y-5">
            {/* Status bar */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.03] px-5 py-3">
                <div className="flex items-center gap-3">
                    <Activity size={15} className="text-cyan-300" />
                    <p className="font-black text-white text-sm">{vps.name}</p>
                    <span className="text-xs text-slate-500 font-mono">{vps.ipAddress}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={clsx('h-2 w-2 rounded-full', metrics.isFetching ? 'bg-cyan-400 animate-pulse' : metrics.isError ? 'bg-rose-400' : 'bg-emerald-400')} />
                    <span className="text-xs font-bold text-slate-400">
                        {metrics.isFetching ? 'Collecting…' : metrics.isError ? 'Error' : d ? `Updated ${new Date(d.collectedAt).toLocaleTimeString()}` : 'Connecting…'}
                    </span>
                </div>
            </div>

            {metrics.isError && (
                <div className="rounded-lg border border-rose-400/20 bg-rose-500/8 px-5 py-4 text-sm text-rose-200">
                    <p className="font-bold">Unable to connect via SSH</p>
                    <p className="mt-1 text-xs text-rose-300/70">Live metrics require an active SSH connection. Check that the server is online.</p>
                </div>
            )}

            {!d && !metrics.isError && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-32 animate-pulse rounded-lg border border-white/10 bg-white/[0.05]" />
                    ))}
                </div>
            )}

            {d && (
                <>
                    {/* Primary metrics */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        <MetricCard label="CPU Usage" value={d.cpuPercent} unit="%" history={cpuHist} color="#22d3ee"
                            icon={<Activity size={15} />}
                            sub={`Load: ${d.loadAvg1.toFixed(2)} / ${d.loadAvg5.toFixed(2)} / ${d.loadAvg15.toFixed(2)}`} />
                        <MetricCard label="RAM Usage" value={d.ramPercent} unit="%" history={ramHist} color="#34d399"
                            icon={<Wifi size={15} />}
                            sub={`${d.ramUsedMb.toFixed(0)} MB used of ${d.ramTotalMb.toFixed(0)} MB`} />
                        <MetricCard label="Disk Usage" value={d.diskPercent} unit="%" history={diskHist} color="#a78bfa"
                            icon={<HardDrive size={15} />} />
                    </div>

                    {/* Temperature */}
                    {d.temperature !== null && (
                        <Panel className="flex items-center gap-4 p-5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                                <Thermometer size={18} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-400">CPU Temperature</p>
                                <p className="text-2xl font-black text-white">{d.temperature.toFixed(1)}<span className="text-sm text-slate-400"> °C</span></p>
                            </div>
                            <div className="ml-auto">
                                <span className={clsx('rounded-full px-3 py-1 text-xs font-black ring-1',
                                    d.temperature > 80 ? 'bg-rose-400/10 text-rose-300 ring-rose-400/20' :
                                        d.temperature > 70 ? 'bg-amber-400/10 text-amber-300 ring-amber-400/20' :
                                            'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20')}>
                                    {d.temperature > 80 ? 'CRITICAL' : d.temperature > 70 ? 'WARM' : 'NORMAL'}
                                </span>
                            </div>
                        </Panel>
                    )}

                    {/* Load average */}
                    <LoadRow d={d} />

                    {/* Network & Disk IO */}
                    <div>
                        <p className="mb-3 text-xs font-bold uppercase text-slate-500">Network & Disk I/O (cumulative)</p>
                        <IoRow d={d} />
                    </div>
                </>
            )}
        </div>
    );
}
