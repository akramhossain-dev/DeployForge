'use client';

import { ExternalLink, Copy, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatDate } from '@/components/ui';
import { useToastStore } from '@/lib/store/useToastStore';

const TIMELINE = ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING'] as const;

export function DeploymentTimeline({
    current,
    activeUrl,
    isStatic,
    failedStepIndex,
}: {
    current: any;
    activeUrl: string | null;
    isStatic: boolean;
    failedStepIndex: number;
}) {
    const addToast = useToastStore((s) => s.addToast);
    const status = (current.status || '').toUpperCase();
    const isFailed = status === 'FAILED';

    const getStepState = (stepIndex: number) => {
        if (isFailed && failedStepIndex === stepIndex) return 'failed';
        const currentIndex = TIMELINE.indexOf(status as any);
        if (currentIndex === -1) {
            if (status === 'RUNNING' || status === 'ACTIVE') return 'complete';
            return 'pending';
        }
        if (stepIndex < currentIndex) return 'complete';
        if (stepIndex === currentIndex) return 'active';
        return 'pending';
    };

    return (
        <div className="space-y-4 font-mono text-xs">
            {/* ── Metadata Chips Grid ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 sm:p-3 space-y-0.5 min-w-0">
                    <p className="text-[10px] uppercase text-[#666666] truncate">EXECUTION MODE</p>
                    <p className="font-bold text-white uppercase truncate">{current.mode || 'PRODUCTION'}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 sm:p-3 space-y-0.5 min-w-0">
                    <p className="text-[10px] uppercase text-[#666666] truncate">TARGET VPS</p>
                    <p className="font-bold text-white truncate">{current.vps?.name || 'Local Node'}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 sm:p-3 space-y-0.5 min-w-0">
                    <p className="text-[10px] uppercase text-[#666666] truncate">BRANCH</p>
                    <p className="font-bold text-white truncate">{current.branch || 'main'}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 sm:p-3 space-y-0.5 min-w-0">
                    <p className="text-[10px] uppercase text-[#666666] truncate">COMMIT HASH</p>
                    <p className="font-bold text-white truncate">{current.commitHash ? current.commitHash.slice(0, 7) : 'head'}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 sm:p-3 space-y-0.5 min-w-0">
                    <p className="text-[10px] uppercase text-[#666666] truncate">HOST PORT</p>
                    <p className="font-bold text-white truncate">{isStatic ? 'Static' : current.port ? `:${current.port}` : '—'}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 sm:p-3 space-y-0.5 min-w-0">
                    <p className="text-[10px] uppercase text-[#666666] truncate">CREATED</p>
                    <p className="font-bold text-white truncate">{formatDate(current.createdAt)}</p>
                </div>
            </div>

            {/* ── Active URL Banner ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase text-[#666666]">ACTIVE URL</p>
                    <p className="mt-0.5 font-bold text-white truncate font-mono text-xs">{activeUrl || 'Pending host assignment…'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {activeUrl && (
                        <a href={activeUrl} target="_blank" rel="noreferrer">
                            <button className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                                <ExternalLink size={12} /> Open
                            </button>
                        </a>
                    )}
                    <button
                        disabled={!activeUrl}
                        onClick={() => {
                            if (activeUrl) {
                                navigator.clipboard.writeText(activeUrl);
                                addToast({ title: 'Copied URL', description: activeUrl, severity: 'success' });
                            }
                        }}
                        className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                    >
                        <Copy size={12} /> Copy
                    </button>
                </div>
            </div>

            {/* ── Deployment Pipeline Timeline ── */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Release Pipeline Progression</p>
                    <span className="text-[10px] text-[#A1A1A1] font-bold">{status}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {TIMELINE.map((stepState, idx) => {
                        const state = getStepState(idx);
                        return (
                            <div
                                key={stepState}
                                className={clsx(
                                    'rounded border p-2.5 flex flex-col justify-between gap-2 transition-colors',
                                    state === 'complete' && 'border-[#1F1F1F] bg-[#111111]',
                                    state === 'active' && 'border-white bg-[#000000]',
                                    state === 'failed' && 'border-rose-900/50 bg-rose-950/20',
                                    state === 'pending' && 'border-[#1F1F1F]/60 bg-[#0A0A0A] opacity-60'
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[#666666]">0{idx + 1}</span>
                                    {state === 'complete' && <Check size={12} className="text-emerald-400" />}
                                    {state === 'active' && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />}
                                    {state === 'failed' && <AlertCircle size={12} className="text-rose-400" />}
                                </div>
                                <p className={clsx(
                                    'text-[10px] font-semibold uppercase tracking-wider truncate',
                                    state === 'complete' && 'text-emerald-400',
                                    state === 'active' && 'text-white',
                                    state === 'failed' && 'text-rose-400',
                                    state === 'pending' && 'text-[#666666]'
                                )}>
                                    {stepState}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
