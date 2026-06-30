'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, BarChart2, Info, Plus, RefreshCw, Server } from 'lucide-react';
import clsx from 'clsx';
import { Button, PageHeader } from '@/components/ui';
import {
    useVpsList,
    useTestVpsConnection,
    useDeleteVps,
} from '@/hooks/useDeployForgeData';
import type { Vps } from '@/lib/api/types';
import VpsListTab from './VpsListTab';
import AddVpsTab from './AddVpsTab';
import ServerInfoTab from './ServerInfoTab';
import LiveMonitorTab from './LiveMonitorTab';
import HistoryMonitorTab from './HistoryMonitorTab';

type TabId = 'list' | 'add' | 'info' | 'monitor' | 'history';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'list', label: 'VPS List', icon: <Server size={15} /> },
    { id: 'add', label: 'Add VPS', icon: <Plus size={15} /> },
    { id: 'info', label: 'Server Info', icon: <Info size={15} /> },
    { id: 'monitor', label: 'Live Monitor', icon: <Activity size={15} /> },
    { id: 'history', label: 'History Monitor', icon: <BarChart2 size={15} /> },
];

export default function VpsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabId>((searchParams.get('tab') as TabId) || 'list');
    const [selectedVps, setSelectedVps] = useState<Vps | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const vps = useVpsList();
    const testConn = useTestVpsConnection();
    const deleteVps = useDeleteVps();

    const goTab = useCallback((id: TabId) => {
        setActiveTab(id);
        router.replace(`/vps?tab=${id}`, { scroll: false });
    }, [router]);

    const handleTest = useCallback(async (id: string) => {
        setTestingId(id);
        try { await testConn.mutateAsync({ id }); }
        finally { setTestingId(null); }
    }, [testConn]);

    const handleDelete = useCallback((server: Vps) => {
        if (!window.confirm(`Delete "${server.name}"? This cannot be undone.`)) return;
        setDeletingId(server.id);
        deleteVps.mutate(server.id, { onSettled: () => setDeletingId(null) });
    }, [deleteVps]);

    const handleViewInfo = useCallback((server: Vps) => {
        setSelectedVps(server);
        goTab('info');
    }, [goTab]);

    const handleMonitor = useCallback((server: Vps) => {
        setSelectedVps(server);
        goTab('monitor');
    }, [goTab]);

    // Description for page header based on active tab
    const descriptions: Record<TabId, string> = {
        list: 'All connected servers with live health status.',
        add: 'Connect a new VPS via SSH in 3 quick steps.',
        info: 'Deep-dive system information fetched live via SSH.',
        monitor: 'Real-time CPU, RAM, disk, and network metrics refreshed every 3 seconds.',
        history: 'Historical resource utilization records with custom date filter and aggregation.',
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="VPS Manager"
                description={descriptions[activeTab]}
                action={
                    <Button variant="secondary" onClick={() => vps.refetch()} loading={vps.isFetching}>
                        <RefreshCw size={15} /> Refresh
                    </Button>
                }
            />

            {/* Tab bar */}
            <div className="relative flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1 backdrop-blur-xl overflow-x-auto no-scrollbar">
                {TABS.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            id={`vps-tab-${tab.id}`}
                            onClick={() => goTab(tab.id)}
                            className={clsx(
                                'relative flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black transition-all whitespace-nowrap',
                                active
                                    ? 'bg-cyan-300/10 text-cyan-100 shadow-sm'
                                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                            )}
                        >
                            {active && (
                                <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-cyan-300 shadow-sm shadow-cyan-400/40" />
                            )}
                            <span className={active ? 'text-cyan-300' : 'text-slate-500'}>{tab.icon}</span>
                            {tab.label}
                            {tab.id === 'list' && vps.data?.length ? (
                                <span className={clsx(
                                    'ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ring-1',
                                    active ? 'bg-cyan-400/15 text-cyan-200 ring-cyan-400/20' : 'bg-white/[0.06] text-slate-400 ring-white/10'
                                )}>
                                    {vps.data.length}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            {/* VPS selector strip for info/monitor tabs */}
            {(activeTab === 'info' || activeTab === 'monitor' || activeTab === 'history') && (vps.data?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    <span className="shrink-0 text-[11px] font-bold uppercase text-slate-500">Server:</span>
                    {(vps.data || []).map((server) => (
                        <button
                            key={server.id}
                            type="button"
                            onClick={() => setSelectedVps(server)}
                            className={clsx(
                                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-black transition-all',
                                selectedVps?.id === server.id
                                    ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                                    : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
                            )}
                        >
                            <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0',
                                String(server.status).toLowerCase() === 'active' ? 'bg-emerald-400' :
                                    String(server.status).toLowerCase() === 'failed' ? 'bg-rose-400' : 'bg-slate-500'
                            )} />
                            {server.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab content */}
            {activeTab === 'list' && (
                <VpsListTab
                    vpsList={vps.data || []}
                    isLoading={vps.isLoading}
                    isError={vps.isError}
                    errorMessage={(vps.error as Error)?.message}
                    onRetry={() => vps.refetch()}
                    testingId={testingId}
                    deletingId={deletingId}
                    onTest={handleTest}
                    onDelete={handleDelete}
                    onViewInfo={handleViewInfo}
                    onMonitor={handleMonitor}
                />
            )}

            {activeTab === 'add' && (
                <AddVpsTab onAdded={() => { vps.refetch(); goTab('list'); }} />
            )}

            {activeTab === 'info' && (
                <ServerInfoTab vps={selectedVps} vpsList={vps.data || []} />
            )}

            {activeTab === 'monitor' && (
                <LiveMonitorTab vps={selectedVps} />
            )}

            {activeTab === 'history' && (
                <HistoryMonitorTab vps={selectedVps} />
            )}
        </div>
    );
}
