'use client';

import { ReactNode } from 'react';
import { Clock, Cpu, Globe, HardDrive, Info, MemoryStick, RefreshCw, Server, Thermometer } from 'lucide-react';
import { Button, EmptyState, ErrorState, Panel, SectionHeading, SkeletonBlock } from '@/components/ui';
import { useVpsServerInfo } from '@/hooks/useDeployForgeData';
import type { Vps } from '@/lib/api/types';

function kbToHuman(kb: number): string {
    if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
    if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
    return `${kb} KB`;
}

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <Panel className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/8 text-cyan-200">
                    {icon}
                </div>
                <h3 className="text-sm font-black text-white">{title}</h3>
            </div>
            <div className="space-y-2.5">{children}</div>
        </Panel>
    );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
            <span className="text-[11px] font-bold uppercase text-slate-500 shrink-0 mt-0.5">{label}</span>
            <span className="text-xs text-slate-200 text-right break-all">{value}</span>
        </div>
    );
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    const color = pct > 85 ? 'bg-rose-400' : pct > 70 ? 'bg-amber-400' : 'bg-cyan-400';
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
                <span className="font-bold uppercase text-slate-500">{label}</span>
                <span className="text-slate-300">{kbToHuman(used)} / {kbToHuman(total)} <span className="text-slate-500">({pct}%)</span></span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

interface ServerInfoTabProps {
    vps: Vps | null;
    vpsList: Vps[];
}

export default function ServerInfoTab({ vps, vpsList }: ServerInfoTabProps) {
    const info = useVpsServerInfo(vps?.id);

    if (!vps) {
        return (
            <EmptyState
                title="Select a server"
                description="Choose a VPS from the list to view its system information."
            />
        );
    }

    if (info.isLoading) {
        return (
            <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-48" />)}
                </div>
            </div>
        );
    }

    if (info.isError) {
        return (
            <ErrorState
                title="Could not fetch server info"
                message="SSH connection failed or timed out. Ensure the server is online and SSH is accessible."
                onRetry={() => info.refetch()}
            />
        );
    }

    const d = info.data;
    if (!d) return null;

    return (
        <div className="space-y-5">
            {/* Top meta bar */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.03] px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Server size={16} className="text-cyan-300 shrink-0" />
                    <div className="min-w-0">
                        <p className="font-black text-white text-sm truncate">{vps.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{d.publicIp} · {d.hostname}</p>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => info.refetch()} loading={info.isFetching} className="shrink-0">
                    <RefreshCw size={14} /> Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {/* Network */}
                <InfoCard icon={<Globe size={15} />} title="Network">
                    <Row label="Hostname" value={d.hostname} />
                    <Row label="Public IP" value={<span className="font-mono text-cyan-300">{d.publicIp}</span>} />
                    <Row label="Private IP" value={<span className="font-mono">{d.privateIp}</span>} />
                    <Row label="SSH Port" value={<span className="font-mono">{vps.port}</span>} />
                </InfoCard>

                {/* OS */}
                <InfoCard icon={<Info size={15} />} title="Operating System">
                    <Row label="OS" value={d.os} />
                    <Row label="Kernel" value={<span className="font-mono text-xs">{d.kernel}</span>} />
                    <Row label="Architecture" value={d.architecture} />
                    <Row label="Timezone" value={d.timezone} />
                </InfoCard>

                {/* CPU */}
                <InfoCard icon={<Cpu size={15} />} title="Processor">
                    <Row label="Model" value={d.cpuModel} />
                    <Row label="Cores" value={<span className="font-black text-white">{d.cpuCores}</span>} />
                </InfoCard>

                {/* Memory */}
                <InfoCard icon={<MemoryStick size={15} />} title="Memory">
                    <UsageBar used={d.ramUsed} total={d.ramTotal} label="RAM" />
                    {d.swapTotal > 0 && <UsageBar used={d.swapUsed} total={d.swapTotal} label="Swap" />}
                    {d.swapTotal === 0 && <Row label="Swap" value={<span className="text-slate-500 italic">Not configured</span>} />}
                </InfoCard>

                {/* Storage */}
                <InfoCard icon={<HardDrive size={15} />} title="Storage">
                    <Row label="Total" value={d.diskTotal} />
                    <Row label="Used" value={d.diskUsed} />
                    <Row label="Free" value={d.diskFree} />
                    <Row label="Usage" value={
                        <span className={parseInt(d.diskPercent) > 85 ? 'text-rose-300 font-black' : parseInt(d.diskPercent) > 70 ? 'text-amber-300 font-black' : 'text-emerald-300 font-black'}>
                            {d.diskPercent}
                        </span>
                    } />
                </InfoCard>

                {/* Uptime */}
                <InfoCard icon={<Clock size={15} />} title="System Time">
                    <Row label="Uptime" value={<span className="font-black text-white">{d.uptimeFormatted}</span>} />
                    <Row label="Boot time" value={<span className="font-mono text-xs">{d.bootTime}</span>} />
                    <Row label="Timezone" value={d.timezone} />
                </InfoCard>
            </div>
        </div>
    );
}
