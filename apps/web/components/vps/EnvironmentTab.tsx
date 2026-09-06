'use client';

import { useState } from 'react';
import { RefreshCw, Download, Cpu, HardDrive, MemoryStick, Clock, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useVpsEnvironment } from '@/hooks/useDeployForgeData';
import { Vps, InstalledRuntime, ServiceStatus } from '@/lib/api/types';
import { InstallRuntimeModal } from './InstallRuntimeModal';

interface EnvironmentTabProps {
    vps: Vps;
}

const RUNTIME_LABELS: Record<string, string> = {
    nodejs: 'Node.js', npm: 'npm', pnpm: 'pnpm', yarn: 'Yarn', bun: 'Bun',
    python: 'Python', java: 'Java', php: 'PHP', go: 'Go', ruby: 'Ruby',
    docker: 'Docker', 'docker-compose': 'Docker Compose',
    redis: 'Redis', postgresql: 'PostgreSQL', mysql: 'MySQL', nginx: 'Nginx',
};

function ServiceBadge({ status }: { status: 'running' | 'stopped' | 'not_installed' }) {
    if (status === 'running') return (
        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)', fontFamily: 'monospace' }}>
            running
        </span>
    );
    if (status === 'stopped') return (
        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234,179,8,0.1)', color: '#facc15', border: '1px solid rgba(234,179,8,0.2)', fontFamily: 'monospace' }}>
            stopped
        </span>
    );
    return (
        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#111', color: '#666', border: '1px solid #1f1f1f', fontFamily: 'monospace' }}>
            not installed
        </span>
    );
}

function RuntimeStatusIcon({ installed }: { installed: boolean }) {
    if (installed) return <CheckCircle size={13} style={{ color: '#4ade80', flexShrink: 0 }} />;
    return <XCircle size={13} style={{ color: '#666', flexShrink: 0 }} />;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
    return (
        <div style={{
            padding: '12px 14px',
            background: '#0a0a0a',
            border: '1px solid #1f1f1f',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            minWidth: 0,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666', fontSize: '11px' }}>
                {icon}
                {label}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#fff', fontWeight: 500 }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: '#666' }}>{sub}</div>}
        </div>
    );
}

export function EnvironmentTab({ vps }: EnvironmentTabProps) {
    const { data: scan, isLoading, isFetching, refetch } = useVpsEnvironment(vps.id);
    const [installOpen, setInstallOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const installedRuntimes = scan?.runtimes?.filter((r: InstalledRuntime) => r.installed) ?? [];
    const missingRuntimes = scan?.runtimes?.filter((r: InstalledRuntime) => !r.installed) ?? [];
    const visibleMissing = showAll ? missingRuntimes : missingRuntimes.slice(0, 4);

    function formatUptime(seconds: number) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                    <h3 style={{ fontSize: '13px', color: '#fff', fontWeight: 500, margin: 0 }}>Runtime Environment</h3>
                    {scan?.scannedAt && (
                        <p style={{ fontSize: '11px', color: '#666', margin: '2px 0 0' }}>
                            Last scanned: {new Date(scan.scannedAt).toLocaleString()}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        id="install-runtime-btn"
                        onClick={() => setInstallOpen(true)}
                        style={{
                            padding: '6px 12px',
                            background: '#111',
                            border: '1px solid #1f1f1f',
                            borderRadius: '5px',
                            color: '#a1a1a1',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <Download size={12} />
                        Install Runtime
                    </button>
                    <button
                        id="scan-vps-env-btn"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        style={{
                            padding: '6px 12px',
                            background: isFetching ? '#0a0a0a' : '#111',
                            border: '1px solid #1f1f1f',
                            borderRadius: '5px',
                            color: isFetching ? '#444' : '#a1a1a1',
                            fontSize: '12px',
                            cursor: isFetching ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : undefined }} />
                        {isFetching ? 'Scanning...' : 'Scan'}
                    </button>
                </div>
            </div>

            {isLoading && !scan && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                    Click Scan to load VPS environment data...
                </div>
            )}

            {isFetching && !scan && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                    Scanning VPS...
                </div>
            )}

            {scan && (
                <>
                    {/* System metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        <StatCard
                            icon={<Cpu size={11} />}
                            label="CPU"
                            value={`${scan.system.cpuCores} cores`}
                            sub={scan.system.cpuModel}
                        />
                        <StatCard
                            icon={<MemoryStick size={11} />}
                            label="Memory"
                            value={`${scan.system.ramFreeMb} MB free`}
                            sub={`of ${scan.system.ramTotalMb} MB`}
                        />
                        <StatCard
                            icon={<HardDrive size={11} />}
                            label="Disk"
                            value={`${scan.system.diskFree} free`}
                            sub={`${scan.system.diskPercent} used of ${scan.system.diskTotal}`}
                        />
                        <StatCard
                            icon={<Clock size={11} />}
                            label="Uptime"
                            value={formatUptime(scan.system.uptimeSeconds)}
                            sub={`${scan.system.os} ${scan.system.osVersion}`}
                        />
                    </div>

                    {/* Installed runtimes table */}
                    <div style={{ border: '1px solid #1f1f1f', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: '#0a0a0a', borderBottom: '1px solid #1f1f1f' }}>
                            <span style={{ fontSize: '12px', color: '#a1a1a1', fontWeight: 500 }}>
                                Installed Runtimes ({installedRuntimes.length})
                            </span>
                        </div>
                        {installedRuntimes.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#444', fontSize: '12px' }}>
                                No runtimes detected
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #1f1f1f' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: '11px', color: '#666', fontWeight: 500 }}>Runtime</th>
                                        <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: '11px', color: '#666', fontWeight: 500 }}>Version</th>
                                        <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: '11px', color: '#666', fontWeight: 500 }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {installedRuntimes.map((r: InstalledRuntime, i: number) => (
                                        <tr key={r.name} style={{ borderBottom: i < installedRuntimes.length - 1 ? '1px solid #111' : undefined }}>
                                            <td style={{ padding: '8px 14px', fontSize: '12px', color: '#a1a1a1', fontFamily: 'monospace' }}>
                                                {RUNTIME_LABELS[r.name] || r.name}
                                            </td>
                                            <td style={{ padding: '8px 14px', fontSize: '12px', color: '#fff', fontFamily: 'monospace' }}>
                                                {r.version || '—'}
                                            </td>
                                            <td style={{ padding: '8px 14px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <RuntimeStatusIcon installed={r.installed} />
                                                    <span style={{ fontSize: '11px', color: r.installed ? '#4ade80' : '#666' }}>
                                                        {r.installed ? 'installed' : 'missing'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Missing runtimes */}
                    {missingRuntimes.length > 0 && (
                        <div style={{ border: '1px solid #1f1f1f', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 14px', background: '#0a0a0a', borderBottom: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={12} style={{ color: '#666' }} />
                                <span style={{ fontSize: '12px', color: '#a1a1a1', fontWeight: 500 }}>
                                    Not Installed ({missingRuntimes.length})
                                </span>
                            </div>
                            <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {visibleMissing.map((r: InstalledRuntime) => (
                                    <span
                                        key={r.name}
                                        style={{
                                            fontSize: '11px',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            background: '#111',
                                            border: '1px solid #1f1f1f',
                                            color: '#666',
                                            fontFamily: 'monospace',
                                        }}
                                    >
                                        {RUNTIME_LABELS[r.name] || r.name}
                                    </span>
                                ))}
                            </div>
                            {missingRuntimes.length > 4 && (
                                <button
                                    onClick={() => setShowAll(!showAll)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: 'none',
                                        border: 'none',
                                        borderTop: '1px solid #1f1f1f',
                                        color: '#666',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                    }}
                                >
                                    {showAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                    {showAll ? 'Show less' : `Show ${missingRuntimes.length - 4} more`}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Services */}
                    <div style={{ border: '1px solid #1f1f1f', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: '#0a0a0a', borderBottom: '1px solid #1f1f1f' }}>
                            <span style={{ fontSize: '12px', color: '#a1a1a1', fontWeight: 500 }}>Service Status</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {(Object.entries(scan.services) as [keyof ServiceStatus, string][]).map(([name, status], i, arr) => (
                                    <tr key={name} style={{ borderBottom: i < arr.length - 1 ? '1px solid #111' : undefined }}>
                                        <td style={{ padding: '8px 14px', fontSize: '12px', color: '#a1a1a1', width: '40%', fontFamily: 'monospace' }}>
                                            {RUNTIME_LABELS[name] || name}
                                        </td>
                                        <td style={{ padding: '8px 14px' }}>
                                            <ServiceBadge status={status as any} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <InstallRuntimeModal
                vps={vps}
                open={installOpen}
                onClose={() => setInstallOpen(false)}
                onSuccess={() => {
                    setInstallOpen(false);
                    refetch();
                }}
            />

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
