'use client';

import dynamic from 'next/dynamic';
import { useVpsList } from '@/hooks/useDeployForgeData';
import { useState } from 'react';
import { Server, Terminal, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const TerminalPanel = dynamic(() => import('@/components/terminal/TerminalPanel').then((module) => module.TerminalPanel), {
    ssr: false,
    loading: () => (
        <div className="flex h-[600px] items-center justify-center rounded-md border border-[#1F1F1F] bg-[#000000] font-mono text-xs text-[#666666]">
            <Loader2 size={16} className="animate-spin mr-2" /> Initializing xterm.js Web SSH terminal...
        </div>
    ),
});

function StatusTag({ status }: { status?: string }) {
    const s = String(status || 'active').toLowerCase();
    const style = s === 'active'
        ? 'border-[#1F1F1F] bg-[#000000] text-emerald-400'
        : s === 'failed'
        ? 'border-rose-900/40 bg-rose-950/20 text-rose-400'
        : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';

    return (
        <span className={clsx('inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider', style)}>
            {status}
        </span>
    );
}

export default function TerminalPage() {
    const vps = useVpsList();
    const [selectedId, setSelectedId] = useState<string | undefined>();
    const activeId = selectedId || vps.data?.[0]?.id;

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Web SSH Terminal
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Interactive xterm.js SSH terminal connected over WebSocket with explicit session recovery.
                    </p>
                </div>
            </div>

            {/* Error Banner */}
            {vps.isError && (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                    Failed to fetch VPS list: {(vps.error as Error)?.message}
                </div>
            )}

            {/* Layout Grid */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                {/* Server Selector Sidebar */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Terminal size={14} />
                        <span>Target Server</span>
                    </div>

                    {vps.isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-12 animate-pulse rounded border border-[#1F1F1F] bg-[#000000]" />
                            ))}
                        </div>
                    ) : vps.data?.length ? (
                        <div className="space-y-2">
                            {vps.data.map((server) => {
                                const isSelected = activeId === server.id;
                                return (
                                    <button
                                        key={server.id}
                                        onClick={() => setSelectedId(server.id)}
                                        className={clsx(
                                            'w-full flex items-center justify-between gap-2 rounded border p-3 text-left transition-colors',
                                            isSelected
                                                ? 'border-white bg-[#111111] text-white border-l-2'
                                                : 'border-[#1F1F1F] bg-[#000000] text-[#A1A1A1] hover:text-white'
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <Server size={12} className="shrink-0" />
                                                <p className="font-bold text-xs truncate">{server.name}</p>
                                            </div>
                                            <p className="text-[10px] text-[#666666] truncate mt-0.5">{server.ipAddress}:{server.port}</p>
                                        </div>
                                        <StatusTag status={server.status} />
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-6 text-center text-[#666666]">
                            No VPS server nodes registered.
                        </div>
                    )}
                </div>

                {/* Main Terminal Box */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#000000] overflow-hidden">
                    <TerminalPanel vpsId={activeId} />
                </div>
            </div>
        </div>
    );
}
