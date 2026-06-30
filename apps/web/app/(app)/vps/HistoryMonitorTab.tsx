'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Calendar, Cpu, HardDrive, Server, Wifi, RefreshCw, BarChart2 } from 'lucide-react';
import clsx from 'clsx';
import { Panel, Button, EmptyState, ErrorState, inputClassName } from '@/components/ui';
import { useVpsHealthHistory } from '@/hooks/useDeployForgeData';

interface HistoryMonitorTabProps {
    vps: any | null;
}

type RangeOption = '24h' | '7d' | '30d' | 'custom';

export default function HistoryMonitorTab({ vps }: HistoryMonitorTabProps) {
    const [range, setRange] = useState<RangeOption>('24h');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    
    // Internal state for actual query params to prevent API call on every character change of datepicker
    const [queryParams, setQueryParams] = useState({
        range: '24h' as RangeOption,
        from: undefined as string | undefined,
        to: undefined as string | undefined,
    });

    const [showCpu, setShowCpu] = useState(true);
    const [showRam, setShowRam] = useState(true);
    const [showDisk, setShowDisk] = useState(true);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const svgRef = useRef<SVGSVGElement | null>(null);

    // Synchronize queryParams when range changes (excluding custom)
    useEffect(() => {
        if (range !== 'custom') {
            setQueryParams({ range, from: undefined, to: undefined });
        }
    }, [range]);

    const { data, isLoading, isError, error, refetch } = useVpsHealthHistory(
        vps?.id,
        queryParams.range,
        queryParams.from,
        queryParams.to,
        !!vps
    );

    const handleFetchCustom = () => {
        if (!customFrom || !customTo) return;
        setQueryParams({
            range: 'custom',
            from: new Date(customFrom).toISOString(),
            to: new Date(customTo).toISOString(),
        });
    };

    // Initialize custom dates with default values (past 7 days)
    useEffect(() => {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);

        // Format to local YYYY-MM-DDTHH:MM
        const tzOffset = toDate.getTimezoneOffset() * 60000;
        const localTo = new Date(toDate.getTime() - tzOffset).toISOString().slice(0, 16);
        const localFrom = new Date(fromDate.getTime() - tzOffset).toISOString().slice(0, 16);

        setCustomFrom(localFrom);
        setCustomTo(localTo);
    }, []);

    // SVG coordinates setup
    const points = useMemo(() => {
        if (!data || data.length === 0) return [];
        return data.map((d: any, idx: number) => {
            const x = 60 + (idx / Math.max(data.length - 1, 1)) * 910;
            const yCpu = 30 + (1 - d.cpuUsage / 100) * 320;
            const yMem = 30 + (1 - d.memoryUsage / 100) * 320;
            const yDisk = 30 + (1 - d.diskUsage / 100) * 320;
            return {
                x,
                yCpu,
                yMem,
                yDisk,
                cpu: d.cpuUsage,
                ram: d.memoryUsage,
                disk: d.diskUsage,
                uptime: d.uptime,
                timestamp: d.timestamp,
            };
        });
    }, [data]);

    // Grid details
    const grids = [
        { y: 350, label: '0%' },
        { y: 270, label: '25%' },
        { y: 190, label: '50%' },
        { y: 110, label: '75%' },
        { y: 30, label: '100%' },
    ];

    // X Axis ticks
    const xTicks = useMemo(() => {
        if (points.length < 2) return [];
        const count = 5;
        const ticks = [];
        for (let i = 0; i < count; i++) {
            const idx = Math.round((i / (count - 1)) * (points.length - 1));
            const p = points[idx];
            if (p) {
                ticks.push({
                    x: p.x,
                    text: formatTickTime(p.timestamp, queryParams.range),
                });
            }
        }
        return ticks;
    }, [points, queryParams.range]);

    // Paths generation
    const paths = useMemo(() => {
        if (points.length === 0) return { cpuLine: '', cpuArea: '', ramLine: '', ramArea: '', diskLine: '', diskArea: '' };

        const cpuLine = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yCpu}`).join(' ');
        const cpuArea = `${cpuLine} L ${points[points.length - 1].x} 350 L ${points[0].x} 350 Z`;

        const ramLine = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yMem}`).join(' ');
        const ramArea = `${ramLine} L ${points[points.length - 1].x} 350 L ${points[0].x} 350 Z`;

        const diskLine = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yDisk}`).join(' ');
        const diskArea = `${diskLine} L ${points[points.length - 1].x} 350 L ${points[0].x} 350 Z`;

        return { cpuLine, cpuArea, ramLine, ramArea, diskLine, diskArea };
    }, [points]);

    // Handle mouse movement for interactive tooltips
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
        if (!svgRef.current || points.length === 0) return;
        const rect = svgRef.current.getBoundingClientRect();
        // Scale factor between SVG viewBox coordinates and actual screen bounding client rect
        const scaleX = 1000 / rect.width;
        const mouseX = (e.clientX - rect.left) * scaleX;

        // Find closest point by x coordinate
        let closestIdx = 0;
        let minDiff = Math.abs(points[0].x - mouseX);

        for (let i = 1; i < points.length; i++) {
            const diff = Math.abs(points[i].x - mouseX);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        setHoveredIdx(closestIdx);
    };

    const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

    if (!vps) {
        return <EmptyState title="Select a server" description="Choose a VPS from the list to view historical metrics." />;
    }

    return (
        <div className="space-y-6">
            {/* Header & Controls bar */}
            <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between">
                {/* Server status summary */}
                <div className="flex items-center gap-3">
                    <BarChart2 size={16} className="text-cyan-400" />
                    <div>
                        <p className="text-sm font-black text-white">{vps.name} - History</p>
                        <p className="text-[11px] text-slate-500 font-mono">{vps.ipAddress}</p>
                    </div>
                </div>

                {/* Range selectors */}
                <div className="flex flex-wrap items-center gap-2">
                    {([
                        { id: '24h', label: 'Last 24h' },
                        { id: '7d', label: '7 Days' },
                        { id: '30d', label: '30 Days' },
                        { id: 'custom', label: 'Custom' },
                    ] as const).map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setRange(opt.id)}
                            className={clsx(
                                'rounded-lg px-3 py-1.5 text-xs font-black transition-all border',
                                range === opt.id
                                    ? 'bg-cyan-300/10 text-cyan-200 border-cyan-300/30'
                                    : 'bg-white/[0.03] text-slate-400 border-white/[0.08] hover:text-white hover:border-white/20'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                    
                    <Button variant="secondary" onClick={() => refetch()} loading={isLoading} className="!h-8 px-2.5">
                        <RefreshCw size={12} />
                    </Button>
                </div>
            </div>

            {/* Custom Range Drawer */}
            {range === 'custom' && (
                <Panel className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase">From Date</label>
                        <div className="relative">
                            <input
                                type="datetime-local"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className={clsx(inputClassName, 'w-full')}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase">To Date</label>
                        <div className="relative">
                            <input
                                type="datetime-local"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className={clsx(inputClassName, 'w-full')}
                            />
                        </div>
                    </div>

                    <Button variant="primary" onClick={handleFetchCustom} disabled={isLoading} className="w-full">
                        Fetch Metrics
                    </Button>
                </Panel>
            )}

            {/* Chart Area */}
            <Panel className="relative overflow-hidden p-6">
                {/* Metric toggle legends */}
                <div className="mb-6 flex flex-wrap items-center gap-5 border-b border-white/[0.05] pb-4">
                    <p className="text-xs font-black uppercase text-slate-500">Toggle Lines:</p>
                    
                    <button
                        type="button"
                        onClick={() => setShowCpu(!showCpu)}
                        className={clsx(
                            'flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-black transition-all border',
                            showCpu 
                                ? 'bg-cyan-300/10 text-cyan-300 border-cyan-300/30' 
                                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-400'
                        )}
                    >
                        <span className="h-2 w-2 rounded-full bg-cyan-400" />
                        CPU Usage
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowRam(!showRam)}
                        className={clsx(
                            'flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-black transition-all border',
                            showRam 
                                ? 'bg-emerald-300/10 text-emerald-300 border-emerald-300/30' 
                                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-400'
                        )}
                    >
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        RAM Usage
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowDisk(!showDisk)}
                        className={clsx(
                            'flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-black transition-all border',
                            showDisk 
                                ? 'bg-violet-300/10 text-violet-300 border-violet-300/30' 
                                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-400'
                        )}
                    >
                        <span className="h-2 w-2 rounded-full bg-violet-400" />
                        Disk Usage
                    </button>
                </div>

                {isLoading && (
                    <div className="flex h-72 w-full flex-col items-center justify-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                        <span className="text-xs text-slate-500 font-bold uppercase">Loading history metrics…</span>
                    </div>
                )}

                {isError && (
                    <ErrorState
                        title="Failed to retrieve history logs"
                        message={error?.message || 'Check connection details.'}
                        onRetry={refetch}
                    />
                )}

                {!isLoading && !isError && points.length === 0 && (
                    <EmptyState
                        title="No metrics records"
                        description="There are no system metric logs recorded for this time range. The server might have been offline."
                    />
                )}

                {!isLoading && !isError && points.length > 0 && (
                    <div className="relative">
                        {/* Interactive SVG Chart */}
                        <svg
                            ref={svgRef}
                            viewBox="0 0 1000 400"
                            className="w-full select-none overflow-visible"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setHoveredIdx(null)}
                        >
                            {/* SVG Definitions for Gradients */}
                            <defs>
                                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.0" />
                                </linearGradient>
                            </defs>

                            {/* Horizontal Grid Lines */}
                            {grids.map((grid) => (
                                <g key={grid.y}>
                                    <line
                                        x1="60"
                                        y1={grid.y}
                                        x2="970"
                                        y2={grid.y}
                                        stroke="rgba(255,255,255,0.06)"
                                        strokeWidth="1"
                                        strokeDasharray="4 4"
                                    />
                                    <text
                                        x="50"
                                        y={grid.y + 4}
                                        fill="rgba(255,255,255,0.4)"
                                        fontSize="11"
                                        textAnchor="end"
                                        fontWeight="700"
                                        className="font-mono"
                                    >
                                        {grid.label}
                                    </text>
                                </g>
                            ))}

                            {/* X Axis Labels */}
                            {xTicks.map((tick, idx) => (
                                <g key={idx}>
                                    <line
                                        x1={tick.x}
                                        y1="30"
                                        x2={tick.x}
                                        y2="350"
                                        stroke="rgba(255,255,255,0.02)"
                                        strokeWidth="1"
                                    />
                                    <text
                                        x={tick.x}
                                        y="375"
                                        fill="rgba(255,255,255,0.4)"
                                        fontSize="11"
                                        textAnchor="middle"
                                        fontWeight="700"
                                    >
                                        {tick.text}
                                    </text>
                                </g>
                            ))}

                            {/* Areas (bottom layer) */}
                            {showDisk && paths.diskArea && (
                                <polygon points={paths.diskArea} fill="url(#diskGrad)" />
                            )}
                            {showRam && paths.ramArea && (
                                <polygon points={paths.ramArea} fill="url(#ramGrad)" />
                            )}
                            {showCpu && paths.cpuArea && (
                                <polygon points={paths.cpuArea} fill="url(#cpuGrad)" />
                            )}

                            {/* Lines (middle layer) */}
                            {showDisk && paths.diskLine && (
                                <path
                                    d={paths.diskLine}
                                    fill="none"
                                    stroke="#a78bfa"
                                    strokeWidth="2"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            )}
                            {showRam && paths.ramLine && (
                                <path
                                    d={paths.ramLine}
                                    fill="none"
                                    stroke="#34d399"
                                    strokeWidth="2"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            )}
                            {showCpu && paths.cpuLine && (
                                <path
                                    d={paths.cpuLine}
                                    fill="none"
                                    stroke="#22d3ee"
                                    strokeWidth="2"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            )}

                            {/* Hover Details overlay */}
                            {hoveredPoint && (
                                <g>
                                    {/* Vertical Ruler Guide */}
                                    <line
                                        x1={hoveredPoint.x}
                                        y1="30"
                                        x2={hoveredPoint.x}
                                        y2="350"
                                        stroke="rgba(224,242,254,0.3)"
                                        strokeWidth="1.5"
                                        strokeDasharray="2 2"
                                    />
                                    
                                    {/* Circular points at intersections */}
                                    {showCpu && (
                                        <circle
                                            cx={hoveredPoint.x}
                                            cy={hoveredPoint.yCpu}
                                            r="4"
                                            fill="#22d3ee"
                                            stroke="#020617"
                                            strokeWidth="1.5"
                                        />
                                    )}
                                    {showRam && (
                                        <circle
                                            cx={hoveredPoint.x}
                                            cy={hoveredPoint.yMem}
                                            r="4"
                                            fill="#34d399"
                                            stroke="#020617"
                                            strokeWidth="1.5"
                                        />
                                    )}
                                    {showDisk && (
                                        <circle
                                            cx={hoveredPoint.x}
                                            cy={hoveredPoint.yDisk}
                                            r="4"
                                            fill="#a78bfa"
                                            stroke="#020617"
                                            strokeWidth="1.5"
                                        />
                                    )}
                                </g>
                            )}

                            {/* Invisible Interactive overlay to capture mouse */}
                            <rect
                                x="60"
                                y="30"
                                width="910"
                                height="320"
                                fill="transparent"
                                style={{ cursor: 'crosshair' }}
                            />
                        </svg>

                        {/* Floating Tooltip HTML Overlay */}
                        {hoveredPoint && (
                            <div
                                className="absolute pointer-events-none z-10 flex flex-col gap-1.5 rounded-lg border border-white/10 bg-slate-950/95 p-3 text-xs shadow-2xl backdrop-blur-md"
                                style={{
                                    left: `${(hoveredPoint.x - 60) / 910 * 100}%`,
                                    top: '40px',
                                    transform: hoveredPoint.x > 500 ? 'translateX(-110%)' : 'translateX(10%)',
                                    minWidth: '160px',
                                }}
                            >
                                <p className="border-b border-white/[0.08] pb-1.5 font-black text-white">
                                    {new Date(hoveredPoint.timestamp).toLocaleString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </p>
                                {showCpu && (
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="flex items-center gap-1.5 text-slate-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                                            CPU
                                        </span>
                                        <span className="font-mono font-black text-cyan-300">{hoveredPoint.cpu.toFixed(1)}%</span>
                                    </div>
                                )}
                                {showRam && (
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="flex items-center gap-1.5 text-slate-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            RAM
                                        </span>
                                        <span className="font-mono font-black text-emerald-300">{hoveredPoint.ram.toFixed(1)}%</span>
                                    </div>
                                )}
                                {showDisk && (
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="flex items-center gap-1.5 text-slate-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                                            Disk
                                        </span>
                                        <span className="font-mono font-black text-violet-300">{hoveredPoint.disk.toFixed(1)}%</span>
                                    </div>
                                )}
                                {hoveredPoint.uptime > 0 && (
                                    <div className="mt-1 border-t border-white/[0.05] pt-1 text-[10px] text-slate-500">
                                        Uptime: {Math.floor(hoveredPoint.uptime / 86400)}d {Math.floor((hoveredPoint.uptime % 86400) / 3600)}h
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Panel>
        </div>
    );
}

// Tick date-time formatting helper
function formatTickTime(timestamp: string, range: RangeOption) {
    const date = new Date(timestamp);
    if (range === '24h') {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
