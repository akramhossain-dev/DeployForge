'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    AlertCircle, ArrowLeft, CheckCircle2, Circle, Clock, Copy, ExternalLink,
    GitBranch, Github, Globe, Loader2, Pause, Play, RefreshCw, RotateCcw,
    Server, Square, TerminalSquare, Trash2, XCircle, Zap, PackagePlus,
    Search, ArrowUpDown, PlusCircle, History, Edit2, Plus, Eye, EyeOff,
} from 'lucide-react';
import clsx from 'clsx';
import { AppModal, Button, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate, inputClassName, PasswordInput } from '@/components/ui';
import {
    useDeleteDeployment, useDeployment, useDeploymentLogs, useDeploymentLogStream,
    useDeploymentStatusStream, usePauseDeployment, useRestartDeployment,
    useResumeDeployment, useRollbackDeployment, useStartDeployment, useStopDeployment,
    useDeploymentEnv, useUpdateDeploymentEnv, useDeploymentEnvHistory, useRedeploy,
    type EnvFile,
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

    // Environment Variables Management State
    const [envModalOpen, setEnvModalOpen] = useState(false);
    const { data: decEnvResponse, isLoading: envLoading } = useDeploymentEnv(id);
    const updateEnv = useUpdateDeploymentEnv();
    const envHistory = useDeploymentEnvHistory(id);
    const redeploy = useRedeploy();

    const [draftFiles, setDraftFiles] = useState<EnvFile[]>([]);
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const [isBulkEdit, setIsBulkEdit] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'none' | 'key'>('none');
    const [newFilePath, setNewFilePath] = useState('');
    const [showAddFile, setShowAddFile] = useState(false);
    const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null);
    const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);
    const [pendingImportVars, setPendingImportVars] = useState<Record<string, string>>({});
    const [historyOpen, setHistoryOpen] = useState(false);

    // For rename file
    const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
    const [renamingPath, setRenamingPath] = useState('');

    // Load initial decrypted env when the modal opens or data is loaded
    useEffect(() => {
        if (decEnvResponse?.files) {
            setDraftFiles(JSON.parse(JSON.stringify(decEnvResponse.files)));
        }
    }, [decEnvResponse, envModalOpen]);

    // Active draft file
    const activeFile = draftFiles[activeFileIndex] || { path: '.env', variables: {} };

    // Format active file variables to bulk text when toggled
    useEffect(() => {
        if (isBulkEdit) {
            const text = Object.entries(activeFile.variables || {})
                .map(([k, v]) => `${k}=${v}`)
                .join('\n');
            setBulkText(text);
        }
    }, [isBulkEdit, activeFileIndex, activeFile.variables]);

    const validateKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    const validatePath = (path: string) => {
        if (!path.trim()) return false;
        if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
        if (path.split(/[/\\]/).some(p => p === '..')) return false;
        const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        const fileName = normalized.split('/').pop() || '';
        return fileName.startsWith('.env');
    };

    const handleUpdateVarKey = (oldKey: string, newKey: string) => {
        if (oldKey === newKey) return;
        setDraftFiles(currentFiles => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (!file) return currentFiles;
            const vars = { ...file.variables };
            const value = vars[oldKey];
            delete vars[oldKey];
            vars[newKey] = value || '';
            file.variables = vars;
            return next;
        });
    };

    const handleUpdateVarValue = (key: string, value: string) => {
        setDraftFiles(currentFiles => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (!file) return currentFiles;
            file.variables = { ...file.variables, [key]: value };
            return next;
        });
    };

    const handleDeleteVar = (key: string) => {
        setDraftFiles(currentFiles => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (!file) return currentFiles;
            const vars = { ...file.variables };
            delete vars[key];
            file.variables = vars;
            return next;
        });
    };

    const handleAddVar = () => {
        setDraftFiles(currentFiles => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (!file) return currentFiles;
            let baseName = 'NEW_VARIABLE';
            let index = 1;
            let finalName = baseName;
            while (finalName in file.variables) {
                finalName = `${baseName}_${index}`;
                index++;
            }
            file.variables = { ...file.variables, [finalName]: '' };
            return next;
        });
    };

    const handleDuplicateVar = (key: string, value: string) => {
        setDraftFiles(currentFiles => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (!file) return currentFiles;
            let finalName = `${key}_COPY`;
            let index = 1;
            while (finalName in file.variables) {
                finalName = `${key}_COPY_${index}`;
                index++;
            }
            file.variables = { ...file.variables, [finalName]: value };
            return next;
        });
    };

    const handleBulkImport = () => {
        const parsed: Record<string, string> = {};
        const lines = bulkText.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const equalsIdx = trimmed.indexOf('=');
            if (equalsIdx <= 0) continue;
            const k = trimmed.substring(0, equalsIdx).trim();
            const v = trimmed.substring(equalsIdx + 1).trim();
            if (validateKey(k)) {
                parsed[k] = v;
            }
        }

        const activeVars = activeFile.variables || {};
        const duplicates = Object.keys(parsed).filter(k => k in activeVars);
        if (duplicates.length > 0) {
            setPendingImportVars(parsed);
            setShowConfirmOverwrite(true);
        } else {
            setDraftFiles(currentFiles => {
                const next = [...currentFiles];
                const file = next[activeFileIndex];
                if (file) {
                    file.variables = { ...file.variables, ...parsed };
                }
                return next;
            });
            setIsBulkEdit(false);
        }
    };

    const confirmBulkImport = () => {
        setDraftFiles(currentFiles => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (file) {
                file.variables = { ...file.variables, ...pendingImportVars };
            }
            return next;
        });
        setShowConfirmOverwrite(false);
        setPendingImportVars({});
        setIsBulkEdit(false);
    };

    const handleAddFile = () => {
        if (!validatePath(newFilePath)) {
            useToastStore.getState().addToast({
                title: 'Invalid Path',
                description: 'File path must be relative and start with .env (e.g. apps/client/.env).',
                severity: 'error'
            });
            return;
        }
        if (draftFiles.some(f => f.path === newFilePath)) {
            useToastStore.getState().addToast({
                title: 'Duplicate Path',
                description: 'This environment file path already exists.',
                severity: 'error'
            });
            return;
        }
        setDraftFiles(prev => [...prev, { path: newFilePath, variables: {} }]);
        setActiveFileIndex(draftFiles.length);
        setNewFilePath('');
        setShowAddFile(false);
    };

    const handleRenameFile = (index: number) => {
        if (!validatePath(renamingPath)) {
            useToastStore.getState().addToast({
                title: 'Invalid Path',
                description: 'File path must be relative and start with .env.',
                severity: 'error'
            });
            return;
        }
        if (draftFiles.some((f, idx) => f.path === renamingPath && idx !== index)) {
            useToastStore.getState().addToast({
                title: 'Duplicate Path',
                description: 'This environment file path already exists.',
                severity: 'error'
            });
            return;
        }
        setDraftFiles(prev => {
            const next = [...prev];
            if (next[index]) {
                next[index].path = renamingPath;
            }
            return next;
        });
        setRenamingIndex(null);
        setRenamingPath('');
    };

    const handleDeleteFile = (index: number) => {
        if (draftFiles[index]?.path === '.env') {
            useToastStore.getState().addToast({
                title: 'Delete Rejected',
                description: 'The root .env file cannot be deleted.',
                severity: 'error'
            });
            return;
        }
        if (draftFiles.length <= 1) {
            useToastStore.getState().addToast({
                title: 'Delete Rejected',
                description: 'At least one environment file must remain.',
                severity: 'error'
            });
            return;
        }
        setDraftFiles(prev => prev.filter((_, idx) => idx !== index));
        setActiveFileIndex(0);
    };

    const handleSaveChanges = async () => {
        for (const file of draftFiles) {
            if (!validatePath(file.path)) {
                useToastStore.getState().addToast({ title: 'Validation Error', description: `Invalid file path: ${file.path}`, severity: 'error' });
                return;
            }
            for (const key of Object.keys(file.variables)) {
                if (!validateKey(key)) {
                    useToastStore.getState().addToast({ title: 'Validation Error', description: `Invalid variable key "${key}" in ${file.path}`, severity: 'error' });
                    return;
                }
            }
        }
        try {
            await updateEnv.mutateAsync({
                deploymentId: id,
                env: {
                    version: 2,
                    files: draftFiles
                }
            });
            setEnvModalOpen(false);
        } catch (e) {}
    };

    const handleSaveAndRedeploy = async () => {
        for (const file of draftFiles) {
            if (!validatePath(file.path)) {
                useToastStore.getState().addToast({ title: 'Validation Error', description: `Invalid file path: ${file.path}`, severity: 'error' });
                return;
            }
            for (const key of Object.keys(file.variables)) {
                if (!validateKey(key)) {
                    useToastStore.getState().addToast({ title: 'Validation Error', description: `Invalid variable key "${key}" in ${file.path}`, severity: 'error' });
                    return;
                }
            }
        }
        try {
            await updateEnv.mutateAsync({
                deploymentId: id,
                env: {
                    version: 2,
                    files: draftFiles
                }
            });
            const newDep = await redeploy.mutateAsync(id);
            setEnvModalOpen(false);
            router.push(`/deployments/${newDep.id}`);
        } catch (e) {}
    };

    const filteredVariables = useMemo(() => {
        const vars = Object.entries(activeFile.variables || {});
        let filtered = vars.filter(([k]) => k.toLowerCase().includes(searchQuery.toLowerCase()));
        if (sortBy === 'key') {
            filtered.sort((x, y) => x[0].localeCompare(y[0]));
        }
        return filtered;
    }, [activeFile.variables, searchQuery, sortBy]);

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

                            {/* Environment Variables Management */}
                            <Panel>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-black text-white">Environment</h3>
                                    <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => setEnvModalOpen(true)}>
                                        Manage
                                    </Button>
                                </div>
                                {envLoading ? (
                                    <div className="space-y-2 py-2">
                                        <SkeletonBlock className="h-4 w-full" />
                                        <SkeletonBlock className="h-4 w-3/4" />
                                    </div>
                                ) : (
                                    <div className="space-y-0">
                                        <InfoRow
                                            label="Environment Files"
                                            value={<span className="font-bold text-white">{decEnvResponse?.files?.length || 0}</span>}
                                        />
                                        <InfoRow
                                            label="Total Variables"
                                            value={
                                                <span className="font-bold text-white">
                                                    {decEnvResponse?.files?.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0) || 0}
                                                </span>
                                            }
                                        />
                                        <InfoRow
                                            label="Last Updated"
                                            value={<span className="text-slate-400">{formatDate(current.updatedAt)}</span>}
                                        />
                                    </div>
                                )}
                            </Panel>
                        </div>
                    </div>
                </>
            ) : null}

            {/* Manage Environment Variables Modal */}
            {envModalOpen ? (
                <AppModal title="Manage Environment Variables" open={envModalOpen} onClose={() => setEnvModalOpen(false)}>
                    <div className="mt-4 flex flex-col md:flex-row gap-6 h-[600px] max-h-[85vh]">
                        {/* Sidebar: Files List */}
                        <div className="w-full md:w-64 shrink-0 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-white/[0.08] pb-4 md:pb-0 md:pr-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Env Files</h4>
                                <Button
                                    variant="secondary"
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => setShowAddFile(!showAddFile)}
                                >
                                    <Plus size={12} /> Add
                                </Button>
                            </div>

                            {showAddFile && (
                                <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                                    <p className="text-[10px] font-bold text-cyan-300">File path (relative to repo root)</p>
                                    <input
                                        value={newFilePath}
                                        onChange={(e) => setNewFilePath(e.target.value)}
                                        placeholder="apps/server/.env"
                                        className={inputClassName}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                        <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => { setShowAddFile(false); setNewFilePath(''); }}>Cancel</Button>
                                        <Button variant="primary" className="h-7 px-2 text-xs" onClick={handleAddFile}>Create</Button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 terminal-scrollbar">
                                {draftFiles.map((file, idx) => {
                                    const isActive = idx === activeFileIndex;
                                    const isRenaming = renamingIndex === idx;

                                    return (
                                        <div
                                            key={file.path}
                                            onClick={() => !isRenaming && setActiveFileIndex(idx)}
                                            className={clsx(
                                                'group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer border transition-colors',
                                                isActive
                                                    ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-200'
                                                    : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:bg-white/[0.04] hover:text-white'
                                            )}
                                        >
                                            {isRenaming ? (
                                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        value={renamingPath}
                                                        onChange={(e) => setRenamingPath(e.target.value)}
                                                        className={clsx(inputClassName, 'h-7 py-0 px-2 text-xs')}
                                                    />
                                                    <Button variant="primary" className="h-7 w-7 p-0 shrink-0 text-xs" onClick={() => handleRenameFile(idx)}>✓</Button>
                                                    <Button variant="secondary" className="h-7 w-7 p-0 shrink-0 text-xs" onClick={() => { setRenamingIndex(null); setRenamingPath(''); }}>✕</Button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="truncate font-mono">{file.path}</span>
                                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRenamingIndex(idx);
                                                                setRenamingPath(file.path);
                                                            }}
                                                            className="p-1 hover:text-white"
                                                            title="Rename file"
                                                        >
                                                            <Edit2 size={11} />
                                                        </button>
                                                        {file.path !== '.env' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteFile(idx);
                                                                }}
                                                                className="p-1 hover:text-rose-400"
                                                                title="Delete file"
                                                            >
                                                                <Trash2 size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* History Toggle Button */}
                            <div className="border-t border-white/[0.08] pt-4 mt-auto">
                                <Button
                                    variant={historyOpen ? 'primary' : 'secondary'}
                                    className="w-full text-xs"
                                    onClick={() => setHistoryOpen(!historyOpen)}
                                >
                                    <History size={13} /> {historyOpen ? 'Show Variables' : 'Version History'}
                                </Button>
                            </div>
                        </div>

                        {/* Editor Panel */}
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            {historyOpen ? (
                                // Version History Section
                                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        <History size={15} /> Version History
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        View and restore environment configurations from successful deployments.
                                    </p>
                                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 terminal-scrollbar">
                                        {envHistory.isLoading ? (
                                            <div className="space-y-3">
                                                <SkeletonBlock className="h-20 w-full" />
                                                <SkeletonBlock className="h-20 w-full" />
                                            </div>
                                        ) : envHistory.data?.length === 0 ? (
                                            <p className="text-xs text-slate-500 italic">No environment history available.</p>
                                        ) : (
                                            envHistory.data?.map((item) => {
                                                const fileCount = item.env?.files?.length || 0;
                                                const varCount = item.env?.files?.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0) || 0;
                                                const isCurrentPreview = historyPreviewId === item.id;

                                                return (
                                                    <div key={item.id} className="border border-white/[0.06] bg-white/[0.02] rounded-lg p-4 flex flex-col gap-3">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <span className="text-xs font-bold text-cyan-300">Deployment #{item.deploymentNumber}</span>
                                                                <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 font-mono">{item.version.slice(0, 10)}</span>
                                                            </div>
                                                            <span className="text-[10px] text-slate-500">{formatDate(item.createdAt)}</span>
                                                        </div>
                                                        <div className="flex gap-4 text-xs text-slate-400">
                                                            <div>Files: <strong className="text-slate-200">{fileCount}</strong></div>
                                                            <div>Variables: <strong className="text-slate-200">{varCount}</strong></div>
                                                        </div>
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => setHistoryPreviewId(isCurrentPreview ? null : item.id)}>
                                                                {isCurrentPreview ? 'Close Preview' : 'Preview'}
                                                            </Button>
                                                            <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => {
                                                                setDraftFiles(JSON.parse(JSON.stringify(item.env.files)));
                                                                setActiveFileIndex(0);
                                                                setHistoryOpen(false);
                                                                useToastStore.getState().addToast({
                                                                    title: 'Version Loaded',
                                                                    description: 'Loaded selected environment version into editor draft. Click Save to apply.',
                                                                    severity: 'success'
                                                                });
                                                            }}>
                                                                Restore
                                                            </Button>
                                                        </div>

                                                        {isCurrentPreview && (
                                                            <div className="mt-2 bg-slate-950/60 border border-white/[0.04] rounded p-3 text-xs space-y-3 max-h-60 overflow-auto terminal-scrollbar">
                                                                {item.env?.files?.map((f) => (
                                                                    <div key={f.path} className="space-y-1">
                                                                        <p className="font-mono text-cyan-200 font-bold border-b border-white/[0.04] pb-1">{f.path}</p>
                                                                        <div className="pl-2 space-y-0.5">
                                                                            {Object.entries(f.variables || {}).map(([k]) => (
                                                                                <div key={k} className="flex justify-between font-mono">
                                                                                    <span className="text-slate-400">{k}</span>
                                                                                    <span className="text-slate-600">********</span>
                                                                                </div>
                                                                            ))}
                                                                            {Object.keys(f.variables || {}).length === 0 && (
                                                                                <p className="text-slate-600 italic">No variables in this file.</p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            ) : (
                                // Variables Table/Text Editor Section
                                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                    <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                                        <div className="flex flex-col">
                                            <h4 className="text-sm font-bold text-white font-mono">{activeFile.path}</h4>
                                            <span className="text-[10px] text-slate-500">
                                                {Object.keys(activeFile.variables || {}).length} variables
                                            </span>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                variant="secondary"
                                                className="h-8 px-3 text-xs"
                                                onClick={() => setIsBulkEdit(!isBulkEdit)}
                                            >
                                                {isBulkEdit ? 'Table Editor' : 'Bulk Edit / Text'}
                                            </Button>
                                        </div>
                                    </div>

                                    {isBulkEdit ? (
                                        // Bulk Text Area Editor
                                        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                            <p className="text-xs text-slate-400">
                                                Paste key-value pairs formatted as <code>KEY=VALUE</code>, one per line.
                                            </p>
                                            <textarea
                                                value={bulkText}
                                                onChange={(e) => setBulkText(e.target.value)}
                                                className={clsx(
                                                    inputClassName,
                                                    'flex-1 font-mono text-xs p-3 leading-relaxed resize-none bg-slate-950/80 border-white/[0.08] focus:border-cyan-500/50 terminal-scrollbar'
                                                )}
                                                placeholder="API_KEY=supersecretkey&#10;DEBUG=true"
                                            />
                                            <div className="flex justify-end gap-2 shrink-0">
                                                <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => setIsBulkEdit(false)}>Cancel</Button>
                                                <Button variant="primary" className="h-8 px-3 text-xs" onClick={handleBulkImport}>Import & Merge</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        // Table Editor
                                        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                            {/* Filters */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="relative flex-1">
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                                    <input
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        placeholder="Search keys..."
                                                        className={clsx(inputClassName, 'pl-9 h-9')}
                                                    />
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    className="h-9 shrink-0 px-2 text-xs"
                                                    onClick={() => setSortBy(v => v === 'none' ? 'key' : 'none')}
                                                    title="Sort A-Z"
                                                >
                                                    <ArrowUpDown size={14} className={sortBy === 'key' ? 'text-cyan-300' : 'text-slate-500'} />
                                                </Button>
                                                <Button
                                                    variant="primary"
                                                    className="h-9 shrink-0 px-3 text-xs"
                                                    onClick={handleAddVar}
                                                >
                                                    <Plus size={14} /> Add Variable
                                                </Button>
                                            </div>

                                            {/* Variables List */}
                                            <div className="flex-1 overflow-y-auto border border-white/[0.06] rounded-lg divide-y divide-white/[0.05] bg-white/[0.01] pr-1 terminal-scrollbar">
                                                {filteredVariables.length === 0 ? (
                                                    <div className="py-12 text-center text-xs text-slate-500 italic">
                                                        {searchQuery ? 'No matching variables found.' : 'No environment variables configured.'}
                                                    </div>
                                                ) : (
                                                    filteredVariables.map(([key, val]) => {
                                                        const isKeyValid = validateKey(key);
                                                        return (
                                                            <div key={key} className="flex flex-col sm:flex-row gap-3 p-3 items-start sm:items-center">
                                                                {/* Key Input */}
                                                                <div className="flex-1 w-full space-y-1">
                                                                    <input
                                                                        defaultValue={key}
                                                                        onBlur={(e) => handleUpdateVarKey(key, e.target.value)}
                                                                        placeholder="VARIABLE_KEY"
                                                                        className={clsx(
                                                                            inputClassName,
                                                                            'font-mono text-xs h-8',
                                                                            !isKeyValid && 'border-rose-500/50 bg-rose-500/5 focus:border-rose-500'
                                                                        )}
                                                                    />
                                                                    {!isKeyValid && (
                                                                        <p className="text-[10px] font-semibold text-rose-400">
                                                                            Must start with letter/underscore and contain only A-Z, 0-9, _.
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                {/* Value Input */}
                                                                <div className="flex-1 w-full">
                                                                    <PasswordInput
                                                                        value={val}
                                                                        onChange={(e) => handleUpdateVarValue(key, e.target.value)}
                                                                        placeholder="variable_value"
                                                                        className={clsx(inputClassName, 'font-mono text-xs h-8 pr-12')}
                                                                    />
                                                                </div>

                                                                {/* Actions */}
                                                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                                                    <Button
                                                                        variant="secondary"
                                                                        className="h-8 w-8 p-0 text-xs"
                                                                        onClick={() => handleDuplicateVar(key, val)}
                                                                        title="Duplicate"
                                                                    >
                                                                        <Copy size={12} />
                                                                    </Button>
                                                                    <Button
                                                                        variant="secondary"
                                                                        className="h-8 w-8 p-0 hover:text-rose-400 text-xs"
                                                                        onClick={() => handleDeleteVar(key)}
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom buttons */}
                    <div className="mt-6 flex flex-wrap justify-between items-center border-t border-white/[0.08] pt-4 gap-4">
                        <div className="text-[11px] text-slate-500">
                            Limit: {draftFiles.length}/20 files. Total variables: {draftFiles.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0)}/200.
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setEnvModalOpen(false)}>Cancel</Button>
                            <Button variant="secondary" loading={updateEnv.isPending} onClick={handleSaveChanges}>
                                Save Changes
                            </Button>
                            <Button variant="primary" loading={updateEnv.isPending || redeploy.isPending} onClick={handleSaveAndRedeploy}>
                                Save & Redeploy
                            </Button>
                        </div>
                    </div>
                </AppModal>
            ) : null}

            {/* Overwrite Confirmation Modal */}
            {showConfirmOverwrite ? (
                <AppModal title="Confirm Overwrite" open={showConfirmOverwrite} onClose={() => setShowConfirmOverwrite(false)}>
                    <div className="space-y-4">
                        <p className="text-sm leading-6 text-slate-400 mt-2">
                            Some variables you are importing already exist in this file. Importing will overwrite their current values.
                        </p>
                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setShowConfirmOverwrite(false)}>Cancel</Button>
                            <Button variant="primary" onClick={confirmBulkImport}>
                                Overwrite & Merge
                            </Button>
                        </div>
                    </div>
                </AppModal>
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
