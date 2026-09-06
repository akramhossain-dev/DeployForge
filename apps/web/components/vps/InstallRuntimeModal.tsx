'use client';

import { useState } from 'react';
import { X, Download, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useInstallRuntime, useAllowedRuntimes } from '@/hooks/useDeployForgeData';
import { Vps, RuntimeName, VpsRuntimeLog } from '@/lib/api/types';

interface InstallRuntimeModalProps {
    vps: Vps;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const RUNTIME_LABELS: Record<string, string> = {
    nodejs: 'Node.js', npm: 'npm', pnpm: 'pnpm', yarn: 'Yarn', bun: 'Bun',
    python: 'Python', java: 'Java (OpenJDK)', php: 'PHP', go: 'Go', ruby: 'Ruby',
    docker: 'Docker CE', 'docker-compose': 'Docker Compose Plugin',
    redis: 'Redis', postgresql: 'PostgreSQL', mysql: 'MySQL', nginx: 'Nginx',
};

const RUNTIME_GROUPS = [
    { label: 'JavaScript / Node', items: ['nodejs', 'npm', 'pnpm', 'yarn', 'bun'] as RuntimeName[] },
    { label: 'Languages', items: ['python', 'java', 'go', 'php', 'ruby'] as RuntimeName[] },
    { label: 'Containers', items: ['docker', 'docker-compose'] as RuntimeName[] },
    { label: 'Services', items: ['redis', 'postgresql', 'mysql', 'nginx'] as RuntimeName[] },
];

function LogLine({ entry }: { entry: VpsRuntimeLog }) {
    const color = entry.level === 'success' ? '#4ade80'
        : entry.level === 'error' ? '#f87171'
        : entry.level === 'warn' ? '#facc15'
        : '#a1a1a1';

    const prefix = entry.level === 'success' ? '✓' : entry.level === 'error' ? '✗' : entry.level === 'warn' ? '⚠' : '→';

    return (
        <div style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
            <span style={{ color, flexShrink: 0, fontFamily: 'monospace', fontSize: '12px' }}>{prefix}</span>
            <span style={{ color, fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>{entry.message}</span>
        </div>
    );
}

export function InstallRuntimeModal({ vps, open, onClose, onSuccess }: InstallRuntimeModalProps) {
    const [selected, setSelected] = useState<Set<RuntimeName>>(new Set());
    const [logs, setLogs] = useState<VpsRuntimeLog[]>([]);
    const [phase, setPhase] = useState<'select' | 'installing' | 'done'>('select');
    const [success, setSuccess] = useState(false);

    const { data: allowedRuntimes } = useAllowedRuntimes();
    const install = useInstallRuntime(vps.id);

    function toggleRuntime(name: RuntimeName) {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    }

    async function handleInstall() {
        if (selected.size === 0) return;
        setPhase('installing');
        setLogs([]);

        try {
            const result = await install.mutateAsync([...selected]);
            setLogs(result.logs || []);
            setSuccess(result.verification?.every((v: any) => v.ok) ?? true);
            setPhase('done');
            if (result.verification?.every((v: any) => v.ok)) {
                setTimeout(() => onSuccess(), 1200);
            }
        } catch (err: any) {
            setLogs([{ timestamp: new Date().toISOString(), message: err?.message || 'Installation failed', level: 'error' }]);
            setPhase('done');
            setSuccess(false);
        }
    }

    function handleClose() {
        setPhase('select');
        setSelected(new Set());
        setLogs([]);
        setSuccess(false);
        onClose();
    }

    if (!open) return null;

    const allowed = new Set(allowedRuntimes || []);

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '24px',
            }}
            onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
            <div
                id="install-runtime-modal"
                style={{
                    background: '#0a0a0a',
                    border: '1px solid #1f1f1f',
                    borderRadius: '8px',
                    width: '100%',
                    maxWidth: '540px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderBottom: '1px solid #1f1f1f',
                }}>
                    <div>
                        <h2 style={{ fontSize: '13px', color: '#fff', fontWeight: 500, margin: 0 }}>Install Runtime</h2>
                        <p style={{ fontSize: '11px', color: '#666', margin: '2px 0 0' }}>on {vps.name} ({vps.ipAddress})</p>
                    </div>
                    <button
                        id="close-install-modal-btn"
                        onClick={handleClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '4px' }}
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
                    {phase === 'select' && (
                        <>
                            {RUNTIME_GROUPS.map((group) => {
                                const items = group.items.filter((name) => !allowedRuntimes || allowed.has(name));
                                if (items.length === 0) return null;
                                return (
                                    <div key={group.label}>
                                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {group.label}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                                            {items.map((name) => {
                                                const isSelected = selected.has(name);
                                                return (
                                                    <button
                                                        key={name}
                                                        id={`runtime-select-${name}`}
                                                        onClick={() => toggleRuntime(name)}
                                                        style={{
                                                            padding: '8px 12px',
                                                            background: isSelected ? 'rgba(255,255,255,0.04)' : '#111',
                                                            border: `1px solid ${isSelected ? '#333' : '#1f1f1f'}`,
                                                            borderRadius: '5px',
                                                            color: isSelected ? '#fff' : '#a1a1a1',
                                                            fontSize: '12px',
                                                            fontFamily: 'monospace',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            transition: 'border-color 0.1s, color 0.1s',
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '14px', height: '14px',
                                                            border: `1px solid ${isSelected ? '#555' : '#333'}`,
                                                            borderRadius: '3px',
                                                            background: isSelected ? '#222' : 'transparent',
                                                            flexShrink: 0,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            {isSelected && <div style={{ width: '6px', height: '6px', background: '#fff', borderRadius: '1px' }} />}
                                                        </div>
                                                        {RUNTIME_LABELS[name] || name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {(phase === 'installing' || phase === 'done') && (
                        <div>
                            <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>Installation Log</div>
                            <div style={{
                                background: '#000',
                                border: '1px solid #1f1f1f',
                                borderRadius: '5px',
                                padding: '12px',
                                fontFamily: 'monospace',
                                minHeight: '160px',
                                maxHeight: '280px',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                            }}>
                                {phase === 'installing' && logs.length === 0 && (
                                    <div style={{ color: '#666', fontSize: '12px', fontFamily: 'monospace' }}>
                                        → Connecting to {vps.ipAddress}...
                                    </div>
                                )}
                                {logs.map((entry, i) => <LogLine key={i} entry={entry} />)}
                                {phase === 'installing' && (
                                    <div style={{ color: '#666', fontSize: '12px', fontFamily: 'monospace', display: 'flex', gap: '4px' }}>
                                        <span style={{ animation: 'pulse 1s ease infinite' }}>▌</span>
                                    </div>
                                )}
                            </div>
                            {phase === 'done' && (
                                <div style={{
                                    marginTop: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    background: success ? 'rgba(34,197,94,0.05)' : 'rgba(248,113,113,0.05)',
                                    border: `1px solid ${success ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)'}`,
                                    borderRadius: '5px',
                                }}>
                                    {success
                                        ? <CheckCircle size={13} style={{ color: '#4ade80' }} />
                                        : <XCircle size={13} style={{ color: '#f87171' }} />
                                    }
                                    <span style={{ fontSize: '12px', color: success ? '#4ade80' : '#f87171' }}>
                                        {success ? 'All runtimes installed and verified' : 'Installation completed with errors'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid #1f1f1f',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                }}>
                    <button
                        onClick={handleClose}
                        style={{
                            padding: '7px 14px',
                            background: 'none',
                            border: '1px solid #1f1f1f',
                            borderRadius: '5px',
                            color: '#666',
                            fontSize: '12px',
                            cursor: 'pointer',
                        }}
                    >
                        {phase === 'done' ? 'Close' : 'Cancel'}
                    </button>
                    {phase === 'select' && (
                        <button
                            id="confirm-install-btn"
                            onClick={handleInstall}
                            disabled={selected.size === 0 || install.isPending}
                            style={{
                                padding: '7px 14px',
                                background: selected.size === 0 ? '#111' : '#1a1a1a',
                                border: `1px solid ${selected.size === 0 ? '#1f1f1f' : '#333'}`,
                                borderRadius: '5px',
                                color: selected.size === 0 ? '#444' : '#fff',
                                fontSize: '12px',
                                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <Download size={12} />
                            Install {selected.size > 0 ? `(${selected.size})` : ''}
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            `}</style>
        </div>
    );
}
