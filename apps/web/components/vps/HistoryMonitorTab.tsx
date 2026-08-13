'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Calendar, Cpu, HardDrive, Server, RefreshCw, BarChart2 } from 'lucide-react';
import clsx from 'clsx';
import { useVpsHealthHistory } from '@/hooks/useDeployForgeData';

interface HistoryMonitorTabProps {
    vps: any | null;
    useHistoryMetricsHook?: (vpsId?: string, range?: string, from?: string, to?: string, enabled?: boolean) => any;
}

type RangeOption = '24h' | '7d' | '30d' | 'custom';

export default function HistoryMonitorTab({ vps, useHistoryMetricsHook }: HistoryMonitorTabProps) {
    const [range, setRange] = useState<RangeOption>('24h');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const [queryParams, setQueryParams] = useState({
        range: '24h' as RangeOption,
        from: undefined as string | undefined,
        to: undefined as string | undefined,
    });

    useEffect(() => {
        if (range !== 'custom') {
            setQueryParams({ range, from: undefined, to: undefined });
        }
    }, [range]);

    const useHistoryHook = useHistoryMetricsHook || useVpsHealthHistory;

    const { data, isLoading, isError, refetch } = useHistoryHook(
        vps?.id,
        queryParams.range,
        queryParams.from,
        queryParams.to,
        !!vps
    );

    if (!vps) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <Server size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">Select a Server Node</p>
                <p className="mt-1">Choose a VPS server from the list above to view historical telemetry logs.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-mono text-xs">
            {/* Range Selector Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                <div className="flex items-center gap-2">
                    <BarChart2 size={14} className="text-white" />
                    <span className="font-bold text-white">Historical Telemetry Logs ({vps.name})</span>
                </div>

                <div className="flex items-center gap-1">
                    {(['24h', '7d', '30d'] as const).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={clsx(
                                'h-7 px-3 rounded border text-xs font-semibold uppercase transition-colors',
                                range === r ? 'border-white bg-[#111111] text-white' : 'border-[#1F1F1F] bg-[#000000] text-[#A1A1A1] hover:text-white'
                            )}
                        >
                            {r}
                        </button>
                    ))}
                    <button
                        onClick={() => refetch()}
                        className="h-7 w-7 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>
            </div>

            {/* Content Display */}
            {isLoading ? (
                <div className="h-64 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
            ) : isError ? (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">
                    Failed to fetch historical telemetry logs for {vps.name}.
                </div>
            ) : !data || data.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center text-[#666666]">
                    No historical telemetry records found for this time range.
                </div>
            ) : (
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3">
                    <p className="text-[10px] font-semibold uppercase text-[#666666]">Telemetry Record Summary ({data.length} data points)</p>
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                        {data.map((record: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between border-b border-[#1F1F1F] py-1.5 text-[11px]">
                                <span className="text-[#666666]">{new Date(record.timestamp).toLocaleString()}</span>
                                <div className="flex items-center gap-4 text-white">
                                    <span>CPU: {Math.round(record.cpuUsage)}%</span>
                                    <span>RAM: {Math.round(record.memoryUsage)}%</span>
                                    <span>Disk: {Math.round(record.diskUsage)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
