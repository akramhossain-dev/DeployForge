'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    AlertCircle, ArrowLeft, CheckCircle2, Circle, Clock, Copy, ExternalLink,
    GitBranch, Github, Globe, Loader2, Pause, Play, RefreshCw, RotateCcw,
    Server, Square, TerminalSquare, Trash2, XCircle, Zap, PackagePlus,
    Search, ArrowUpDown, PlusCircle, History, Edit2, Plus, Eye, EyeOff,
    Download, ChevronDown, ChevronRight, Maximize2, Minimize2, Wifi, WifiOff,
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

type AnsiSegment = {
    text: string;
    bold?: boolean;
    underline?: boolean;
    colorClass?: string;
    bgClass?: string;
};

function parseAnsiText(text: string): AnsiSegment[] {
    const ansiRegex = /\x1B\[[0-9;]*m/g;
    let match;
    let lastIndex = 0;
    const segments: AnsiSegment[] = [];

    let isBold = false;
    let isUnderline = false;
    let currentColorClass = '';
    let currentBgClass = '';

    const getStylesFromCodes = (codesStr: string) => {
        if (!codesStr || codesStr === '0') {
            isBold = false;
            isUnderline = false;
            currentColorClass = '';
            currentBgClass = '';
            return;
        }

        const codes = codesStr.split(';').map(Number);
        for (const code of codes) {
            if (code === 0) {
                isBold = false;
                isUnderline = false;
                currentColorClass = '';
                currentBgClass = '';
            } else if (code === 1) {
                isBold = true;
            } else if (code === 4) {
                isUnderline = true;
            } else if (code >= 30 && code <= 37) {
                const colors = [
                    'text-slate-900', // 30 Black
                    'text-rose-400 font-semibold',  // 31 Red
                    'text-emerald-400', // 32 Green
                    'text-amber-400', // 33 Yellow
                    'text-sky-400',   // 34 Blue
                    'text-fuchsia-400', // 35 Magenta
                    'text-cyan-400',  // 36 Cyan
                    'text-slate-100'  // 37 White
                ];
                currentColorClass = colors[code - 30] || '';
            } else if (code >= 90 && code <= 97) {
                const brightColors = [
                    'text-slate-600', // 90 Bright Black
                    'text-rose-300 font-bold',  // 91 Bright Red
                    'text-emerald-300 font-bold', // 92 Bright Green
                    'text-amber-300 font-bold', // 93 Bright Yellow
                    'text-sky-300 font-bold',   // 94 Bright Blue
                    'text-fuchsia-300 font-bold', // 95 Bright Magenta
                    'text-cyan-300 font-bold',  // 96 Bright Cyan
                    'text-white font-bold'      // 97 Bright White
                ];
                currentColorClass = brightColors[code - 90] || '';
            } else if (code >= 40 && code <= 47) {
                const backgrounds = [
                    'bg-slate-950', // 40
                    'bg-rose-950/40', // 41
                    'bg-emerald-950/40', // 42
                    'bg-amber-950/40', // 43
                    'bg-sky-950/40', // 44
                    'bg-fuchsia-950/40', // 45
                    'bg-cyan-950/40', // 46
                    'bg-slate-800' // 47
                ];
                currentBgClass = backgrounds[code - 40] || '';
            } else if (code === 39) {
                currentColorClass = '';
            } else if (code === 49) {
                currentBgClass = '';
            }
        }
    };

    while ((match = ansiRegex.exec(text)) !== null) {
        const textSegment = text.substring(lastIndex, match.index);
        if (textSegment) {
            segments.push({
                text: textSegment,
                bold: isBold,
                underline: isUnderline,
                colorClass: currentColorClass,
                bgClass: currentBgClass
            });
        }
        const rawCode = match[0].substring(2, match[0].length - 1);
        getStylesFromCodes(rawCode);
        lastIndex = ansiRegex.lastIndex;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
        segments.push({
            text: remainingText,
            bold: isBold,
            underline: isUnderline,
            colorClass: currentColorClass,
            bgClass: currentBgClass
        });
    }

    return segments;
}

function AnsiText({ text, searchQuery }: { text: string; searchQuery: string }) {
    const segments = useMemo(() => parseAnsiText(text), [text]);

    if (!searchQuery) {
        return (
            <span className="break-all whitespace-pre-wrap">
                {segments.map((seg, idx) => (
                    <span
                        key={idx}
                        className={clsx(
                            seg.bold && 'font-bold',
                            seg.underline && 'underline',
                            seg.colorClass,
                            seg.bgClass
                        )}
                    >
                        {seg.text}
                    </span>
                ))}
            </span>
        );
    }

    return (
        <span className="break-all whitespace-pre-wrap">
            {segments.map((seg, idx) => {
                const classes = clsx(
                    seg.bold && 'font-bold',
                    seg.underline && 'underline',
                    seg.colorClass,
                    seg.bgClass
                );

                if (seg.text.toLowerCase().includes(searchQuery.toLowerCase())) {
                    const queryRegex = new RegExp(`(${searchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
                    const parts = seg.text.split(queryRegex);

                    return (
                        <span key={idx} className={classes}>
                            {parts.map((part, pIdx) =>
                                part.toLowerCase() === searchQuery.toLowerCase() ? (
                                    <mark key={pIdx} className="bg-yellow-500/35 text-yellow-200 px-0.5 rounded font-bold">
                                        {part}
                                    </mark>
                                ) : (
                                    part
                                )
                            )}
                        </span>
                    );
                }

                return (
                    <span key={idx} className={classes}>
                        {seg.text}
                    </span>
                );
            })}
        </span>
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
                'flex gap-2.5 rounded px-2.5 py-1 font-mono text-xs leading-5 transition-colors duration-150',
                isError ? 'bg-rose-500/10 border-l-2 border-rose-500/70 text-rose-200' :
                isWarn ? 'bg-amber-500/5 border-l-2 border-amber-500/50 text-amber-200' :
                isSuccess ? 'text-emerald-300' : 'text-slate-400',
                'hover:bg-white/[0.03]'
            )}
        >
            <span className="shrink-0 text-slate-600 select-none">{formatDate(log.createdAt || log.timestamp)}</span>
            {isError && <AlertCircle size={12} className="text-rose-400 shrink-0 mt-1" />}
            {isWarn && !isError && <AlertCircle size={12} className="text-amber-400 shrink-0 mt-1" />}
            <span className="break-all flex-1">
                <AnsiText text={text} searchQuery={searchQuery} />
            </span>
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
    const [logFilter, setLogFilter] = useState<'all' | 'build' | 'runtime' | 'system' | 'error'>('all');
    const [logsSearchQuery, setLogsSearchQuery] = useState('');
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
        } catch (e) { }
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
        } catch (e) { }
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
        if (logFilter === 'build') {
            list = list.filter((l) => l.type === 'build');
        } else if (logFilter === 'runtime') {
            list = list.filter((l) => l.type === 'runtime');
        } else if (logFilter === 'system') {
            list = list.filter((l) => l.type === 'system');
        } else if (logFilter === 'error') {
            list = list.filter((l) => l.level === 'error' || l.type === 'error' || /failed|error|exception/i.test(l.message || l.output || ''));
        }

        if (logsSearchQuery.trim()) {
            const q = logsSearchQuery.toLowerCase();
            list = list.filter((l) => {
                const text = (l.message || l.output || '').toLowerCase();
                return text.includes(q);
            });
        }
        return list;
    }, [logs, logFilter, logsSearchQuery]);

    const handleCopyLogs = () => {
        const text = filteredLogs
            .map((l) => `[${formatDate(l.createdAt || l.timestamp)}] ${l.message || l.output || ''}`)
            .join('\n');
        navigator.clipboard.writeText(text);
        useToastStore.getState().addToast({
            title: 'Copied',
            description: `Successfully copied ${filteredLogs.length} log lines to clipboard.`,
            severity: 'success',
        });
    };

    const handleDownloadLogs = () => {
        const text = filteredLogs
            .map((l) => `[${formatDate(l.createdAt || l.timestamp)}] [${(l.level || 'info').toUpperCase()}] [${l.type || 'runtime'}] ${l.message || l.output || ''}`)
            .join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `deployment-${id}-${logFilter}-logs.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        useToastStore.getState().addToast({
            title: 'Downloaded',
            description: `Started downloading logs for deployment ${id}.`,
            severity: 'success',
        });
    };

    const handleReconnectWs = () => {
        setLogsPaused(true);
        setTimeout(() => {
            setLogsPaused(false);
            useToastStore.getState().addToast({
                title: 'Logs Reconnected',
                description: 'Attempting to re-establish WebSocket log stream.',
                severity: 'success',
            });
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
    }, [filteredLogs, autoScroll]);

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
                        <Panel className="flex flex-col gap-0 p-0 overflow-hidden border border-white/[0.08]">
                            {/* Header */}
                            <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2.5">
                                    <TerminalSquare size={18} className="text-cyan-300" />
                                    <h2 className="font-black text-white text-sm tracking-wide">Deployment Logs</h2>
                                    <span className={clsx(
                                        'flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border',
                                        stream.isConnected 
                                            ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' 
                                            : 'border-amber-500/20 bg-amber-500/5 text-amber-400'
                                    )}>
                                        <span className={clsx('h-1.5 w-1.5 rounded-full', stream.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
                                        {stream.isConnected ? 'Live' : 'Polling'}
                                    </span>
                                    {!stream.isConnected && (
                                        <button 
                                            onClick={handleReconnectWs} 
                                            className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 underline underline-offset-2 ml-1"
                                            title="Retry live log WebSocket stream connection"
                                        >
                                            <RefreshCw size={10} className="animate-spin-slow" /> Reconnect
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2.5">
                                    {/* Search Input */}
                                    <div className="relative w-full sm:w-48">
                                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="text"
                                            value={logsSearchQuery}
                                            onChange={(e) => setLogsSearchQuery(e.target.value)}
                                            placeholder="Search in logs..."
                                            className="h-8 w-full rounded-md border border-white/10 bg-slate-950/60 pl-8 pr-6 text-xs text-white outline-none placeholder:text-slate-600 transition-all focus:border-cyan-500/40 focus:bg-slate-950"
                                        />
                                        {logsSearchQuery && (
                                            <button 
                                                onClick={() => setLogsSearchQuery('')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-white"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>

                                    {/* Collapse Button */}
                                    <button
                                        onClick={() => setConsoleCollapsed(!consoleCollapsed)}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-slate-400 transition-colors hover:border-white/15 hover:text-white"
                                        title={consoleCollapsed ? "Expand Terminal" : "Collapse Terminal"}
                                    >
                                        {consoleCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                                    </button>
                                </div>
                            </div>

                            {/* Toolbar */}
                            <div className="flex flex-col gap-3 border-b border-white/[0.08] bg-white/[0.02] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                                {/* Filters */}
                                <div className="flex flex-wrap gap-1.5">
                                    {(['all', 'build', 'runtime', 'system', 'error'] as const).map((filter) => {
                                        const count = logs.filter(l => {
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
                                                    'rounded-md px-2.5 py-1 text-xs font-black uppercase transition-all',
                                                    logFilter === filter
                                                        ? 'bg-cyan-500/15 border border-cyan-500/25 text-cyan-300'
                                                        : 'border border-white/5 bg-transparent text-slate-500 hover:border-white/10 hover:text-slate-300'
                                                )}
                                            >
                                                {filter} <span className="ml-1 text-[10px] opacity-70">({count})</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="secondary"
                                        className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                                        onClick={handleCopyLogs}
                                        disabled={!filteredLogs.length}
                                    >
                                        <Copy size={13} /> Copy
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="h-8 px-2.5 text-xs flex items-center gap-1.5"
                                        onClick={handleDownloadLogs}
                                        disabled={!filteredLogs.length}
                                    >
                                        <Download size={13} /> Download
                                    </Button>
                                    <div className="h-4 w-[1px] bg-white/[0.08]" />
                                    <Button
                                        variant="secondary"
                                        className={clsx('h-8 text-xs px-2.5 flex items-center gap-1.5', logsPaused && 'border-amber-500/20 bg-amber-500/5 text-amber-300')}
                                        onClick={() => setLogsPaused(v => !v)}
                                    >
                                        {logsPaused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className={clsx('h-8 text-xs px-2.5', autoScroll && 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300')}
                                        onClick={() => setAutoScroll(v => !v)}
                                    >
                                        {autoScroll ? 'Auto ↓' : 'Manual Scroll'}
                                    </Button>
                                </div>
                            </div>

                            {/* Terminal Logs Area */}
                            <div 
                                className={clsx(
                                    'transition-all duration-300 ease-in-out bg-slate-950/80 overflow-hidden',
                                    consoleCollapsed ? 'h-0' : 'h-[500px]'
                                )}
                            >
                                <div ref={consoleRef} className="terminal-scrollbar h-full overflow-auto p-4 space-y-1">
                                    {filteredLogs.length ? (
                                        filteredLogs.map((log) => (
                                            <LogLine key={log.id} log={log} searchQuery={logsSearchQuery} />
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-500 font-mono text-xs gap-1 py-12">
                                            <p>No log entries found.</p>
                                            {logsSearchQuery && <p className="text-[10px] opacity-75">Try modifying your search query or switching filters.</p>}
                                        </div>
                                    )}
                                </div>
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
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-black text-white">Environment</h3>
                                        {!envLoading && decEnvResponse?.files && decEnvResponse.files.length > 0 && (
                                            <span className="rounded-full bg-cyan-500/15 border border-cyan-500/25 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                                                {decEnvResponse.files.reduce((s, f) => s + Object.keys(f.variables || {}).length, 0)} vars
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setEnvModalOpen(true)}
                                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-cyan-300 transition-colors"
                                    >
                                        Manage
                                    </button>
                                </div>
                                {envLoading ? (
                                    <div className="space-y-2 py-2">
                                        <SkeletonBlock className="h-4 w-full" />
                                        <SkeletonBlock className="h-4 w-3/4" />
                                    </div>
                                ) : decEnvResponse?.files && decEnvResponse.files.length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap gap-1.5">
                                            {decEnvResponse.files.map((f) => (
                                                <span key={f.path} className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-slate-400">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/60 shrink-0" />
                                                    {f.path}
                                                    <span className="ml-1 rounded-full bg-slate-800 px-1.5 text-[9px] text-slate-500">{Object.keys(f.variables || {}).length}</span>
                                                </span>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-slate-600">Last updated {formatDate(current.updatedAt)}</p>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-white/[0.08] py-6 text-center">
                                        <p className="text-xs text-slate-600">No environment variables configured.</p>
                                        <button onClick={() => setEnvModalOpen(true)} className="mt-2 text-[11px] text-cyan-500 hover:text-cyan-400 transition-colors">Add variables</button>
                                    </div>
                                )}
                            </Panel>
                        </div>
                    </div>
                </>
            ) : null}

            {/* Manage Environment Variables Modal */}
            {envModalOpen ? (
                <AppModal title="Manage Environment Variables" open={envModalOpen} onClose={() => setEnvModalOpen(false)} size="xl">
                    <div className="mt-4 flex flex-col md:flex-row gap-6 h-[600px] max-h-[85vh]">
                        {/* Sidebar: Files List */}
                        <div className="hidden md:flex w-full md:w-64 shrink-0 flex-col gap-4 border-b md:border-b-0 md:border-r border-white/[0.08] pb-4 md:pb-0 md:pr-4">
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
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-950 hover:bg-cyan-50 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/40 text-xs font-black shrink-0"
                                                        onClick={() => handleRenameFile(idx)}
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-100 hover:border-white/20 hover:bg-white/[0.11] transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/40 text-xs font-black shrink-0"
                                                        onClick={() => { setRenamingIndex(null); setRenamingPath(''); }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="truncate font-mono">{file.path}</span>
                                                    <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
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
                                    <div className="flex flex-col gap-3 border-b border-white/[0.05] pb-3">
                                        {/* Mobile file selector */}
                                        <div className="flex md:hidden flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={activeFileIndex}
                                                    onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                                                    className={clsx(inputClassName, 'flex-1 font-mono text-xs h-9 bg-slate-950 border-white/10')}
                                                >
                                                    {draftFiles.map((file, idx) => (
                                                        <option key={file.path} value={idx}>
                                                            {file.path} ({Object.keys(file.variables || {}).length} vars)
                                                        </option>
                                                    ))}
                                                </select>
                                                <Button
                                                    variant="secondary"
                                                    className="h-9 px-3 text-xs shrink-0"
                                                    onClick={() => setShowAddFile(!showAddFile)}
                                                >
                                                    <Plus size={14} /> Add File
                                                </Button>
                                            </div>
                                            {showAddFile && (
                                                <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                                                    <p className="text-[10px] font-bold text-cyan-300">File path (relative to repo root)</p>
                                                    <input
                                                        value={newFilePath}
                                                        onChange={(e) => setNewFilePath(e.target.value)}
                                                        placeholder="apps/server/.env"
                                                        className={clsx(inputClassName, 'h-8 text-xs')}
                                                    />
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => { setShowAddFile(false); setNewFilePath(''); }}>Cancel</Button>
                                                        <Button variant="primary" className="h-7 px-2 text-xs" onClick={handleAddFile}>Create</Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Active File Info and Actions */}
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        {renamingIndex === activeFileIndex ? (
                                                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    value={renamingPath}
                                                                    onChange={(e) => setRenamingPath(e.target.value)}
                                                                    className={clsx(inputClassName, 'h-7 py-0 px-2 text-xs w-40 sm:w-48 font-mono')}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-950 hover:bg-cyan-50 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/40 text-xs font-black shrink-0"
                                                                    onClick={() => handleRenameFile(activeFileIndex)}
                                                                >
                                                                    ✓
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-100 hover:border-white/20 hover:bg-white/[0.11] transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/40 text-xs font-black shrink-0"
                                                                    onClick={() => { setRenamingIndex(null); setRenamingPath(''); }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <h4 className="text-sm font-bold text-white font-mono truncate max-w-[150px] sm:max-w-[280px]" title={activeFile.path}>
                                                                    {activeFile.path}
                                                                </h4>
                                                                {activeFile.path !== '.env' && (
                                                                    <div className="flex items-center gap-0.5 shrink-0">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setRenamingIndex(activeFileIndex);
                                                                                setRenamingPath(activeFile.path);
                                                                            }}
                                                                            className="p-1 text-slate-400 hover:text-white transition-colors"
                                                                            title="Rename file"
                                                                        >
                                                                            <Edit2 size={13} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleDeleteFile(activeFileIndex);
                                                                            }}
                                                                            className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                                                                            title="Delete file"
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">
                                                        {Object.keys(activeFile.variables || {}).length} variables
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {/* History Toggle Button for Mobile */}
                                                <Button
                                                    variant="secondary"
                                                    className="md:hidden h-8 px-2.5 text-xs"
                                                    onClick={() => setHistoryOpen(true)}
                                                >
                                                    <History size={13} /> History
                                                </Button>

                                                <Button
                                                    variant="secondary"
                                                    className="h-8 px-2.5 sm:px-3 text-xs"
                                                    onClick={() => setIsBulkEdit(!isBulkEdit)}
                                                >
                                                    {isBulkEdit ? 'Table Editor' : 'Bulk Edit / Text'}
                                                </Button>
                                            </div>
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
                                            <div className="flex-1 overflow-y-auto border border-white/[0.06] rounded-lg divide-y divide-white/[0.05] bg-white/[0.01] pr-1 terminal-scrollbar max-h-[300px]">
                                                {filteredVariables.length === 0 ? (
                                                    <div className="py-12 text-center text-xs text-slate-500 italic">
                                                        {searchQuery ? 'No matching variables found.' : 'No environment variables configured.'}
                                                    </div>
                                                ) : (
                                                    filteredVariables.map(([key, val]) => {
                                                        const isKeyValid = validateKey(key);
                                                        return (
                                                            <div
                                                                key={key}
                                                                className={clsx(
                                                                    "grid grid-cols-1 sm:grid-cols-[1.5fr_2fr_auto] gap-2.5 sm:gap-3 p-3 items-start sm:items-center transition-colors hover:bg-white/[0.02]",
                                                                    !isKeyValid && "bg-rose-500/[0.02]"
                                                                )}
                                                            >
                                                                {/* Key Input */}
                                                                <div className="w-full space-y-1">
                                                                    <span className="block sm:hidden text-[9px] font-black uppercase tracking-wider text-slate-500">Key</span>
                                                                    <input
                                                                        defaultValue={key}
                                                                        onBlur={(e) => handleUpdateVarKey(key, e.target.value)}
                                                                        placeholder="VARIABLE_KEY"
                                                                        className={clsx(
                                                                            inputClassName,
                                                                            'font-mono text-xs h-8 focus:ring-1 focus:ring-cyan-300/30',
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
                                                                <div className="w-full space-y-1">
                                                                    <span className="block sm:hidden text-[9px] font-black uppercase tracking-wider text-slate-500">Value</span>
                                                                    <PasswordInput
                                                                        value={val}
                                                                        onChange={(e) => handleUpdateVarValue(key, e.target.value)}
                                                                        placeholder="variable_value"
                                                                        className={clsx(inputClassName, 'font-mono text-xs h-8 pr-12 focus:ring-1 focus:ring-cyan-300/30')}
                                                                    />
                                                                </div>

                                                                {/* Actions */}
                                                                <div className="flex items-center gap-1.5 shrink-0 sm:pt-0 pt-1 justify-end ml-auto sm:ml-0">
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-100 transition-all hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 shrink-0"
                                                                        onClick={() => handleDeleteVar(key)}
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
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
