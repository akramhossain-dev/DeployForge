'use client';

import { ReactNode } from 'react';
import { Clock, Cpu, Globe, HardDrive, Info, MemoryStick, RefreshCw, Server, ShieldCheck, Network } from 'lucide-react';
import { useVpsServerInfo } from '@/hooks/useDeployForgeData';
import clsx from 'clsx';

function kbToHuman(kb: number): string {
    if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
    if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
    return `${kb} KB`;
}

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                {icon}
                <span>{title}</span>
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[#666666] font-semibold uppercase">{label}</span>
            <span className="text-white text-right truncate">{value}</span>
        </div>
    );
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    const colorClass = pct > 85 ? 'bg-rose-400' : pct > 70 ? 'bg-amber-400' : 'bg-white';
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono">
                <span className="text-[#666666] font-semibold uppercase">{label}</span>
                <span className="text-white font-bold">{kbToHuman(used)} / {kbToHuman(total)} ({pct}%)</span>
            </div>
            <div className="h-1.5 w-full rounded bg-[#000000] border border-[#1F1F1F] overflow-hidden">
                <div className={clsx('h-full transition-all duration-300', colorClass)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

interface ServerInfoTabProps {
    vps: any | null;
    vpsList?: any[];
    useServerInfoHook?: (vpsId?: string) => any;
}

export default function ServerInfoTab({ vps, useServerInfoHook = useVpsServerInfo }: ServerInfoTabProps) {
    const info = useServerInfoHook(vps?.id);

    if (!vps) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <Server size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">Select a Server Node</p>
                <p className="mt-1">Choose a VPS server from the list above to view deep system diagnostics.</p>
            </div>
        );
    }

    if (info.isLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 font-mono text-xs">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-44 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                ))}
            </div>
        );
    }

    if (info.isError) {
        return (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-5 font-mono text-xs text-rose-300 space-y-2">
                <p className="font-bold text-white">Could Not Fetch Server Information</p>
                <p>SSH connection failed or timed out. Ensure the server is online and port {vps.port} is accessible.</p>
                <button onClick={() => info.refetch()} className="h-7 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">Retry</button>
            </div>
        );
    }

    const d = info.data;
    if (!d) return null;

    return (
        <div className="space-y-4 font-mono text-xs">
            {/* Top Bar */}
            <div className="flex items-center justify-between gap-4 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3">
                <div className="flex items-center gap-2">
                    <Server size={14} className="text-white" />
                    <div>
                        <p className="font-bold text-white text-sm">{vps.name}</p>
                        <p className="text-xs text-[#A1A1A1]">{d.publicIp} · {d.hostname}</p>
                    </div>
                </div>
                <button onClick={() => info.refetch()} className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                    <RefreshCw size={12} className={info.isFetching ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Ingress Gateway & Multi-Tenant Routing */}
                <InfoCard icon={<ShieldCheck size={14} className="text-emerald-400" />} title="Ingress Gateway & Multi-Tenancy">
                    <Row label="Gateway Engine" value="Traefik v3.1 (Docker)" />
                    <Row label="Bridge Network" value="deployforge-net" />
                    <Row label="TLS Resolver" value="Let's Encrypt ACME HTTP-01" />
                    <Row label="HTTP Redirection" value="Automatic (80 → 443)" />
                    <Row label="Multi-Site Mode" value={<span className="text-emerald-400 font-bold">ACTIVE (0 Port Collisions)</span>} />
                </InfoCard>

                {/* Network */}
                <InfoCard icon={<Globe size={14} />} title="Network Configuration">
                    <Row label="Hostname" value={d.hostname} />
                    <Row label="Public IP" value={d.publicIp} />
                    <Row label="Private IP" value={d.privateIp} />
                    <Row label="SSH Port" value={vps.port} />
                </InfoCard>

                {/* OS */}
                <InfoCard icon={<Info size={14} />} title="Operating System">
                    <Row label="OS" value={d.os} />
                    <Row label="Kernel" value={d.kernel} />
                    <Row label="Architecture" value={d.architecture} />
                    <Row label="Timezone" value={d.timezone} />
                </InfoCard>

                {/* CPU */}
                <InfoCard icon={<Cpu size={14} />} title="Processor">
                    <Row label="Model" value={d.cpuModel} />
                    <Row label="CPU Cores" value={d.cpuCores} />
                </InfoCard>

                {/* Memory */}
                <InfoCard icon={<MemoryStick size={14} />} title="Memory Allocation">
                    <UsageBar used={d.ramUsed} total={d.ramTotal} label="RAM" />
                    {d.swapTotal > 0 && <UsageBar used={d.swapUsed} total={d.swapTotal} label="Swap" />}
                </InfoCard>

                {/* Storage */}
                <InfoCard icon={<HardDrive size={14} />} title="Disk Storage">
                    <Row label="Total" value={d.diskTotal} />
                    <Row label="Used" value={d.diskUsed} />
                    <Row label="Free" value={d.diskFree} />
                    <Row label="Usage" value={d.diskPercent} />
                </InfoCard>

                {/* Time */}
                <InfoCard icon={<Clock size={14} />} title="System Time & Uptime">
                    <Row label="Uptime" value={d.uptimeFormatted} />
                    <Row label="Boot Time" value={d.bootTime} />
                </InfoCard>
            </div>
        </div>
    );
}
