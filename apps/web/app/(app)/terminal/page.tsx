'use client';

import dynamic from 'next/dynamic';
import { useVpsList } from '@/hooks/useDeployForgeData';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Vps } from '@/lib/api/types';

const TerminalPanel = dynamic(() => import('@/components/terminal/TerminalPanel').then((module) => module.TerminalPanel), {
    ssr: false,
    loading: () => (
        <div className="flex h-[640px] items-center justify-center rounded-md border border-[#1F1F1F] bg-[#000000] font-mono text-xs text-[#666666]">
            <Loader2 size={16} className="animate-spin mr-2" /> Initializing xterm.js Web SSH terminal...
        </div>
    ),
});

export default function TerminalPage() {
    const vps = useVpsList();
    const [selectedVps, setSelectedVps] = useState<Vps | null>(null);

    const activeVps = selectedVps || (vps.data?.[0] as Vps | undefined) || null;

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

            {/* Sleek Modern Full-Bleed Terminal Shell */}
            <div>
                <TerminalPanel
                    vpsList={vps.data || []}
                    activeVps={activeVps}
                    onSelectVps={(v) => setSelectedVps(v)}
                />
            </div>
        </div>
    );
}
