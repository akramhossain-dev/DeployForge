'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, BarChart2, Info, Plus, RefreshCw, Server, Cpu } from 'lucide-react';
import clsx from 'clsx';
import {
    useVpsList,
    useTestVpsConnection,
    useDeleteVps,
} from '@/hooks/useDeployForgeData';
import type { Vps } from '@/lib/api/types';
import VpsListTab from '@/components/vps/VpsListTab';
import AddVpsTab from '@/components/vps/AddVpsTab';
import ServerInfoTab from '@/components/vps/ServerInfoTab';
import LiveMonitorTab from '@/components/vps/LiveMonitorTab';
import HistoryMonitorTab from '@/components/vps/HistoryMonitorTab';
import { EnvironmentTab } from '@/components/vps/EnvironmentTab';

type TabId = 'list' | 'add' | 'info' | 'monitor' | 'history' | 'environment';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'list', label: 'VPS List', icon: <Server size={14} /> },
    { id: 'add', label: 'Add VPS', icon: <Plus size={14} /> },
    { id: 'info', label: 'Server Info', icon: <Info size={14} /> },
    { id: 'monitor', label: 'Live Monitor', icon: <Activity size={14} /> },
    { id: 'history', label: 'History Monitor', icon: <BarChart2 size={14} /> },
    { id: 'environment', label: 'Environment', icon: <Cpu size={14} /> },
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

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        VPS Manager
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Register server nodes, monitor real-time CPU/RAM/Disk metrics, and test SSH connectivity.
                    </p>
                </div>
                <div>
                    <button
                        onClick={() => vps.refetch()}
                        disabled={vps.isFetching}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white transition-colors hover:bg-[#1A1A1A] disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={vps.isFetching ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Pure Dark Developer-Product Tab Bar */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
                {TABS.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => goTab(tab.id)}
                            className={clsx(
                                'flex items-center gap-2 rounded px-3.5 py-2 text-xs font-semibold transition-colors shrink-0',
                                active
                                    ? 'bg-[#111111] text-white'
                                    : 'text-[#A1A1A1] hover:text-white'
                            )}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {tab.id === 'list' && (vps.data?.length ?? 0) > 0 && (
                                <span className={clsx(
                                    'rounded px-1.5 py-0.2 text-[10px] font-bold border',
                                    active ? 'border-[#333333] bg-[#000000] text-white' : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]'
                                )}>
                                    {vps.data?.length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Server Selector strip for info/monitor/environment tabs */}
            {(activeTab === 'info' || activeTab === 'monitor' || activeTab === 'history' || activeTab === 'environment') && (vps.data?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
                    <span className="shrink-0 text-[#666666] font-semibold uppercase">Active Server:</span>
                    {(vps.data || []).map((server) => (
                        <button
                            key={server.id}
                            type="button"
                            onClick={() => setSelectedVps(server)}
                            className={clsx(
                                'flex items-center gap-2 rounded border px-3 py-1.5 font-bold transition-colors shrink-0',
                                selectedVps?.id === server.id
                                    ? 'border-white bg-[#111111] text-white'
                                    : 'border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white'
                            )}
                        >
                            <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0',
                                String(server.status).toLowerCase() === 'active' ? 'bg-emerald-400' : 'bg-rose-400'
                            )} />
                            {server.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab view rendering */}
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

            {activeTab === 'environment' && selectedVps && (
                <EnvironmentTab vps={selectedVps} />
            )}

            {activeTab === 'environment' && !selectedVps && (vps.data?.length ?? 0) > 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#444', fontSize: '12px' }}>
                    Select a VPS from the server selector above to view its environment.
                </div>
            )}
        </div>
    );
}
