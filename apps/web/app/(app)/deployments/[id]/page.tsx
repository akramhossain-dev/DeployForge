'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Copy, Pause, Play, RefreshCw, RotateCcw, Server, Square, TerminalSquare, Trash2 } from 'lucide-react';
import { AppModal, Button, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate, inputClassName } from '@/components/ui';
import { useDeleteDeployment, useDeployment, useDeploymentLogs, useDeploymentLogStream, useDeploymentStatusStream, usePauseDeployment, useRestartDeployment, useResumeDeployment, useRollbackDeployment, useStartDeployment, useStopDeployment } from '@/hooks/useDeployForgeData';
import type { DeploymentLog } from '@/lib/api/types';
import { parseError } from '@/lib/utils/errorParser';
import { useToastStore } from '@/lib/store/useToastStore';

const timeline = ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'RUNNING'];

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
    const activeUrl = current?.url || (current?.vps?.ipAddress && isStatic ? current.port ? `http://${current.vps.ipAddress}:${current.port}/site/${current.id}/` : `http://${current.vps.ipAddress}/site/${current.id}/` : current?.vps?.ipAddress && current?.port ? `http://${current.vps.ipAddress}:${current.port}` : null);
    const isRunning = current?.status === 'RUNNING';
    const isPaused = current?.status === 'PAUSED';
    const isStopped = current?.status === 'STOPPED';
    const isDeleted = current?.status === 'DELETED';
    const isSandbox = current?.mode === 'sandbox';

    const rawErrorText = useMemo(() => {
        if (current?.status !== 'FAILED') return '';
        const errorLogs = logs.filter(log => log.level === 'error' || log.type === 'error' || /fail|error|exception/i.test(log.message || log.output || ''));
        if (errorLogs.length > 0) {
            return errorLogs.slice(-5).map(log => log.message || log.output).join('\n');
        }
        return logs.slice(-3).map(log => log.message || log.output).join('\n');
    }, [current?.status, logs]);

    const parsedError = useMemo(() => {
        if (!rawErrorText) return null;
        return parseError(rawErrorText);
    }, [rawErrorText]);

    const failedStepIndex = useMemo(() => {
        if (current?.status !== 'FAILED') return -1;
        const logText = logs.map(l => (l.message || l.output || '').toLowerCase()).join('\n');
        if (logText.includes('clone') || logText.includes('repository')) return 1; // CLONING
        if (logText.includes('extract') || logText.includes('upload')) return 3; // EXTRACTING / UPLOADING
        if (logText.includes('build') || logText.includes('install') || logText.includes('npm') || logText.includes('yarn') || logText.includes('pnpm') || logText.includes('bun')) return 4; // BUILDING
        return 5; // DEPLOYING
    }, [current?.status, logs]);

    async function confirmDelete() {
        await deleteDeployment.mutateAsync(id);
        router.push('/deployments');
    }

    useEffect(() => {
        if (autoScroll) consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
    }, [logs, autoScroll]);

    return (
        <div className="space-y-6">
            <PageHeader
                title={current?.name || current?.project?.name || 'Deployment'}
                description={current?.project?.repositoryUrl || 'Deployment details and live execution output.'}
                action={
                    !isDeleted ? (
                        <div className="flex flex-wrap gap-2">
                            {isSandbox && isRunning ? <Button variant="danger" onClick={() => stop.mutate(id)} loading={stop.isPending}><Square size={16} /> Stop Sandbox</Button> : null}
                            {!isSandbox && isStopped ? <Button variant="secondary" onClick={() => start.mutate(id)} loading={start.isPending}><Play size={16} /> Start</Button> : null}
                            {!isSandbox && isPaused ? <Button variant="secondary" onClick={() => resume.mutate(id)} loading={resume.isPending}><Play size={16} /> Resume</Button> : null}
                            {!isSandbox && isRunning ? <Button variant="secondary" onClick={() => stop.mutate(id)} loading={stop.isPending}><Square size={16} /> Stop</Button> : null}
                            {!isSandbox && isRunning ? <Button variant="secondary" onClick={() => pauseDeployment.mutate(id)} loading={pauseDeployment.isPending}><Pause size={16} /> Pause</Button> : null}
                            {!isSandbox && isRunning ? (
                                <Button
                                    variant="secondary"
                                    onClick={() => restart.mutate(id)}
                                    loading={restart.isPending}
                                    disabled={!canRestart}
                                    title={canRestart ? 'Restart deployment container' : 'Deployment not running yet'}
                                >
                                    <RefreshCw size={16} /> Restart
                                </Button>
                            ) : null}
                            {!isSandbox ? <Button
                                variant="danger"
                                onClick={() => rollback.mutate({ id })}
                                loading={rollback.isPending}
                                disabled={!canRollback || !isRunning}
                                title={canRollback ? 'Rollback GitHub deployment' : isStatic ? 'Rollback is not available for optimized static deployments' : 'Rollback is not supported for upload deployments'}
                            >
                                <RotateCcw size={16} /> Rollback
                            </Button> : null}
                            <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={16} /> Delete</Button>
                        </div>
                    ) : null
                }
            />

            {deployment.isError ? <ErrorState message={(deployment.error as Error)?.message} onRetry={() => deployment.refetch()} /> : null}
            {start.isError ? <ErrorState title="Start failed" message={(start.error as Error)?.message} /> : null}
            {stop.isError ? <ErrorState title="Stop failed" message={(stop.error as Error)?.message} /> : null}
            {pauseDeployment.isError ? <ErrorState title="Pause failed" message={(pauseDeployment.error as Error)?.message} /> : null}
            {resume.isError ? <ErrorState title="Resume failed" message={(resume.error as Error)?.message} /> : null}
            {restart.isError ? <ErrorState title="Restart failed" message={(restart.error as Error)?.message} /> : null}
            {rollback.isError ? <ErrorState title="Rollback failed" message={(rollback.error as Error)?.message} /> : null}
            {deleteDeployment.isError ? <ErrorState title="Delete failed" message={(deleteDeployment.error as Error)?.message} /> : null}

            {deployment.isLoading ? (
                <SkeletonBlock className="h-96" />
            ) : current ? (
                <>
                    {current.status === 'FAILED' && parsedError ? (
                        <Panel className="border-rose-400/30 bg-rose-500/10 space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex gap-3">
                                    <AlertCircle className="mt-1 shrink-0 text-rose-400" size={20} />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-rose-100 uppercase">{parsedError.category}</span>
                                            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-200 font-mono ring-1 ring-rose-500/30">
                                                {parsedError.code}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-white whitespace-pre-line leading-relaxed">
                                            {parsedError.explanation}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2 sm:flex-col sm:items-end">
                                    <Button
                                        variant="secondary"
                                        className="text-xs h-8"
                                        onClick={() =>
                                            useToastStore.getState().openErrorDrawer({
                                                ...parsedError,
                                                timestamp: current.updatedAt,
                                                deploymentId: current.id,
                                            })
                                        }
                                    >
                                        View Details
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="text-xs h-8"
                                        onClick={() => {
                                            const textToCopy = `
=== DEPLOYFORGE ERROR REPORT ===
Deployment ID: ${current.id}
Timestamp: ${current.updatedAt}
Error Code: ${parsedError.code}
Category: ${parsedError.category}
Explanation: ${parsedError.explanation}
================================
`.trim();
                                            navigator.clipboard.writeText(textToCopy);
                                            useToastStore.getState().addToast({
                                                title: 'Error Copied',
                                                description: 'Copied diagnostics summary to clipboard.',
                                                severity: 'success',
                                            });
                                        }}
                                    >
                                        <Copy size={12} /> Copy Error
                                    </Button>
                                </div>
                            </div>
                            
                            {parsedError.suggestions && parsedError.suggestions.length > 0 && (
                                <div className="border-t border-rose-400/20 pt-3">
                                    <p className="text-xs font-black uppercase text-rose-300 tracking-wider">Suggested Fixes</p>
                                    <ul className="mt-2 space-y-1.5">
                                        {parsedError.suggestions.map((suggestion, index) => (
                                            <li key={index} className="flex items-center gap-2 text-xs text-rose-100/80">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                                <span>{suggestion}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </Panel>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <Panel>
                            <Metric
                                label="Status"
                                value={
                                    <div className="flex flex-col gap-1">
                                        <StatusBadge status={current.status} />
                                        <span className="text-[11px] font-bold text-slate-400 mt-1 uppercase">
                                            {getProgressMessage(current.status, logs)}
                                        </span>
                                    </div>
                                }
                            />
                        </Panel>
                        <Panel><Metric label="Source" value={<span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs uppercase text-slate-200">{sourceType}</span>} /></Panel>
                        <Panel><Metric label="Mode" value={<span className={isSandbox ? 'rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs uppercase text-amber-100' : 'rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs uppercase text-slate-200'}>{isSandbox ? 'Temporary Environment' : 'Production'}</span>} /></Panel>
                        <Panel><Metric label="Runtime" value={isStatic ? 'Static hosting' : current.containerId ? `${current.containerId.slice(0, 12)}...` : 'pending'} /></Panel>
                        <Panel><Metric label="Port" value={isStatic ? 'not required' : current.port || 'pending'} /></Panel>
                    </div>

                    <Panel>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase text-slate-500">Active URL</p>
                                <p className="mt-2 truncate font-mono text-sm text-cyan-100">{activeUrl || 'Pending host assignment'}</p>
                                <p className="mt-1 text-xs text-slate-500">{isSandbox ? 'Sandbox direct port - auto cleanup after timeout or stop' : current.hostType === 'domain' ? 'Domain routing' : 'IP fallback hosting'}</p>
                            </div>
                            <Button variant="secondary" disabled={!activeUrl} onClick={() => activeUrl && navigator.clipboard.writeText(activeUrl)}><Copy size={16} /> Copy</Button>
                        </div>
                    </Panel>

                    <Panel>
                        <div className="mb-5 flex items-center gap-2">
                            <Server size={18} className="text-cyan-200" />
                            <h2 className="font-black text-white">Deployment Timeline</h2>
                        </div>
                        {!canRestart && current.status !== 'FAILED' ? <p className="mb-4 text-sm text-amber-200/80">{isStatic ? 'Deployment not running yet. Restart becomes available after static routing is active.' : 'Deployment not running yet. Restart becomes available after a container is created and the status reaches running.'}</p> : null}
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                            {timeline.map((state) => <TimelineStep key={state} state={state} current={current.status} failedIndex={failedStepIndex} />)}
                        </div>
                    </Panel>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <Panel>
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <TerminalSquare size={18} className="text-cyan-200" />
                                    <h2 className="font-black text-white">Live Logs</h2>
                                    <span className={stream.isConnected ? 'text-xs font-bold text-emerald-300' : 'text-xs font-bold text-slate-500'}>{stream.isConnected ? 'streaming' : 'polling'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setLogsPaused((value) => !value)}>{logsPaused ? <Play size={16} /> : <Pause size={16} />}{logsPaused ? 'Resume logs' : 'Pause logs'}</Button>
                                    <Button variant="secondary" onClick={() => setAutoScroll((value) => !value)}>{autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}</Button>
                                </div>
                            </div>
                            <div ref={consoleRef} className="terminal-scrollbar h-[520px] overflow-auto rounded-lg border border-white/10 bg-slate-950 p-4 font-mono text-xs leading-6">
                                {logs.length ? logs.map((log) => <LogLine key={log.id} log={log} />) : <p className="text-slate-600">No logs have been recorded yet.</p>}
                            </div>
                        </Panel>

                        <div className="space-y-6">
                            <Panel>
                                <h2 className="font-black text-white">Webhook Status</h2>
                                <div className="mt-4 space-y-3 text-sm text-slate-400">
                                    <Row label="Connected" value={sourceType === 'upload' ? 'Not available for upload' : 'Configured on deploy'} />
                                    <Row label="Last trigger" value={formatDate(current.updatedAt)} />
                                    <Row label="Commit" value={sourceType === 'github' && current.commitHash ? current.commitHash.slice(0, 12) : 'Not tracked'} />
                                    <Row label="Branch" value={sourceType === 'github' ? current.branch || current.project?.branch || 'main' : 'Manual upload'} />
                                </div>
                            </Panel>
                            <Panel>
                                <h2 className="font-black text-white">Available Actions</h2>
                                <div className="mt-4 space-y-2 text-sm">
                                    <ActionRow label="Restart" enabled={!isSandbox && (isStatic || Boolean(current.containerId))} />
                                    <ActionRow label="Rollback" enabled={!isSandbox && canRollback} />
                                    <ActionRow label="View commits" enabled={!isSandbox && canRollback} />
                                    <ActionRow label="Webhook deploy" enabled={!isSandbox && canRollback} />
                                </div>
                            </Panel>
                            <Panel>
                                <h2 className="font-black text-white">Environment</h2>
                                <div className="mt-4 space-y-2">
                                    {current.envPreview?.length ? current.envPreview.map((item) => <Row key={item.key} label={item.key} value={item.value} />) : <p className="text-sm text-slate-500">No deployment variables attached.</p>}
                                </div>
                            </Panel>
                            <Panel>
                                <h2 className="font-black text-white">Build Output</h2>
                                <div className="mt-4 space-y-3 text-sm text-slate-400">
                                    <Row label="Framework" value={current.framework || 'Detecting'} />
                                    <Row label="Engine" value={current.type === 'STATIC' ? 'Static engine' : current.type === 'FULLSTACK' ? 'Container engine (fullstack)' : 'Container engine'} />
                                    <Row label="Build" value={current.buildCommand || 'Pending'} />
                                    <Row label="Start" value={current.startCommand || 'Pending'} />
                                </div>
                            </Panel>
                        </div>
                    </div>
                </>
            ) : null}
            {deleteOpen ? (
                <AppModal
                    title="Delete Deployment"
                    open={deleteOpen}
                    onClose={() => { setDeleteOpen(false); setDeleteConfirm(''); }}
                >
                    <p className="mt-3 text-sm leading-6 text-slate-400">This will stop the container, remove deployment routing, free the port, and mark the deployment as deleted.</p>
                    <label className="mt-5 block space-y-2">
                        <span className="text-xs font-black uppercase text-slate-500">Confirmation required</span>
                        <input
                            value={deleteConfirm}
                            onChange={(event) => setDeleteConfirm(event.target.value)}
                            placeholder="Type DELETE here"
                            className={inputClassName}
                        />
                        <span className="block text-xs leading-5 text-slate-500">
                            Type <span className="font-mono font-black text-slate-400">DELETE</span> exactly to enable the delete button.
                        </span>
                    </label>
                    <div className="mt-6 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>Cancel</Button>
                        <Button variant="danger" disabled={deleteConfirm !== 'DELETE'} loading={deleteDeployment.isPending} onClick={confirmDelete}><Trash2 size={16} /> Delete Deployment</Button>
                    </div>
                </AppModal>
            ) : null}
        </div>
    );
}

function TimelineStep({ state, current, failedIndex }: { state: string; current?: string; failedIndex: number }) {
    const currentIndex = timeline.indexOf(current || '');
    const ownIndex = timeline.indexOf(state);
    let complete = false;
    let failed = false;
    
    if (current === 'FAILED') {
        if (ownIndex < failedIndex) {
            complete = true;
        } else if (ownIndex === failedIndex) {
            failed = true;
        }
    } else {
        complete = current === 'RUNNING' || current === 'ROLLED_BACK' || (currentIndex >= ownIndex && ownIndex >= 0);
    }

    return (
        <div className={complete ? 'rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3' : failed ? 'rounded-lg border border-rose-300/20 bg-rose-300/10 p-3' : 'rounded-lg border border-white/10 bg-slate-950/45 p-3'}>
            <p className={complete ? 'text-xs font-black uppercase text-emerald-200' : failed ? 'text-xs font-black uppercase text-rose-200' : 'text-xs font-black uppercase text-slate-500'}>{state.toLowerCase().replace('_', ' ')}</p>
        </div>
    );
}

function LogLine({ log }: { log: DeploymentLog }) {
    const text = log.message || log.output || '';
    const color = log.level === 'error' || /failed|error/i.test(text) ? 'text-rose-300' : log.level === 'warn' || /warn/i.test(text) ? 'text-amber-300' : /success|running/i.test(text) ? 'text-emerald-300' : 'text-slate-300';
    return <p className={color}>[{formatDate(log.createdAt || log.timestamp)}] {text}</p>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
    return <><p className="text-xs font-black uppercase text-slate-500">{label}</p><div className="mt-2 text-sm font-black text-white">{value}</div></>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="truncate text-right text-slate-200">{value}</span></div>;
}

function ActionRow({ label, enabled }: { label: string; enabled: boolean }) {
    return <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2"><span className="text-slate-300">{label}</span><span className={enabled ? 'text-emerald-300' : 'text-rose-300'}>{enabled ? 'Enabled' : 'Disabled'}</span></div>;
}

function getSourceType(deployment?: { sourceType?: string; project?: { repositoryUrl?: string | null } | null }) {
    return deployment?.sourceType || (deployment?.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
}

function mergeLogs(a: DeploymentLog[], b: DeploymentLog[]) {
    const map = new Map<string, DeploymentLog>();
    [...a, ...b].forEach((log) => map.set(log.id, log));
    return Array.from(map.values()).sort((left, right) => new Date(left.createdAt || left.timestamp || 0).getTime() - new Date(right.createdAt || right.timestamp || 0).getTime());
}

function getProgressMessage(status: string, logs: DeploymentLog[]): string {
    const s = (status || '').toUpperCase();
    if (s === 'PENDING') return 'Queued';
    if (s === 'CLONING') return 'Cloning Repository';
    if (s === 'UPLOADING') return 'Uploading Archive';
    if (s === 'EXTRACTING') return 'Extracting Archive';
    
    if (s === 'BUILDING') {
        const hasInstall = logs.some(l => {
            const msg = (l.message || l.output || '').toLowerCase();
            return msg.includes('install') || msg.includes('npm ci') || msg.includes('yarn') || msg.includes('pnpm') || msg.includes('bun');
        });
        return hasInstall ? 'Installing Dependencies' : 'Building Application';
    }
    
    if (s === 'DEPLOYING') {
        const logText = logs.map(l => (l.message || l.output || '').toLowerCase()).join('\n');
        if (logText.includes('health check') || logText.includes('healthcheck') || logText.includes('probe')) {
            return 'Running Health Check';
        }
        if (logText.includes('container started') || logText.includes('starting')) {
            return 'Starting Container';
        }
        return 'Creating Container';
    }
    
    if (s === 'RUNNING' || s === 'SUCCESS') return 'Deployment Successful';
    if (s === 'FAILED') return 'Deployment Failed';
    if (s === 'STOPPED') return 'Deployment Stopped';
    if (s === 'PAUSED') return 'Deployment Paused';
    
    return s || 'Queued';
}
