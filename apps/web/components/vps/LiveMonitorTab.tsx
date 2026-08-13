'use client';

import { useEffect, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, HardDrive, Thermometer, Wifi, Server } from 'lucide-react';
import clsx from 'clsx';
import { useVpsLiveMetrics } from '@/hooks/useDeployForgeData';
import type { VpsLiveMetrics } from '@/lib/api/types';

const MAX_HISTORY = 30;

function MetricCard({
    label, value, unit, history, sub,
}: {
    label: string; value: number | string; unit?: string; history: number[]; sub?: string;
}) {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value));
    const isHigh = numVal > 85;
    const isWarn = numVal > 70;

    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-2">
                <span className="text-[#666666] font-semibold uppercase text-[10px]">{label}</span>
                <span className="flex items-baseline gap-1">
                    <span className={clsx('text-xl font-bold', isHigh ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-white')}>
                        {typeof value === 'number' ? value.toFixed(1) : value}
                    </span>
                    {unit && <span className="text-xs text-[#666666]">{unit}</span>}
                </span>
            </div>
            {sub && <p className="text-[11px] text-[#A1A1A1]">{sub}</p>}
        </div>
    );
}

function LoadRow({ d }: { d: VpsLiveMetrics }) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3 font-mono text-xs">
            <p className="text-[10px] font-semibold uppercase text-[#666666]">Load Average</p>
            <div className="grid grid-cols-3 gap-4">
                {[
                    ['1 min', d.loadAvg1],
                    ['5 min', d.loadAvg5],
                    ['15 min', d.loadAvg15],
                ].map(([label, val]) => (
                    <div key={label as string} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                            <span className="text-[#666666]">{label}</span>
                            <span className="font-bold text-white">{(val as number).toFixed(2)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function IoRow({ d }: { d: VpsLiveMetrics }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
            {[
                { label: 'Net Download', value: d.netRxMb.toFixed(2), unit: 'MB', icon: <ArrowDown size={12} /> },
                { label: 'Net Upload', value: d.netTxMb.toFixed(2), unit: 'MB', icon: <ArrowUp size={12} /> },
                { label: 'Disk Read', value: d.diskReadKb > 1024 ? (d.diskReadKb / 1024).toFixed(1) : d.diskReadKb.toFixed(0), unit: d.diskReadKb > 1024 ? 'MB' : 'KB', icon: <HardDrive size={12} /> },
                { label: 'Disk Write', value: d.diskWriteKb > 1024 ? (d.diskWriteKb / 1024).toFixed(1) : d.diskWriteKb.toFixed(0), unit: d.diskWriteKb > 1024 ? 'MB' : 'KB', icon: <HardDrive size={12} /> },
            ].map(({ label, value, unit, icon }) => (
                <div key={label} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-[#666666] text-[10px] uppercase font-semibold">
                        {icon}
                        <span>{label}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{value} <span className="text-xs text-[#666666]">{unit}</span></p>
                </div>
            ))}
        </div>
    );
}

interface LiveMonitorTabProps {
    vps: any | null;
    useLiveMetricsHook?: (vpsId?: string, enabled?: boolean) => any;
}

export default function LiveMonitorTab({ vps, useLiveMetricsHook = useVpsLiveMetrics }: LiveMonitorTabProps) {
    const metrics = useLiveMetricsHook(vps?.id, !!vps);

    const [cpuHist, setCpuHist] = useState<number[]>([]);
    const [ramHist, setRamHist] = useState<number[]>([]);
    const [diskHist, setDiskHist] = useState<number[]>([]);

    useEffect(() => {
        if (!metrics.data) return;
        const d = metrics.data;
        setCpuHist(h => [...h.slice(-(MAX_HISTORY - 1)), d.cpuPercent]);
        setRamHist(h => [...h.slice(-(MAX_HISTORY - 1)), d.ramPercent]);
        setDiskHist(h => [...h.slice(-(MAX_HISTORY - 1)), d.diskPercent]);
    }, [metrics.data]);

    if (!vps) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <Server size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">Select a Server Node</p>
                <p className="mt-1">Choose a VPS server from the list above to open real-time telemetry stream.</p>
            </div>
        );
    }

    const d = metrics.data;

    return (
        <div className="space-y-4 font-mono text-xs">
            {/* Status bar */}
            <div className="flex items-center justify-between gap-4 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-white" />
                    <p className="font-bold text-white text-sm">{vps.name}</p>
                    <span className="text-xs text-[#A1A1A1]">{vps.ipAddress}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#A1A1A1]">
                    <span className={clsx('h-2 w-2 rounded-full', metrics.isFetching ? 'bg-emerald-400 animate-pulse' : 'bg-[#666666]')} />
                    <span>{d ? `Updated ${new Date(d.collectedAt).toLocaleTimeString()}` : 'Connecting telemetry...'}</span>
                </div>
            </div>

            {metrics.isError && (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">
                    Unable to connect via SSH telemetry stream. Ensure server is reachable.
                </div>
            )}

            {d && (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <MetricCard label="CPU Usage" value={d.cpuPercent} unit="%" history={cpuHist}
                            sub={`Load Avg: ${d.loadAvg1.toFixed(2)} / ${d.loadAvg5.toFixed(2)} / ${d.loadAvg15.toFixed(2)}`} />
                        <MetricCard label="RAM Usage" value={d.ramPercent} unit="%" history={ramHist}
                            sub={`${d.ramUsedMb.toFixed(0)} MB / ${d.ramTotalMb.toFixed(0)} MB`} />
                        <MetricCard label="Disk Usage" value={d.diskPercent} unit="%" history={diskHist} />
                    </div>

                    <LoadRow d={d} />
                    <IoRow d={d} />
                </>
            )}
        </div>
    );
}
