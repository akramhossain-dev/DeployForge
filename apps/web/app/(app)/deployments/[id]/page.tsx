'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Circle,
    Clock,
    Copy,
    ExternalLink,
    GitBranch,
    Github,
    Globe,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Server,
    Square,
    TerminalSquare,
    Trash2,
    XCircle,
    Zap,
    PackagePlus,
    Search,
    Edit2,
    Plus,
    Download,
    Maximize2,
    Minimize2,
    Wifi,
    WifiOff,
    ChevronDown,
    ChevronRight,
    History,
    Check,
    X,
    Eye,
    EyeOff
} from 'lucide-react';
import { formatDate, StatusBadge, PasswordInput, INPUT_STYLE } from '@/components/ui';
import { AnsiText } from '@/components/deployments/detail/AnsiLogViewer';
import { DeploymentErrorBanner } from '@/components/deployments/detail/DeploymentErrorBanner';
import { DeploymentTimeline } from '@/components/deployments/detail/DeploymentTimeline';
import {
    useDeleteDeployment,
    useDeployment,
    useDeploymentLogs,
    useDeploymentLogStream,
    useDeploymentStatusStream,
    usePauseDeployment,
    useRestartDeployment,
    useResumeDeployment,
    useRollbackDeployment,
    useStartDeployment,
    useStopDeployment,
    useDeploymentEnv,
    useUpdateDeploymentEnv,
    useDeploymentEnvHistory,
    useRedeploy,
    type EnvFile
} from '@/hooks/useDeployForgeData';
import type { DeploymentLog } from '@/lib/api/types';
import { parseError } from '@/lib/utils/errorParser';
import { useToastStore } from '@/lib/store/useToastStore';

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

function LogLine({ log, searchQuery }: { log: DeploymentLog; searchQuery: string }) {
    const text = log.message || log.output || '';
    const isError = log.level === 'error' || log.type === 'error' || /failed|error|exception/i.test(text);
    const isWarn = log.level === 'warn' || /warn/i.test(text);
    const isSuccess = /success|running/i.test(text);

    return (
        <div
            className={clsx(
                'flex items-start gap-2.5 rounded px-2 py-0.5 font-mono text-[11px] leading-normal',
                isError ? 'text-rose-400 font-semibold' :
                isWarn ? 'text-amber-400' :
                isSuccess ? 'text-emerald-400' : 'text-[#A1A1A1]'
            )}
        >
            <span className="shrink-0 text-[#666666] select-none">{formatDate(log.createdAt || log.timestamp)}</span>
            {isError && <AlertCircle size={12} className="text-rose-400 shrink-0 mt-0.5" />}
            {isWarn && !isError && <AlertCircle size={12} className="text-amber-400 shrink-0 mt-0.5" />}
            <span className="break-all flex-1">
                <AnsiText text={text} searchQuery={searchQuery} />
            </span>
        </div>
    );
}





function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-[#1F1F1F] py-2 last:border-0 last:pb-0 font-mono text-xs">
            <span className="text-[#666666] shrink-0">{label}</span>
            <span className="font-semibold text-white text-right truncate">{value}</span>
        </div>
    );
}

function ActionRow({ label, enabled }: { label: string; enabled: boolean }) {
    return (
        <div className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#111111] px-3 py-2 font-mono text-xs">
            <span className="font-semibold text-[#A1A1A1]">{label}</span>
            <span className={clsx('text-[10px] font-bold uppercase', enabled ? 'text-emerald-400' : 'text-[#666666]')}>
                {enabled ? 'Available' : 'N/A'}
            </span>
        </div>
    );
}

export default function DeploymentDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const addToast = useToastStore((s) => s.addToast);
    const openErrorDrawer = useToastStore((s) => s.openErrorDrawer);

    const deployment = useDeployment(id);
    const initialLogs = useDeploymentLogs(id);
    const [logsPaused, setLogsPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [logFilter, setLogFilter] = useState<'all' | 'build' | 'runtime' | 'system' | 'error'>('all');
    const [logsSearchQuery, setLogsSearchQuery] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [consoleCollapsed, setConsoleCollapsed] = useState(false);

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
    const { data: decEnvResponse, isLoading: envLoading } = useDeploymentEnv(id);
    const updateEnv = useUpdateDeploymentEnv();
    const envHistory = useDeploymentEnvHistory(id);
    const redeploy = useRedeploy();

    const [draftFiles, setDraftFiles] = useState<EnvFile[]>([{ path: '.env', variables: {} }]);
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

    const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
    const [renamingPath, setRenamingPath] = useState('');

    useEffect(() => {
        if (decEnvResponse?.files && decEnvResponse.files.length > 0) {
            setDraftFiles(JSON.parse(JSON.stringify(decEnvResponse.files)));
        } else if (envModalOpen && draftFiles.length === 0) {
            setDraftFiles([{ path: '.env', variables: {} }]);
        }
    }, [decEnvResponse, envModalOpen]);

    const activeFile = draftFiles[activeFileIndex] || { path: '.env', variables: {} };

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
        if (path.split(/[/\\]/).some((p) => p === '..')) return false;
        const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        const fileName = normalized.split('/').pop() || '';
        return fileName.startsWith('.env');
    };

    const handleUpdateVarKey = (oldKey: string, newKey: string) => {
        if (oldKey === newKey) return;
        setDraftFiles((currentFiles) => {
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
        setDraftFiles((currentFiles) => {
            const next = [...currentFiles];
            const file = next[activeFileIndex];
            if (!file) return currentFiles;
            file.variables = { ...file.variables, [key]: value };
            return next;
        });
    };

    const handleDeleteVar = (key: string) => {
        setDraftFiles((currentFiles) => {
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
        setDraftFiles((currentFiles) => {
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
        setDraftFiles((currentFiles) => {
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
        const duplicates = Object.keys(parsed).filter((k) => k in activeVars);
        if (duplicates.length > 0) {
            setPendingImportVars(parsed);
            setShowConfirmOverwrite(true);
        } else {
            setDraftFiles((currentFiles) => {
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
        setDraftFiles((currentFiles) => {
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
            addToast({
                title: 'Invalid Path',
                description: 'File path must be relative and start with .env (e.g. apps/client/.env).',
                severity: 'error'
            });
            return;
        }
        if (draftFiles.some((f) => f.path === newFilePath)) {
            addToast({
                title: 'Duplicate Path',
                description: 'This environment file path already exists.',
                severity: 'error'
            });
            return;
        }
        setDraftFiles((prev) => [...prev, { path: newFilePath, variables: {} }]);
        setActiveFileIndex(draftFiles.length);
        setNewFilePath('');
        setShowAddFile(false);
    };

    const handleRenameFile = (index: number) => {
        if (!validatePath(renamingPath)) {
            addToast({
                title: 'Invalid Path',
                description: 'File path must be relative and start with .env.',
                severity: 'error'
            });
            return;
        }
        if (draftFiles.some((f, idx) => f.path === renamingPath && idx !== index)) {
            addToast({
                title: 'Duplicate Path',
                description: 'This environment file path already exists.',
                severity: 'error'
            });
            return;
        }
        setDraftFiles((prev) => {
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
            addToast({
                title: 'Delete Rejected',
                description: 'The root .env file cannot be deleted.',
                severity: 'error'
            });
            return;
        }
        if (draftFiles.length <= 1) {
            addToast({
                title: 'Delete Rejected',
                description: 'At least one environment file must remain.',
                severity: 'error'
            });
            return;
        }
        setDraftFiles((prev) => prev.filter((_, idx) => idx !== index));
        setActiveFileIndex(0);
    };

    const handleSaveChanges = async () => {
        for (const file of draftFiles) {
            if (!validatePath(file.path)) {
                addToast({ title: 'Validation Error', description: `Invalid file path: ${file.path}`, severity: 'error' });
                return;
            }
            for (const key of Object.keys(file.variables)) {
                if (!validateKey(key)) {
                    addToast({ title: 'Validation Error', description: `Invalid variable key "${key}" in ${file.path}`, severity: 'error' });
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
                addToast({ title: 'Validation Error', description: `Invalid file path: ${file.path}`, severity: 'error' });
                return;
            }
            for (const key of Object.keys(file.variables)) {
                if (!validateKey(key)) {
                    addToast({ title: 'Validation Error', description: `Invalid variable key "${key}" in ${file.path}`, severity: 'error' });
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

    const handleCopyLogs = () => {
        const text = filteredLogs.map((l) => `[${formatDate(l.createdAt || l.timestamp)}] ${l.message || l.output || ''}`).join('\n');
        navigator.clipboard.writeText(text);
        addToast({ title: 'Copied', description: `Copied ${filteredLogs.length} log lines`, severity: 'success' });
    };

    const handleDownloadLogs = () => {
        const text = filteredLogs.map((l) => `[${formatDate(l.createdAt || l.timestamp)}] [${(l.level || 'info').toUpperCase()}] [${l.type || 'runtime'}] ${l.message || l.output || ''}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deployment-${id}-${logFilter}-logs.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addToast({ title: 'Downloaded', description: `Started log download`, severity: 'success' });
    };

    const handleReconnectWs = () => {
        setLogsPaused(true);
        setTimeout(() => {
            setLogsPaused(false);
            addToast({ title: 'Logs Reconnected', description: 'Re-established log stream.', severity: 'success' });
        }, 150);
    };

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
    const isSandbox = current?.mode === 'sandbox';

    const rawErrorText = useMemo(() => {
        if (current?.status !== 'FAILED') return '';
        const errorLogs = logs.filter((l) => l.level === 'error' || /fail|error|exception/i.test(l.message || l.output || ''));
        return (errorLogs.length ? errorLogs.slice(-5) : logs.slice(-3)).map((l) => l.message || l.output).join('\n');
    }, [current?.status, logs]);

    const parsedError = useMemo(() => (rawErrorText ? parseError(rawErrorText) : null), [rawErrorText]);

    const failedStepIndex = useMemo(() => {
        if (current?.status !== 'FAILED') return -1;
        const txt = logs.map((l) => (l.message || l.output || '').toLowerCase()).join('\n');
        if (/(clone|repository)/.test(txt)) return 1;
        if (/(extract|upload)/.test(txt)) return 3;
        if (/(build|install|npm|yarn|pnpm|bun)/.test(txt)) return 4;
        return 5;
    }, [current?.status, logs]);

    useEffect(() => {
        if (autoScroll) consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
    }, [filteredLogs, autoScroll]);

    if (deployment.isLoading) {
        return (
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading deployment details...
            </div>
        );
    }

    if (deployment.isError || !current) {
        return (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 sm:p-6 font-mono text-xs text-rose-300">
                <p className="font-bold text-white">Unable to load deployment run</p>
                <p className="mt-1">{(deployment.error as Error)?.message || 'Deployment ID not found.'}</p>
                <Link href="/deployments" className="mt-3 inline-flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]">
                    Return to Deployments
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6 font-mono text-xs max-w-full overflow-x-hidden">
            {/* Action Errors */}
            {[start, stop, pauseDeployment, resume, restart, rollback, deleteDeployment].map((m, i) =>
                m.isError ? (
                    <div key={i} className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                        Action failed: {(m.error as Error)?.message}
                    </div>
                ) : null
            )}

            {/* ── 1. Page Header & Operations Toolbar ── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-[#1F1F1F] pb-4 sm:pb-5">
                <div className="flex items-center gap-3">
                    <Link href="/deployments">
                        <button className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white transition-colors">
                            <ArrowLeft size={14} />
                        </button>
                    </Link>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
                                {current.name || current.project?.name || 'Deployment Run'}
                            </h1>
                            <StatusBadge status={current.status} />
                        </div>
                        <p className="mt-1 text-xs text-[#A1A1A1] truncate">
                            {current.project?.repositoryUrl?.replace('upload://', '') || 'Release execution logs and host details.'}
                        </p>
                    </div>
                </div>

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

            {/* ── 2. Structured Error Diagnostic Banner ── */}
            {current.status === 'FAILED' && parsedError ? (
                <DeploymentErrorBanner
                    parsedError={parsedError}
                    deploymentId={current.id}
                    updatedAt={current.updatedAt}
                />
            ) : null}

            <DeploymentTimeline
                current={current}
                activeUrl={activeUrl}
                isStatic={isStatic}
                failedStepIndex={failedStepIndex}
            />

            {/* ── 6. Console Main Column & Sidebar Grid ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* Console Log Terminal Box */}
                <div className={clsx('rounded-md border border-[#1F1F1F] bg-[#0A0A0A] flex flex-col min-w-0', isFullscreen ? 'fixed inset-2 sm:inset-4 z-50' : 'h-[500px] sm:h-[540px]')}>
                    {/* Terminal Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#1F1F1F] bg-[#111111] px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="flex items-center gap-2 font-semibold text-white">
                                <TerminalSquare size={14} />
                                <span>Execution Log Terminal</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px]">
                                {!logsPaused ? (
                                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                        <Wifi size={11} /> LIVE STREAM ACTIVE
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-[#666666]">
                                        <WifiOff size={11} /> STREAM PAUSED
                                    </span>
                                )}
                            </div>
                            {!stream.isConnected && (
                                <button
                                    onClick={handleReconnectWs}
                                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline flex items-center gap-1"
                                >
                                    <RefreshCw size={10} className="animate-spin" /> Reconnect
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Filter tabs */}
                            <div className="flex items-center gap-1 overflow-x-auto max-w-full text-[10px]">
                                {(['all', 'build', 'runtime', 'system', 'error'] as const).map((filter) => {
                                    const count = logs.filter((l) => {
                                        if (filter === 'all') return true;
                                        if (filter === 'build') return l.type === 'build';
                                        if (filter === 'runtime') return l.type === 'runtime';
                                        if (filter === 'system') return l.type === 'system';
                                        return l.level === 'error' || l.type === 'error' || /failed|error|exception/i.test(l.message || l.output || '');
                                    }).length;

                                    return (
                                        <button
                                            key={filter}
                                            onClick={() => setLogFilter(filter)}
                                            className={clsx(
                                                'rounded px-2 py-0.5 uppercase transition-colors shrink-0',
                                                logFilter === filter ? 'bg-[#000000] font-bold text-white border border-[#333333]' : 'text-[#666666] hover:text-white'
                                            )}
                                        >
                                            {filter} <span className="opacity-60">({count})</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Logs Search Input */}
                            <div className="relative flex-1 sm:flex-none">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#666666]" />
                                <input
                                    value={logsSearchQuery}
                                    onChange={(e) => setLogsSearchQuery(e.target.value)}
                                    placeholder="Filter logs..."
                                    className="h-6 w-full sm:w-32 md:w-40 rounded border border-[#1F1F1F] bg-[#000000] pl-7 pr-2 text-[11px] text-white outline-none placeholder:text-[#666666] focus:border-[#333333]"
                                />
                            </div>

                            {/* Terminal Actions */}
                            <button
                                onClick={() => setAutoScroll(!autoScroll)}
                                className={clsx('h-6 rounded border px-2 text-[10px] uppercase shrink-0', autoScroll ? 'border-white bg-[#000000] text-white' : 'border-[#1F1F1F] text-[#666666]')}
                            >
                                Auto-scroll
                            </button>
                            <button onClick={handleCopyLogs} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white shrink-0">
                                <Copy size={11} />
                            </button>
                            <button onClick={handleDownloadLogs} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white shrink-0">
                                <Download size={11} />
                            </button>
                            <button onClick={() => setConsoleCollapsed(!consoleCollapsed)} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white shrink-0">
                                {consoleCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                            </button>
                            <button onClick={() => setIsFullscreen(!isFullscreen)} className="h-6 rounded border border-[#1F1F1F] bg-[#000000] px-2 text-[10px] text-[#A1A1A1] hover:text-white shrink-0">
                                {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                            </button>
                        </div>
                    </div>

                    {/* Console Output Area */}
                    <div className={clsx('flex-1 overflow-hidden transition-all duration-200', consoleCollapsed ? 'h-0 hidden' : 'flex flex-col')}>
                        <div ref={consoleRef} className="flex-1 overflow-y-auto p-3 bg-[#000000] space-y-1 font-mono text-[11px] leading-relaxed no-scrollbar">
                            {filteredLogs.length === 0 ? (
                                <div className="py-12 text-center text-[#666666]">
                                    No log entries available for this view.
                                </div>
                            ) : (
                                filteredLogs.map((l) => (
                                    <LogLine key={l.id} log={l} searchQuery={logsSearchQuery} />
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar Inspection Panels */}
                <div className="space-y-4 font-mono text-xs">
                    {/* Webhook Card */}
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3">
                        <h3 className="font-semibold text-white border-b border-[#1F1F1F] pb-2">Webhook Integration</h3>
                        <div className="space-y-1">
                            <InfoRow label="Status" value={sourceType === 'upload' ? 'N/A (Upload)' : (current as any)?.webhookId ? 'Connected' : 'Not configured'} />
                            <InfoRow label="Last trigger" value={formatDate(current.updatedAt)} />
                            <InfoRow label="Commit" value={sourceType === 'github' && current.commitHash ? current.commitHash.slice(0, 10) : 'Manual'} />
                            <InfoRow label="Branch" value={sourceType === 'github' ? current.branch || 'main' : 'N/A'} />
                        </div>
                    </div>

                    {/* Build Output Card */}
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3">
                        <h3 className="font-semibold text-white border-b border-[#1F1F1F] pb-2">Build Configuration</h3>
                        <div className="space-y-1">
                            <InfoRow label="Framework" value={current.framework || 'Auto-detect'} />
                            <InfoRow label="Engine" value={isStatic ? 'Static engine' : 'Docker Container'} />
                            <InfoRow label="Build cmd" value={current.buildCommand || 'Default'} />
                            <InfoRow label="Start cmd" value={current.startCommand || 'Default'} />
                            <InfoRow label="Container ID" value={current.containerId ? current.containerId.slice(0, 10) : 'None'} />
                        </div>
                    </div>

                    {/* Available Actions Card */}
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3">
                        <h3 className="font-semibold text-white border-b border-[#1F1F1F] pb-2">Available Actions</h3>
                        <div className="space-y-1.5">
                            <ActionRow label="Restart container" enabled={canRestart} />
                            <ActionRow label="Rollback version" enabled={canRollback} />
                            <ActionRow label="Webhook deploy" enabled={!isSandbox && canRollback} />
                            <ActionRow label="View commit logs" enabled={sourceType === 'github'} />
                        </div>
                    </div>

                    {/* Environment Variables Summary Card */}
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-2">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-white">Environment</h3>
                                {!envLoading && decEnvResponse?.files && decEnvResponse.files.length > 0 && (
                                    <span className="rounded bg-[#111111] border border-[#1F1F1F] px-1.5 py-0.5 text-[10px] text-[#A1A1A1]">
                                        {decEnvResponse.files.reduce((s, f) => s + Object.keys(f.variables || {}).length, 0)} vars
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setEnvModalOpen(true)}
                                className="h-6 rounded border border-[#1F1F1F] bg-[#111111] px-2 text-[11px] text-white hover:bg-[#1F1F1F] transition-colors"
                            >
                                Manage
                            </button>
                        </div>
                        {envLoading ? (
                            <div className="space-y-2 py-2 text-[#666666]">Loading variables…</div>
                        ) : decEnvResponse?.files && decEnvResponse.files.length > 0 ? (
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                    {decEnvResponse.files.map((f) => (
                                        <span key={f.path} className="rounded border border-[#1F1F1F] bg-[#000000] px-2 py-1 text-[11px] text-[#A1A1A1]">
                                            {f.path} ({Object.keys(fileVariablesCount(f)).length})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="py-2 text-[#666666] text-center">
                                No environment variables configured.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 7. Delete Confirmation Modal ── */}
            {deleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 sm:p-6 space-y-4">
                        <div className="border-b border-[#1F1F1F] pb-3">
                            <h3 className="text-sm font-bold text-white">Delete Deployment Run</h3>
                            <p className="mt-1 text-[#666666]">This action permanently removes container routing and deployment history.</p>
                        </div>
                        <p className="text-[#A1A1A1]">
                            Confirm deletion of release <span className="font-bold text-white">{current.name || id}</span>:
                        </p>
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                            <button onClick={() => setDeleteOpen(false)} className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] px-3 text-white hover:bg-[#1A1A1A]">
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await deleteDeployment.mutateAsync(id);
                                    router.push('/deployments');
                                }}
                                disabled={deleteDeployment.isPending}
                                className="flex h-8 items-center justify-center gap-1 rounded border border-rose-900/40 bg-rose-950/40 px-3 font-semibold text-rose-300 hover:bg-rose-900/60"
                            >
                                {deleteDeployment.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 8. Rich Multi-File Environment Variable Manager Modal (Fully Responsive) ── */}
            {envModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 font-mono text-xs overflow-y-auto">
                    <div className="w-full max-w-4xl rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col my-auto">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-white">Manage Environment Variables</h3>
                                <span className="rounded border border-[#1F1F1F] bg-[#111111] px-2 py-0.5 text-[10px] text-[#A1A1A1]">
                                    {draftFiles.length} {draftFiles.length === 1 ? 'file' : 'files'}
                                </span>
                            </div>
                            <button onClick={() => setEnvModalOpen(false)} className="text-[#666666] hover:text-white p-1">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden min-h-[360px]">
                            {/* File Selector (Mobile Dropdown + Desktop Sidebar) */}
                            <div className="w-full md:w-60 shrink-0 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-[#1F1F1F] pb-3 md:pb-0 md:pr-3">
                                {/* Header / Add file (Desktop) */}
                                <div className="hidden md:flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold uppercase text-[#666666] shrink-0">ENV FILES</span>
                                    <button
                                        onClick={() => setShowAddFile(!showAddFile)}
                                        className="h-6 rounded border border-[#1F1F1F] bg-[#111111] px-2 text-[11px] font-medium text-white hover:bg-[#1F1F1F] whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                                    >
                                        <Plus size={11} /> Add File
                                    </button>
                                </div>

                                {showAddFile && (
                                    <div className="space-y-2 rounded border border-[#1F1F1F] bg-[#111111] p-2.5">
                                        <p className="text-[10px] text-[#A1A1A1]">Relative path from repo root</p>
                                        <input
                                            value={newFilePath}
                                            onChange={(e) => setNewFilePath(e.target.value)}
                                            placeholder="apps/server/.env"
                                            className={INPUT_STYLE}
                                        />
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => setShowAddFile(false)} className="h-6 rounded border border-[#1F1F1F] px-2 text-[10px] text-[#A1A1A1]">Cancel</button>
                                            <button onClick={handleAddFile} className="h-6 rounded bg-white px-2 text-[10px] font-semibold text-black">Create</button>
                                        </div>
                                    </div>
                                )}

                                {/* Mobile File Selector Row */}
                                <div className="flex items-center gap-2 md:hidden">
                                    <select
                                        value={activeFileIndex}
                                        onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                                        className={clsx(INPUT_STYLE, 'flex-1 h-9 bg-[#000000] font-mono text-xs')}
                                    >
                                        {draftFiles.map((file, idx) => (
                                            <option key={file.path} value={idx}>
                                                {file.path} ({Object.keys(file.variables || {}).length} vars)
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => setShowAddFile(!showAddFile)}
                                        className="h-9 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1F1F1F] whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add File
                                    </button>
                                </div>

                                {/* Desktop File List */}
                                <div className="hidden md:flex flex-1 overflow-y-auto flex-col space-y-1.5 pr-1 min-h-[140px]">
                                    {draftFiles.map((file, idx) => {
                                        const isActive = idx === activeFileIndex;
                                        const isRenaming = renamingIndex === idx;

                                        return (
                                            <div
                                                key={file.path}
                                                onClick={() => !isRenaming && setActiveFileIndex(idx)}
                                                className={clsx(
                                                    'flex items-center justify-between rounded px-2.5 py-1.5 text-xs font-mono cursor-pointer border transition-colors',
                                                    isActive ? 'bg-[#111111] border-white text-white font-semibold' : 'bg-[#000000] border-[#1F1F1F] text-[#A1A1A1] hover:text-white'
                                                )}
                                            >
                                                {isRenaming ? (
                                                    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                                        <input value={renamingPath} onChange={(e) => setRenamingPath(e.target.value)} className={clsx(INPUT_STYLE, 'h-6 text-xs py-0')} />
                                                        <button onClick={() => handleRenameFile(idx)} className="h-6 w-6 rounded bg-white text-black flex items-center justify-center shrink-0"><Check size={11} /></button>
                                                        <button onClick={() => setRenamingIndex(null)} className="h-6 w-6 rounded border border-[#1F1F1F] text-[#A1A1A1] flex items-center justify-center shrink-0"><X size={11} /></button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="truncate">{file.path}</span>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button onClick={(e) => { e.stopPropagation(); setRenamingIndex(idx); setRenamingPath(file.path); }} className="text-[#666666] hover:text-white"><Edit2 size={11} /></button>
                                                            {file.path !== '.env' && <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(idx); }} className="text-[#666666] hover:text-rose-400"><Trash2 size={11} /></button>}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setHistoryOpen(!historyOpen)}
                                    className="mt-auto h-8 flex items-center justify-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] text-xs font-semibold text-white hover:bg-[#1F1F1F] transition-colors shrink-0"
                                >
                                    <History size={13} /> {historyOpen ? 'Editor Draft' : 'Version History'}
                                </button>
                            </div>

                            {/* Modal Main Content Area */}
                            <div className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">
                                {historyOpen ? (
                                    /* Version History Tab */
                                    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                        <div className="border-b border-[#1F1F1F] pb-2">
                                            <h4 className="font-semibold text-white">Environment Version History</h4>
                                            <p className="text-[11px] text-[#A1A1A1]">Restore verified environment snapshots from past release deployments.</p>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                            {envHistory.isLoading ? (
                                                <div className="py-6 text-center text-[#666666]">Loading version history…</div>
                                            ) : envHistory.data?.length === 0 ? (
                                                <div className="py-6 text-center text-[#666666]">No environment history records found.</div>
                                            ) : (
                                                envHistory.data?.map((item) => {
                                                    const varCount = item.env?.files?.reduce((s, f) => s + Object.keys(f.variables || {}).length, 0) || 0;
                                                    const isPreview = historyPreviewId === item.id;

                                                    return (
                                                        <div key={item.id} className="rounded border border-[#1F1F1F] bg-[#111111] p-3 space-y-2">
                                                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                                                <span className="font-bold text-white">Release #{item.deploymentNumber} ({item.version.slice(0, 8)})</span>
                                                                <span className="text-[#666666]">{formatDate(item.createdAt)}</span>
                                                            </div>
                                                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1A1A1]">
                                                                <span>{item.env?.files?.length || 0} files • {varCount} variables</span>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => setHistoryPreviewId(isPreview ? null : item.id)}
                                                                        className="h-6 rounded border border-[#1F1F1F] px-2 text-[#A1A1A1] hover:text-white"
                                                                    >
                                                                        {isPreview ? 'Close Preview' : 'Preview'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setDraftFiles(JSON.parse(JSON.stringify(item.env.files)));
                                                                            setActiveFileIndex(0);
                                                                            setHistoryOpen(false);
                                                                            addToast({ title: 'Version Restored', description: 'Loaded snapshot into editor draft.', severity: 'success' });
                                                                        }}
                                                                        className="h-6 rounded bg-white px-2 font-semibold text-black hover:bg-[#E5E5E5]"
                                                                    >
                                                                        Restore
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            {isPreview && (
                                                                <div className="rounded border border-[#1F1F1F] bg-[#000000] p-2 space-y-2 max-h-40 overflow-y-auto">
                                                                    {item.env?.files?.map((f) => (
                                                                        <div key={f.path} className="space-y-1">
                                                                            <p className="font-bold text-white border-b border-[#1F1F1F] pb-1">{f.path}</p>
                                                                            {Object.keys(f.variables || {}).map((k) => (
                                                                                <div key={k} className="flex justify-between text-[#A1A1A1]">
                                                                                    <span className="truncate">{k}</span>
                                                                                    <span>••••••••</span>
                                                                                </div>
                                                                            ))}
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
                                    /* Variables Table / Bulk Text Editor */
                                    <div className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">
                                        <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-2 gap-2">
                                            <span className="font-semibold text-white truncate">{activeFile.path}</span>
                                            <button
                                                onClick={() => setIsBulkEdit(!isBulkEdit)}
                                                className="h-7 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1F1F1F] shrink-0"
                                            >
                                                {isBulkEdit ? 'Table Editor' : 'Bulk Edit / Text'}
                                            </button>
                                        </div>

                                        {isBulkEdit ? (
                                            <div className="flex-1 flex flex-col gap-3">
                                                <textarea
                                                    value={bulkText}
                                                    onChange={(e) => setBulkText(e.target.value)}
                                                    className={clsx(INPUT_STYLE, 'min-h-[200px] flex-1 p-3 leading-relaxed resize-none')}
                                                    placeholder="KEY=VALUE"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setIsBulkEdit(false)} className="h-7 rounded border border-[#1F1F1F] px-3 text-[#A1A1A1]">Cancel</button>
                                                    <button onClick={handleBulkImport} className="h-7 rounded bg-white px-3 font-semibold text-black">Import & Merge</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                                {/* Toolbar row: Search, Sort, Add */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="relative flex-1 min-w-[140px]">
                                                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666666]" />
                                                        <input
                                                            value={searchQuery}
                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                            placeholder="Search keys..."
                                                            className={clsx(INPUT_STYLE, 'pl-7 h-8')}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => setSortBy((v) => (v === 'none' ? 'key' : 'none'))}
                                                        className="h-8 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-[#A1A1A1] shrink-0"
                                                    >
                                                        Sort A-Z
                                                    </button>
                                                    <button
                                                        onClick={handleAddVar}
                                                        className="h-8 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1F1F1F] shrink-0"
                                                    >
                                                        + Add Variable
                                                    </button>
                                                </div>

                                                {/* Variable Rows Table */}
                                                <div className="flex-1 overflow-y-auto border border-[#1F1F1F] rounded divide-y divide-[#1F1F1F] bg-[#000000] min-h-[160px] max-h-[320px]">
                                                    {filteredVariables.length === 0 ? (
                                                        <div className="py-12 text-center text-[#666666] italic">No variables in this file.</div>
                                                    ) : (
                                                        filteredVariables.map(([key, val]) => (
                                                            <div key={key} className="grid grid-cols-1 sm:grid-cols-[1.5fr_2fr_auto] gap-2 p-2.5 items-center">
                                                                <input
                                                                    defaultValue={key}
                                                                    onBlur={(e) => handleUpdateVarKey(key, e.target.value)}
                                                                    className={INPUT_STYLE}
                                                                />
                                                                <PasswordInput
                                                                    value={val}
                                                                    onChange={(e) => handleUpdateVarValue(key, e.target.value)}
                                                                    className={INPUT_STYLE}
                                                                />
                                                                <div className="flex items-center gap-1 justify-end">
                                                                    <button onClick={() => handleDuplicateVar(key, val)} className="p-1.5 text-[#666666] hover:text-white" title="Duplicate"><Copy size={12} /></button>
                                                                    <button onClick={() => handleDeleteVar(key)} className="p-1.5 text-[#666666] hover:text-rose-400" title="Delete"><Trash2 size={12} /></button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Overwrite Confirmation Banner */}
                        {showConfirmOverwrite && (
                            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
                                <span className="text-amber-200 text-xs">Import contains duplicate keys that will overwrite existing values.</span>
                                <div className="flex gap-2 shrink-0">
                                    <button onClick={() => setShowConfirmOverwrite(false)} className="h-6 rounded border border-[#1F1F1F] px-2 text-[#A1A1A1]">Cancel</button>
                                    <button onClick={confirmBulkImport} className="h-6 rounded bg-white px-2 font-semibold text-black">Confirm</button>
                                </div>
                            </div>
                        )}

                        {/* Modal Footer Buttons */}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-[#1F1F1F] shrink-0">
                            <button onClick={() => setEnvModalOpen(false)} className="h-8 rounded border border-[#1F1F1F] bg-[#111111] px-4 text-white hover:bg-[#1A1A1A]">Cancel</button>
                            <button onClick={handleSaveChanges} disabled={updateEnv.isPending} className="h-8 rounded border border-[#1F1F1F] bg-[#111111] px-4 text-white hover:bg-[#1F1F1F]">Save Draft</button>
                            <button onClick={handleSaveAndRedeploy} disabled={updateEnv.isPending || redeploy.isPending} className="h-8 rounded bg-white px-4 font-semibold text-black hover:bg-[#E5E5E5]">
                                Save & Redeploy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function fileVariablesCount(file: EnvFile): Record<string, string> {
    return file.variables || {};
}
