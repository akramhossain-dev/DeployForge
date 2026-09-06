'use client';

import { CheckCircle, XCircle, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { useVpsPreflight } from '@/hooks/useDeployForgeData';
import { PreflightCheck } from '@/lib/api/types';

interface PreflightPanelProps {
    vpsId: string;
    deploymentId?: string;
    /** If true, shows a compact inline version without a card wrapper */
    compact?: boolean;
    /** Called when preflight completes — passes `ready: boolean` */
    onResult?: (ready: boolean) => void;
}

function CheckRow({ check }: { check: PreflightCheck }) {
    const color = check.ok ? '#4ade80' : '#f87171';
    const Icon = check.ok ? CheckCircle : XCircle;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '7px 0',
            borderBottom: '1px solid #111',
        }}>
            <Icon size={13} style={{ color, marginTop: '1px', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: check.ok ? '#a1a1a1' : '#e4e4e7' }}>{check.check}</div>
                {check.message && (
                    <div style={{ fontSize: '11px', color: check.ok ? '#666' : '#f87171', marginTop: '2px' }}>
                        {check.message}
                    </div>
                )}
            </div>
        </div>
    );
}

export function PreflightPanel({ vpsId, deploymentId, compact = false, onResult }: PreflightPanelProps) {
    const { data, isLoading, isError, refetch } = useVpsPreflight(vpsId, deploymentId);

    // Fire callback when data arrives
    if (data?.preflight && onResult) {
        onResult(data.preflight.ready);
    }

    const preflight = data?.preflight;
    const ready = preflight?.ready ?? null;
    const checks = preflight?.checks ?? [];

    const passed = checks.filter((c: PreflightCheck) => c.ok).length;
    const total = checks.length;

    if (isLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: compact ? '0' : '12px 14px', color: '#666', fontSize: '12px' }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                Running preflight checks...
            </div>
        );
    }

    if (isError) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: compact ? '6px 0' : '10px 14px',
                color: '#f87171', fontSize: '12px',
            }}>
                <AlertTriangle size={13} />
                Preflight checks unavailable
                <button
                    onClick={() => refetch()}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                >
                    retry
                </button>
            </div>
        );
    }

    if (!preflight) return null;

    const content = (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Summary bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: compact ? '6px 0 10px' : '10px 14px',
                borderBottom: compact ? '1px solid #1f1f1f' : undefined,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {ready
                        ? <CheckCircle size={14} style={{ color: '#4ade80' }} />
                        : <XCircle size={14} style={{ color: '#f87171' }} />
                    }
                    <span style={{ fontSize: '12px', color: ready ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                        {ready ? 'Environment Ready' : 'Environment Not Ready'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                        {passed}/{total} checks passed
                    </span>
                </div>
                <button
                    id="preflight-refresh-btn"
                    onClick={() => refetch()}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                >
                    refresh
                </button>
            </div>

            {/* Checks list */}
            <div style={{ padding: compact ? '8px 0' : '8px 14px' }}>
                {checks.map((check: PreflightCheck, i: number) => (
                    <CheckRow key={i} check={check} />
                ))}
            </div>

            {/* Action hint for failed state */}
            {!ready && (
                <div style={{
                    margin: compact ? '8px 0 0' : '8px 14px 10px',
                    padding: '8px 12px',
                    background: 'rgba(248,113,113,0.05)',
                    border: '1px solid rgba(248,113,113,0.1)',
                    borderRadius: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <AlertTriangle size={12} style={{ color: '#f87171', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: '#a1a1a1' }}>
                        Fix the issues above before deploying. Go to the{' '}
                        <a
                            href="#"
                            style={{ color: '#fff', textDecoration: 'none' }}
                        >
                            Environment tab
                        </a>
                        {' '}to install missing runtimes.
                    </span>
                </div>
            )}
        </div>
    );

    if (compact) return (
        <>
            {content}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );

    return (
        <div style={{
            border: '1px solid #1f1f1f',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#0a0a0a',
        }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1f1f1f' }}>
                <span style={{ fontSize: '12px', color: '#a1a1a1', fontWeight: 500 }}>Deployment Preflight</span>
            </div>
            {content}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
