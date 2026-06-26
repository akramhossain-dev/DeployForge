'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    AlertCircle, ArrowLeft, CheckCircle2, Circle, Clock, Copy, ExternalLink,
    GitBranch, Github, Globe, Loader2, Pause, Play, RefreshCw, RotateCcw,
    Server, Square, TerminalSquare, Trash2, XCircle, Zap, PackagePlus,
} from 'lucide-react';
import clsx from 'clsx';
import { AppModal, Button, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate, inputClassName } from '@/components/ui';
import {
    useDeleteDeployment, useDeployment, useDeploymentLogs, useDeploymentLogStream,
    useDeploymentStatusStream, usePauseDeployment, useRestartDeployment,
    useResumeDeployment, useRollbackDeployment, useStartDeployment, useStopDeployment,
} from '@/hooks/useDeployForgeData';
import type { DeploymentLog } from '@/lib/api/types';
import { parseError } from '@/lib/utils/errorParser';
import { useToastStore } from '@/lib/store/useToastStore';
import Link from 'next/link';

const TIMELINE = ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING'] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────
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

function getProgressMessage(status: string, logs: DeploymentLog[]): string {
    const s = (status || '').toUpperCase();
    if (s === 'PENDING') return 'Queued for execution';
    if (s === 'CLONING') return 'Cloning repository…';
    if (s === 'UPLOADING') return 'Uploading archive…';
    if (s === 'EXTRACTING') return 'Extracting archive…';
    if (s === 'BUILDING') {
        const hasInstall = logs.some(l => /(install|npm ci|yarn|pnpm|bun)/i.test(l.message || l.output || ''));
        return hasInstall ? 'Installing dependencies…' : 'Building application…';
    }
    if (s === 'DEPLOYING') {
        const txt = logs.map(l => l.message || l.output || '').join('\n').toLowerCase();
        if (/(health.?check|probe)/i.test(txt)) return 'Health check…';
        if (/(container started|starting)/i.test(txt)) return 'Starting container…';
        return 'Creating container…';
    }
    if (s === 'RUNNING') return 'Deployment successful';
    if (s === 'FAILED') return 'Deployment failed';
    if (s === 'STOPPED') return 'Stopped';
    if (s === 'PAUSED') return 'Paused';
    return s;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{icon}{label}</span>
            <span className="text-sm font-black text-white">{value}</span>
        </div>
    );
}

function TimelineStep({ state, current, failedIndex }: { state: string; current?: string; failedIndex: number }) {
    const ci = TIMELINE.indexOf(current as typeof TIMELINE[number]);
    const oi = TIMELINE.indexOf(state as typeof TIMELINE[number]);
    const isActive = current === state && current !== 'RUNNING';
    let complete = false, failed = false;

    if (current === 'FAILED') {
        if (oi < failedIndex) complete = true;
        else if (oi === failedIndex) failed = true;
    } else {
        complete = current === 'RUNNING' || (ci >= oi && oi >= 0);
    }

    return (
        <div className={clsx(
            'relative flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all',
            complete && 'border-emerald-400/25 bg-emerald-400/8',
            failed && 'border-rose-400/25 bg-rose-400/8',
            isActive && 'border-cyan-300/30 bg-cyan-300/10 shadow-lg shadow-cyan-950/20',
            !complete && !failed && !isActive && 'border-white/[0.07] bg-white/[0.02]'
        )}>
            <div className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-full',
                complete && 'bg-emerald-400/15 text-emerald-300',
                failed && 'bg-rose-400/15 text-rose-300',
                isActive && 'bg-cyan-300/15 text-cyan-200',
                !complete && !failed && !isActive && 'bg-white/[0.05] text-slate-600'
            )}>
                {complete ? <CheckCircle2 size={16} /> : failed ? <XCircle size={16} /> : isActive ? <Loader2 size={14} className="animate-spin" /> : <Circle size={14} />}
            </div>
            <p className={clsx(
                'text-[10px] font-black uppercase leading-tight',
                complete && 'text-emerald-300',
                failed && 'text-rose-300',
                isActive && 'text-cyan-200',
                !complete && !failed && !isActive && 'text-slate-600'
            )}>
                {state.toLowerCase().replace('_', ' ')}
            </p>
        </div>
    );
}

function LogLine({ log }: { log: DeploymentLog }) {
    const text = log.message || log.output || '';
    const isError = log.level === 'error' || /failed|error/i.test(text);
    const isWarn = log.level === 'warn' || /warn/i.test(text);
    const isSuccess = /success|running/i.test(text);
    return (
        <div className={clsx(
            'flex gap-3 rounded px-2 py-0.5 font-mono text-xs leading-5',
            isError && 'text-rose-300 bg-rose-500/5',
            isWarn && !isError && 'text-amber-300',
            isSuccess && !isError && !isWarn && 'text-emerald-300',
            !isError && !isWarn && !isSuccess && 'text-slate-400'
        )}>
            <span className="shrink-0 text-slate-600">{formatDate(log.createdAt || log.timestamp)}</span>
            <span className="break-all">{text}</span>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0 last:pb-0">
            <span className="text-xs text-slate-500 shrink-0">{label}</span>
            <span className="text-xs font-bold text-slate-200 text-right truncate">{value}</span>
        </div>
    );
}

function ActionRow({ label, enabled }: { label: string; enabled: boolean }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <span className="text-xs font-bold text-slate-300">{label}</span>
            <span className={clsx('text-[11px] font-black uppercase', enabled ? 'text-emerald-300' : 'text-slate-600')}>{enabled ? 'Available' : 'N/A'}</span>
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DeploymentDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const deployment = useDeployment(id);
    const initialLogs = useDeploymentLogs(id);
    const [logsPaused, setLogsPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
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
    const [deleteConfirm, setDeleteConfirm] = useState('');

    const current = liveStatus ? { ...deployment.data, ...liveStatus } : deployment.data;
    const logs = useMemo(() => mergeLogs(initialLogs.data || [], stream.logs), [initialLogs.data, stream.logs]);
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
    const isDeleted = current?.status === 'DELETED';
    const isSandbox = current?.mode === 'sandbox';

    const rawErrorText = useMemo(() => {
        if (current?.status !== 'FAILED') return '';
        const errorLogs = logs.filter(l => l.level === 'error' || /fail|error|exception/i.test(l.message || l.output || ''));
        return (errorLogs.length ? errorLogs.slice(-5) : logs.slice(-3)).map(l => l.message || l.output).join('\n');
    }, [current?.status, logs]);

    const parsedError = useMemo(() => rawErrorText ? parseError(rawErrorText) : null, [rawErrorText]);

    const failedStepIndex = useMemo(() => {
        if (current?.status !== 'FAILED') return -1;
        const txt = logs.map(l => (l.message || l.output || '').toLowerCase()).join('\n');
        if (/(clone|repository)/.test(txt)) return 1;
        if (/(extract|upload)/.test(txt)) return 3;
        if (/(build|install|npm|yarn|pnpm|bun)/.test(txt)) return 4;
        return 5;
    }, [current?.status, logs]);

    useEffect(() => {
        if (autoScroll) consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
    }, [logs, autoScroll]);

    async function confirmDelete() {
        await deleteDeployment.mutateAsync(id);
        router.push('/deployments');
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/deployments">
                    <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-400 transition-colors hover:text-white">
                        <ArrowLeft size={16} />
                    </button>
                </Link>
                <PageHeader
                    title={current?.name || current?.project?.name || 'Deployment'}
                    description={current?.project?.repositoryUrl?.replace('upload://', '') || 'Deployment details and live execution output.'}
                    action={!isDeleted ? (
                        <div className="flex flex-wrap gap-2">
                            {isSandbox && isRunning ? <Button variant="danger" onClick={() => stop.mutate(id)} loading={stop.isPending}><Square size={15} /> Stop Sandbox</Button> : null}
                            {!isSandbox && isStopped ? <Button variant="secondary" onClick={() => start.mutate(id)} loading={start.isPending}><Play size={15} /> Start</Button> : null}
                            {!isSandbox && isPaused ? <Button variant="secondary" onClick={() => resume.mutate(id)} loading={resume.isPending}><Play size={15} /> Resume</Button> : null}
                            {!isSandbox && isRunning ? <Button variant="secondary" onClick={() => stop.mutate(id)} loading={stop.isPending}><Square size={15} /> Stop</Button> : null}
                            {!isSandbox && isRunning ? <Button variant="secondary" onClick={() => pauseDeployment.mutate(id)} loading={pauseDeployment.isPending}><Pause size={15} /> Pause</Button> : null}
                            {!isSandbox && isRunning ? (
                                <Button variant="secondary" onClick={() => restart.mutate(id)} loading={restart.isPending} disabled={!canRestart}>
                                    <RefreshCw size={15} /> Restart
                                </Button>
                            ) : null}
                            {!isSandbox ? (
                                <Button variant="secondary" onClick={() => rollback.mutate({ id })} loading={rollback.isPending} disabled={!canRollback || !isRunning}>
                                    <RotateCcw size={15} /> Rollback
                                </Button>
                            ) : null}
                            <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={15} /> Delete</Button>
                        </div>
                    ) : null}
                />
            </div>

            {/* Error states */}
            {[deployment, start, stop, pauseDeployment, resume, restart, rollback, deleteDeployment].map((m, i) =>
                m.isError ? <ErrorState key={i} title={`Action failed`} message={(m.error as Error)?.message} /> : null
            )}

            {deployment.isLoading ? <SkeletonBlock className="h-96" /> : current ? (
                <>
                    {/* Error banner */}
                    {current.status === 'FAILED' && parsedError ? (
                        <Panel className="border-rose-400/30 bg-rose-500/8 space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex gap-3">
                                    <AlertCircle className="mt-1 shrink-0 text-rose-400" size={18} />
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-black text-rose-100 uppercase">{parsedError.category}</span>
                                            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-black text-rose-200 font-mono ring-1 ring-rose-500/30">{parsedError.code}</span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-white/90 whitespace-pre-line leading-relaxed">{parsedError.explanation}</p>
                                        {parsedError.suggestions?.length ? (
                                            <ul className="mt-3 space-y-1.5">
                                                {parsedError.suggestions.map((s, i) => (
                                                    <li key={i} className="flex items-center gap-2 text-xs text-rose-100/80">
                                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />{s}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex gap-2 sm:flex-col sm:items-end shrink-0">
                                    <Button variant="secondary" className="text-xs h-8"
                                        onClick={() => useToastStore.getState().openErrorDrawer({ ...parsedError, timestamp: current.updatedAt, deploymentId: current.id })}>
                                        Details
                                    </Button>
                                    <Button variant="secondary" className="text-xs h-8"
                                        onClick={() => { navigator.clipboard.writeText(`Deployment: ${current.id}\nError: ${parsedError.code}\n${parsedError.explanation}`); useToastStore.getState().addToast({ title: 'Copied', description: 'Error report copied.', severity: 'success' }); }}>
                                        <Copy size={12} /> Copy
                                    </Button>
                                </div>
                            </div>
                        </Panel>
                    ) : null}

                    {/* Info chips row */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                        <InfoChip icon={<Zap size={10} />} label="Status" value={<StatusBadge status={current.status} />} />
                        <InfoChip icon={sourceType === 'upload' ? <PackagePlus size={10} /> : <Github size={10} />} label="Source" value={<span className="capitalize">{sourceType}</span>} />
                        <InfoChip icon={<Server size={10} />} label="Mode" value={<span className={isSandbox ? 'text-amber-300' : 'text-emerald-300'}>{isSandbox ? 'Sandbox' : 'Production'}</span>} />
                        <InfoChip icon={<Globe size={10} />} label="Port" value={isStatic ? 'Static' : current.port || 'Pending'} />
                        <InfoChip icon={<GitBranch size={10} />} label="Branch" value={current.branch || current.project?.branch || 'main'} />
                        <InfoChip icon={<Clock size={10} />} label="Updated" value={formatDate(current.updatedAt)} />
                    </div>

                    {/* Active URL bar */}
                    <Panel className="py-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Active URL</p>
                                <p className="mt-1 truncate font-mono text-sm text-cyan-300">{activeUrl || 'Pending host assignment…'}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                    {isSandbox ? 'Sandbox port — auto cleanup on stop' : current.hostType === 'domain' ? 'Domain routing' : 'IP direct hosting'}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                {activeUrl && <a href={activeUrl} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink size={15} /></Button></a>}
                                <Button variant="secondary" disabled={!activeUrl} onClick={() => activeUrl && navigator.clipboard.writeText(activeUrl)}>
                                    <Copy size={15} /> Copy
                                </Button>
                            </div>
                        </div>
                    </Panel>

                    {/* Timeline */}
                    <Panel>
                        <div className="mb-5 flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/8 text-cyan-200"><Zap size={15} /></div>
                            <h2 className="font-black text-white">Deployment Pipeline</h2>
                            <span className="ml-auto text-xs font-bold text-slate-500">{getProgressMessage(current.status || '', logs)}</span>
                        </div>
                        {!canRestart && current.status !== 'FAILED' ? (
                            <p className="mb-4 rounded-lg border border-amber-300/15 bg-amber-300/8 px-4 py-2.5 text-xs font-semibold text-amber-200/80">
                                {isStatic ? 'Restart available after static routing activates.' : 'Restart available once container reaches RUNNING state.'}
                            </p>
                        ) : null}
                        <div className="grid grid-cols-3 gap-2 md:grid-cols-7">
                            {TIMELINE.map((state) => <TimelineStep key={state} state={state} current={current.status} failedIndex={failedStepIndex} />)}
                        </div>
                    </Panel>

                    {/* Logs + Sidebar */}
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                        {/* Log console */}
                        <Panel className="flex flex-col gap-0 p-0 overflow-hidden">
                            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
                                <div className="flex items-center gap-2">
                                    <TerminalSquare size={16} className="text-cyan-200" />
                                    <h2 className="font-black text-white">Live Logs</h2>
                                    <span className={clsx('flex items-center gap-1 text-[11px] font-bold', stream.isConnected ? 'text-emerald-300' : 'text-slate-500')}>
                                        <span className={clsx('h-1.5 w-1.5 rounded-full', stream.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
                                        {stream.isConnected ? 'Live' : 'Polling'}
                                    </span>
                                    <span className="text-[11px] text-slate-600">{logs.length} lines</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="h-8 text-xs" onClick={() => setLogsPaused(v => !v)}>
                                        {logsPaused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
                                    </Button>
                                    <Button variant="secondary" className="h-8 text-xs" onClick={() => setAutoScroll(v => !v)}>
                                        {autoScroll ? 'Auto ↓ on' : 'Auto ↓ off'}
                                    </Button>
                                </div>
                            </div>
                            <div ref={consoleRef} className="terminal-scrollbar h-[500px] overflow-auto bg-slate-950/80 p-4">
                                {logs.length
                                    ? logs.map((log) => <LogLine key={log.id} log={log} />)
                                    : <p className="font-mono text-xs text-slate-700">No log output recorded yet.</p>}
                            </div>
                        </Panel>

                        {/* Sidebar */}
                        <div className="space-y-4">
                            {/* Webhook */}
                            <Panel>
                                <h3 className="mb-4 font-black text-white">Webhook</h3>
                                <div className="space-y-0">
                                    <InfoRow label="Status" value={sourceType === 'upload' ? 'Not available' : 'Configured on deploy'} />
                                    <InfoRow label="Last trigger" value={formatDate(current.updatedAt)} />
                                    <InfoRow label="Commit" value={sourceType === 'github' && current.commitHash ? <span className="font-mono">{current.commitHash.slice(0, 12)}</span> : 'Not tracked'} />
                                    <InfoRow label="Branch" value={sourceType === 'github' ? current.branch || current.project?.branch || 'main' : 'Manual'} />
                                </div>
                            </Panel>

                            {/* Build */}
                            <Panel>
                                <h3 className="mb-4 font-black text-white">Build Output</h3>
                                <div className="space-y-0">
                                    <InfoRow label="Framework" value={current.framework || 'Detecting…'} />
                                    <InfoRow label="Engine" value={isStatic ? 'Static engine' : current.type === 'FULLSTACK' ? 'Container (fullstack)' : 'Container'} />
                                    <InfoRow label="Build cmd" value={current.buildCommand || 'Pending'} />
                                    <InfoRow label="Start cmd" value={current.startCommand || 'Pending'} />
                                    <InfoRow label="Container" value={current.containerId ? <span className="font-mono">{current.containerId.slice(0, 10)}…</span> : 'Pending'} />
                                </div>
                            </Panel>

                            {/* Actions */}
                            <Panel>
                                <h3 className="mb-4 font-black text-white">Available Actions</h3>
                                <div className="space-y-2">
                                    <ActionRow label="Restart" enabled={canRestart} />
                                    <ActionRow label="Rollback" enabled={canRollback} />
                                    <ActionRow label="Webhook deploy" enabled={!isSandbox && canRollback} />
                                    <ActionRow label="View commits" enabled={!isSandbox && canRollback} />
                                </div>
                            </Panel>

                            {/* Env vars */}
                            {current.envPreview?.length ? (
                                <Panel>
                                    <h3 className="mb-4 font-black text-white">Environment</h3>
                                    <div className="space-y-0">
                                        {current.envPreview.map((item) => <InfoRow key={item.key} label={item.key} value={<span className="font-mono text-slate-500">{item.value}</span>} />)}
                                    </div>
                                </Panel>
                            ) : null}
                        </div>
                    </div>
                </>
            ) : null}

            {/* Delete modal */}
            {deleteOpen ? (
                <AppModal title="Delete Deployment" open={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                        This will stop the container, remove routing, free the port, and permanently mark the deployment as deleted.
                    </p>
                    <label className="mt-5 block space-y-2">
                        <span className="text-xs font-black uppercase text-slate-500">Type DELETE to confirm</span>
                        <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" className={inputClassName} />
                    </label>
                    <div className="mt-6 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>Cancel</Button>
                        <Button variant="danger" disabled={deleteConfirm !== 'DELETE'} loading={deleteDeployment.isPending} onClick={confirmDelete}>
                            <Trash2 size={15} /> Delete Deployment
                        </Button>
                    </div>
                </AppModal>
            ) : null}
        </div>
    );
}
