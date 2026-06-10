'use client';

import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge } from '@/components/ui';
import { useVpsList } from '@/hooks/useDeployForgeData';
import { useState } from 'react';

export default function TerminalPage() {
    const vps = useVpsList();
    const [selectedId, setSelectedId] = useState<string | undefined>();
    const activeId = selectedId || vps.data?.[0]?.id;

    return (
        <div className="space-y-6">
            <PageHeader title="Terminal" description="Dark monospace web SSH access with explicit connection state and session recovery controls." />
            {vps.isError ? <ErrorState message={(vps.error as Error)?.message} onRetry={() => vps.refetch()} /> : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <Panel>
                    <h3 className="mb-4 font-bold text-white">Servers</h3>
                    {vps.isLoading ? (
                        <div className="space-y-3"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></div>
                    ) : vps.data?.length ? (
                        <div className="space-y-2">
                            {vps.data.map((server) => (
                                <button key={server.id} onClick={() => setSelectedId(server.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-left hover:border-cyan-400/40">
                                    <span className="min-w-0 truncate text-sm font-bold text-slate-100">{server.name}</span>
                                    <StatusBadge status={server.status} />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No VPS available" description="Connect a VPS before opening a terminal session." />
                    )}
                </Panel>
                <TerminalPanel vpsId={activeId} />
            </div>
        </div>
    );
}
