'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    AlertCircle, ArrowLeft, CheckCircle2, Circle, Clock, Copy, ExternalLink,
    GitBranch, Github, Globe, Loader2, Pause, Play, RefreshCw, RotateCcw,
    Server, Square, TerminalSquare, Trash2, XCircle, Zap, PackagePlus,
    Search, Edit2, Plus, Download, Maximize2, Minimize2, Wifi, WifiOff
} from 'lucide-react';
import clsx from 'clsx';
import { formatDate } from '@/components/ui';
import {
    useDeleteDeployment, useDeployment, useDeploymentLogs, useDeploymentLogStream,
    useDeploymentStatusStream, usePauseDeployment, useRestartDeployment,
    useResumeDeployment, useRollbackDeployment, useStartDeployment, useStopDeployment,
    useDeploymentEnv, useUpdateDeploymentEnv, useRedeploy, type EnvFile
} from '@/hooks/useDeployForgeData';
import type { DeploymentLog } from '@/lib/api/types';
import { parseError } from '@/lib/utils/errorParser';
import { useToastStore } from '@/lib/store/useToastStore';

const TIMELINE = ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING'] as const;
const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function getSourceType(d?: { sourceType?: string; project?: { repositoryUrl?: string | null } | null }) {
    return d?.sourceType || (d?.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
}

function mergeLogs(a: DeploymentLog[], b: DeploymentLog[]) {
    const map = new Map<string, DeploymentLog>();
    [...a, ...b].forEach((l) => map.set(l.id, l));
    return Array.from(map.values()).sort(
        (x, y) => new Date(x.createdAt || x.timestamp || 0).getTime() - new Date(y.createdAt || y.timestamp || 0).getTime()
    );
}

function StatusTag({ status }: { status?: string }) {
    const s = (status || 'PENDING').toUpperCase();
    let style = 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';
    if (['RUNNING', 'SUCCESS', 'ACTIVE', 'COMPLETED'].includes(s)) style = 'border-[#1F1F1F] bg-[#000000] text-emerald-400';
    else if (['FAILED', 'ERROR', 'BROKEN'].includes(s)) style = 'border-rose-900/40 bg-rose-950/20 text-rose-400';
    else if (['BUILDING', 'DEPLOYING', 'CLONING', 'PENDING'].includes(s)) style = 'border-[#1F1F1F] bg-[#000000] text-cyan-400';

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', style)}>
            {s}
        </span>
    );
}

export default function DeploymentDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const addToast = useToastStore((s) => s.addToast);

    const deployment = useDeployment(id);
    const initialLogs = useDeploymentLogs(id);
    const [logsPaused, setLogsPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [logFilter, setLogFilter] = useState<'all' | 'build' | 'runtime' | 'system' | 'error'>('all');
    const [logsSearchQuery, setLogsSearchQuery] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);

    const stream = useDeploymentLogStream(id, !logsPaused);
    const liveStatus = useDeploymentStatusStream(id);
    const start = useStartDeployment();
    const stop = useStopDeployment();
    const pauseDeployment = usePauseDeployment();
    const resume = useResumeDeployment();
    const restart = useRestartDeployment();
    const rollback = useRollbackDeployment();
    const deleteDeployment = useDeleteDeployment();
    const consoleRef = useRef<HTMLDivElement>(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [envModalOpen, setEnvModalOpen] = useState(false);
    const { data: decEnvResponse } = useDeploymentEnv(id);
    const updateEnv = useUpdateDeploymentEnv();
    const redeploy = useRedeploy();
    const [draftFiles, setDraftFiles] = useState<EnvFile[]>([]);

    useEffect(() => {
        if (decEnvResponse?.files) {
            setDraftFiles(JSON.parse(JSON.stringify(decEnvResponse.files)));
        }
    }, [decEnvResponse, envModalOpen]);

    const current = liveStatus ? { ...deployment.data, ...liveStatus } : deployment.data;
    const logs = useMemo(() => mergeLogs(initialLogs.data || [], stream.logs), [initialLogs.data, stream.logs]);

    const filteredLogs = useMemo(() => {
        let list = logs;
        if (logFilter === 'build') list = list.filter((l) => l.type === 'build');
        else if (logFilter === 'runtime') list = list.filter((l) => l.type === 'runtime');
        else if (logFilter === 'system') list = list.filter((l) => l.type === 'system');
        else if (logFilter === 'error') list = list.filter((l) => l.level === 'error' || l.type === 'error' || /failed|error|exception/i.test(l.message || l.output || ''));

        if (logsSearchQuery.trim()) {
            const q = logsSearchQuery.toLowerCase();
            list = list.filter((l) => (l.message || l.output || '').toLowerCase().includes(q));
        }
        return list;
    }, [logs, logFilter, logsSearchQuery]);

    useEffect(() => {
        if (autoScroll) consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
    }, [filteredLogs, autoScroll]);

    const sourceType = getSourceType(current);
    const isStatic = current?.type === 'STATIC' || ['STATIC', 'VITE_REACT', 'ASTRO'].includes(current?.framework || '');
    const canRestart = current?.status === 'RUNNING' && (isStatic || Boolean(current.containerId));
    const canRollback = sourceType === 'github' && !isStatic;
    const activeUrl = current?.url || (current?.vps?.ipAddress && isStatic
        ? current.port ? `http://${current.vps.ipAddress}:${current.port}/site/${current.id}/` : `http://${current.vps.ipAddress}/site/${current.id}/`
        : current?.vps?.ipAddress && current?.port ? `http://${current.vps.ipAddress}:${current.port}` : null);

    const isRunning = current?.status === 'RUNNING';
    const isPaused = current?.status === 'PAUSED';
    const isStopped = current?.status === 'STOPPED';

    const handleCopyLogs = () => {
        const text = filteredLogs.map((l) => `[${formatDate(l.createdAt || l.timestamp)}] ${l.message || l.output || ''}`).join('\n');
        navigator.clipboard.writeText(text);
        addToast({ title: 'Copied', description: `Copied ${filteredLogs.length} log lines`, severity: 'success' });
    };

    const handleDownloadLogs = () => {
        const text = filteredLogs.map((l) => `[${formatDate(l.createdAt || l.timestamp)}] ${l.message || l.output || ''}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `deployment-${id}-logs.txt`;
        a.click();
    };

    if (deployment.isLoading) {
        return (
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading deployment details...
            </div>
        );
    }

    if (deployment.isError || !current) {
        return (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-6 font-mono text-xs text-rose-300">
                <p className="font-bold text-white">Unable to load deployment run</p>
                <p className="mt-1">{(deployment.error as Error)?.message || 'Deployment ID not found.'}</p>
                <Link href="/deployments" className="mt-3 inline-flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                    Return to Deployments
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 font-mono text-xs">

            {/* ── 1. Page Header & Actions Toolbar ── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-[#1F1F1F] pb-5">
                <div className="flex items-center gap-3">
                    <Link href="/deployments">
                        <button className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white transition-colors">
                            <ArrowLeft size={14} />
                        </button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                                {current.name || current.project?.name || 'Deployment Run'}
                            </h1>
                            <StatusTag status={current.status} />
                        </div>
                        <p className="mt-1 text-xs text-[#A1A1A1]">
                            {current.project?.repositoryUrl?.replace('upload://', '') || 'Release execution logs and host details.'}
                        </p>
                    </div>
                </div>

                {/* Operations Bar */}
                <div className="flex flex-wrap items-center gap-2">
                    {isStopped && (
                        <button onClick={() => start.mutate(id)} disabled={start.isPending} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                            {start.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Start
                        </button>
                    )}
                    {isPaused && (
                        <button onClick={() => resume.mutate(id)} disabled={resume.isPending} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                            {resume.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Resume
                        </button>
                    )}
                    {isRunning && (
                        <>
                            <button onClick={() => stop.mutate(id)} disabled={stop.isPending} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                                {stop.isPending ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Stop
                            </button>
                            <button onClick={() => pauseDeployment.mutate(id)} disabled={pauseDeployment.isPending} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                                {pauseDeployment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />} Pause
                            </button>
                            <button onClick={() => restart.mutate(id)} disabled={restart.isPending || !canRestart} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A] disabled:opacity-50">
                                {restart.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Restart
                            </button>
                        </>
                    )}
                    {canRollback && isRunning && (
                        <button onClick={() => rollback.mutate({ id })} disabled={rollback.isPending} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A] disabled:opacity-50">
                            {rollback.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Rollback
                        </button>
                    )}
                    <button onClick={() => setEnvModalOpen(true)} className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                        <Edit2 size={13} /> Env Vars
                    </button>
                    <button onClick={() => setDeleteOpen(true)} className="flex h-8 items-center gap-1 rounded border border-rose-900/40 bg-rose-950/20 px-2.5 text-xs text-rose-300 hover:bg-rose-900/30">
                        <Trash2 size={13} /> Delete
                    </button>
                </div>
            </div>

            {/* ── 2. Meta Grid ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-0.5">
                    <p className="text-[10px] uppercase text-[#666666]">EXECUTION MODE</p>
                    <p className="font-bold text-white uppercase">{current.mode || 'PRODUCTION'}</p>
                </div>
                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-0.5">
                    <p className="text-[10px] uppercase text-[#666666]">TARGET VPS</p>
                    <p className="font-bold text-white truncate">{current.vps?.name || 'Local Node'}</p>
                </div>
                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-0.5">
                    <p className="text-[10px] uppercase text-[#666666]">BRANCH</p>
                    <p className="font-bold text-white truncate">{current.branch || 'main'}</p>
                </div>
                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-0.5">
                    <p className="text-[10px] uppercase text-[#666666]">COMMIT HASH</p>
                    <p className="font-bold text-white">{current.commitHash ? current.commitHash.slice(0, 7) : 'head'}</p>
                </div>
                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-0.5">
                    <p className="text-[10px] uppercase text-[#666666]">HOST PORT</p>
                    <p className="font-bold text-white">{current.port ? `:${current.port}` : '—'}</p>
                </div>
                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3 space-y-0.5">
                    <p className="text-[10px] uppercase text-[#666666]">CREATED</p>
                    <p className="font-bold text-white truncate">{formatDate(current.createdAt)}</p>
                </div>
            </div>

            {/* Live URL Link Card */}
            {activeUrl && (
                <div className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                        <Globe size={14} className="text-emerald-400" />
                        <span className="text-[#666666]">Endpoint:</span>
                        <a href={activeUrl} target="_blank" rel="noreferrer" className="font-bold text-white underline hover:text-[#A1A1A1]">
                            {activeUrl}
                        </a>
                    </div>
                    <a href={activeUrl} target="_blank" rel="noreferrer" className="text-xs text-[#A1A1A1] hover:text-white flex items-center gap-1">
                        <span>Open</span>
                        <ExternalLink size={12} />
                    </a>
                </div>
            )}

            {/* ── 3. Console Logs Terminal Box ── */}
            <div className={clsx('rounded-md border border-[#1F1F1F] bg-[#0A0A0A] flex flex-col', isFullscreen ? 'fixed inset-4 z-50' : 'h-[500px]')}>
                {/* Terminal Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1F1F1F] bg-[#111111] px-4 py-2 text-xs">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                            <TerminalSquare size={14} />
                            <span>Execution Log Terminal</span>
                        </div>

                        {/* Stream status indicator */}
                        <div className="flex items-center gap-1 text-[10px] text-[#666666]">
                            {!logsPaused ? (
                                <span className="flex items-center gap-1 text-emerald-400">
                                    <Wifi size={11} /> LIVE STREAM ACTIVE
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-[#666666]">
                                    <WifiOff size={11} /> STREAM PAUSED
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Filter tabs */}
                        <div className="flex items-center gap-1 border-r border-[#1F1F1F] pr-2 text-[10px]">
                            {(['all', 'build', 'runtime', 'system', 'error'] as const).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setLogFilter(filter)}
                                    className={clsx(
                                        'rounded px-2 py-0.5 uppercase transition-colors',
                                        logFilter === filter ? 'bg-[#000000] font-bold text-white border border-[#333333]' : 'text-[#666666] hover:text-white'
                                    )}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>

                        {/* Logs Search Input */}
                        <div className="relative">
                            <input
                                value={logsSearchQuery}
                                onChange={(e) => setLogsSearchQuery(e.target.value)}
                                placeholder="Filter log output..."
                                className="h-6 w-36 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[11px] text-white outline-none placeholder:text-[#666666] focus:border-[#333333]"
                            />
                        </div>

                        {/* Utility actions */}
                        <button
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={clsx('h-6 rounded border px-2 text-[10px] uppercase', autoScroll ? 'border-white bg-[#000000] text-white' : 'border-[#1F1F1F] text-[#666666]')}
                        >
                            Auto-scroll
                        </button>
                        <button onClick={handleCopyLogs} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white">
                            <Copy size={11} />
                        </button>
                        <button onClick={handleDownloadLogs} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white">
                            <Download size={11} />
                        </button>
                        <button onClick={() => setIsFullscreen(!isFullscreen)} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white">
                            {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                        </button>
                    </div>
                </div>

                {/* Console Log Scroll Content */}
                <div ref={consoleRef} className="flex-1 overflow-y-auto p-4 bg-[#000000] space-y-1 font-mono text-[11px] leading-relaxed no-scrollbar">
                    {filteredLogs.length === 0 ? (
                        <div className="py-12 text-center text-[#666666]">
                            No log entries available for this view.
                        </div>
                    ) : (
                        filteredLogs.map((l) => (
                            <div key={l.id} className="flex items-start gap-3 hover:bg-[#111111]/40 px-1 py-0.5 rounded">
                                <span className="text-[#666666] shrink-0">{formatDate(l.createdAt || l.timestamp)}</span>
                                <span className={clsx(
                                    'shrink-0 text-[10px] uppercase font-bold px-1 rounded',
                                    l.level === 'error' ? 'bg-rose-950/40 text-rose-400' : 'bg-[#111111] text-[#A1A1A1]'
                                )}>
                                    {l.type || 'sys'}
                                </span>
                                <span className="text-[#A1A1A1] break-all whitespace-pre-wrap">{l.message || l.output || ''}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── 4. Delete Modal Confirmation ── */}
            {deleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                        <div className="border-b border-[#1F1F1F] pb-3">
                            <h3 className="text-sm font-bold text-white">Delete Deployment Run</h3>
                            <p className="mt-1 text-[#666666]">This action removes container routing and deployment history.</p>
                        </div>
                        <p className="text-[#A1A1A1]">
                            Confirm deletion of release <span className="font-bold text-white">{current.name || id}</span>:
                        </p>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setDeleteOpen(false)} className="flex h-8 items-center rounded border border-[#1F1F1F] bg-[#111111] px-3 text-white hover:bg-[#1A1A1A]">
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await deleteDeployment.mutateAsync(id);
                                    router.push('/deployments');
                                }}
                                disabled={deleteDeployment.isPending}
                                className="flex h-8 items-center gap-1 rounded border border-rose-900/40 bg-rose-950/40 px-3 font-semibold text-rose-300 hover:bg-rose-900/60"
                            >
                                {deleteDeployment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 5. Environment Variables Modal ── */}
            {envModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-2xl rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                            <h3 className="text-sm font-bold text-white">Environment Variables Configuration</h3>
                            <button onClick={() => setEnvModalOpen(false)} className="text-[#666666] hover:text-white">✕</button>
                        </div>
                        <div className="space-y-3">
                            {draftFiles.length === 0 ? (
                                <div className="py-6 text-center text-[#666666]">
                                    No environment variables defined for this deployment.
                                </div>
                            ) : (
                                draftFiles.map((file, idx) => (
                                    <div key={idx} className="rounded border border-[#1F1F1F] bg-[#000000] p-3 space-y-2">
                                        <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-2 text-[#A1A1A1]">
                                            <span className="font-bold text-white">{file.path}</span>
                                            <span className="text-[10px]">{Object.keys(file.variables || {}).length} variables</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {Object.entries(file.variables || {}).map(([key, val]) => (
                                                <div key={key} className="flex items-center gap-2">
                                                    <span className="w-1/3 truncate text-[#666666]">{key}</span>
                                                    <span className="w-2/3 truncate text-white">{val ? '••••••••' : '(empty)'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-[#1F1F1F]">
                            <button onClick={() => setEnvModalOpen(false)} className="flex h-8 items-center rounded border border-[#1F1F1F] bg-[#111111] px-3 text-white hover:bg-[#1A1A1A]">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
