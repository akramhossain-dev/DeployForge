'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import {
    Plus, Edit2, Trash2, Check, X, Search, ArrowUpDown, Copy
} from 'lucide-react';
import type { EnvFile } from '@/hooks/useDeployForgeData';
import { useToastStore } from '@/lib/store/useToastStore';
import { INPUT_STYLE, PasswordInput } from '@/components/ui';

export function EnvironmentVariablesEditor({
    enabled,
    setEnabled,
    files,
    setFiles,
    error
}: {
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    files: EnvFile[];
    setFiles: (files: EnvFile[]) => void;
    error?: string;
}) {
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const [showAddFile, setShowAddFile] = useState(false);
    const [newFilePath, setNewFilePath] = useState('');
    const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
    const [renamingPath, setRenamingPath] = useState('');
    const [isBulkEdit, setIsBulkEdit] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'none' | 'key'>('none');
    const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);

    const activeFile = files[activeFileIndex] || { path: '.env', variables: {} };

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

    const handleAddFile = () => {
        const path = newFilePath.trim();
        if (!validatePath(path)) {
            useToastStore.getState().addToast({
                title: 'Invalid File Path',
                description:
                    'Path must end with a file starting with .env (e.g. apps/server/.env) and contain no traversal.',
                severity: 'error'
            });
            return;
        }
        if (files.some((f) => f.path === path)) {
            useToastStore.getState().addToast({
                title: 'Duplicate File',
                description: 'This environment file already exists.',
                severity: 'warning'
            });
            return;
        }
        const updated = [...files, { path, variables: {} }];
        setFiles(updated);
        setActiveFileIndex(updated.length - 1);
        setNewFilePath('');
        setShowAddFile(false);
    };

    const handleRenameFile = (index: number) => {
        const path = renamingPath.trim();
        if (!validatePath(path)) {
            useToastStore.getState().addToast({
                title: 'Invalid File Path',
                description: 'Path must end with a file starting with .env and contain no traversal.',
                severity: 'error'
            });
            return;
        }
        if (files.some((f, idx) => f.path === path && idx !== index)) {
            useToastStore.getState().addToast({
                title: 'Duplicate File',
                description: 'An environment file with that path already exists.',
                severity: 'warning'
            });
            return;
        }
        const updated = [...files];
        updated[index] = { ...updated[index], path };
        setFiles(updated);
        setRenamingIndex(null);
        setRenamingPath('');
    };

    const handleDeleteFile = (index: number) => {
        if (files[index].path === '.env') return;
        const updated = files.filter((_, idx) => idx !== index);
        setFiles(updated);
        setActiveFileIndex(0);
    };

    const handleUpdateVarKey = (oldKey: string, newKey: string) => {
        if (oldKey === newKey) return;
        const trimmedNewKey = newKey.trim();
        const variables = { ...activeFile.variables };
        const val = variables[oldKey];
        delete variables[oldKey];
        if (trimmedNewKey) {
            variables[trimmedNewKey] = val || '';
        }
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleUpdateVarValue = (key: string, value: string) => {
        const variables = { ...activeFile.variables, [key]: value };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleAddVar = () => {
        let baseKey = 'NEW_VAR';
        let counter = 1;
        let finalKey = baseKey;
        while (finalKey in (activeFile.variables || {})) {
            finalKey = `${baseKey}_${counter}`;
            counter++;
        }
        const variables = { ...activeFile.variables, [finalKey]: '' };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleDuplicateVar = (key: string, value: string) => {
        let baseKey = `${key}_COPY`;
        let counter = 1;
        let finalKey = baseKey;
        while (finalKey in (activeFile.variables || {})) {
            finalKey = `${baseKey}_${counter}`;
            counter++;
        }
        const variables = { ...activeFile.variables, [finalKey]: value };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleDeleteVar = (key: string) => {
        const variables = { ...activeFile.variables };
        delete variables[key];
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleBulkImport = () => {
        const lines = bulkText.split('\n');
        const parsed: Record<string, string> = {};
        for (const line of lines) {
            const index = line.indexOf('=');
            if (index !== -1) {
                const k = line.substring(0, index).trim();
                const v = line.substring(index + 1);
                if (k) parsed[k] = v;
            }
        }

        const keys = Object.keys(parsed);
        const hasConflicts = keys.some((k) => k in (activeFile.variables || {}));
        if (hasConflicts) {
            setShowConfirmOverwrite(true);
            return;
        }

        const variables = { ...activeFile.variables, ...parsed };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
        setIsBulkEdit(false);
    };

    const confirmBulkImport = () => {
        const lines = bulkText.split('\n');
        const parsed: Record<string, string> = {};
        for (const line of lines) {
            const index = line.indexOf('=');
            if (index !== -1) {
                const k = line.substring(0, index).trim();
                const v = line.substring(index + 1);
                if (k) parsed[k] = v;
            }
        }
        const variables = { ...activeFile.variables, ...parsed };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
        setShowConfirmOverwrite(false);
        setIsBulkEdit(false);
    };

    const filteredVariables = Object.entries(activeFile.variables || {})
        .filter(([k]) => k.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'key') return a[0].localeCompare(b[0]);
            return 0;
        });

    const totalVariables = files.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0);

    return (
        <div className="space-y-4 border-t border-[#1F1F1F] pt-4 font-mono text-xs">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                    <span className="block font-semibold text-white">
                        Environment Setup & Variables <span className="text-[#666666]">(Optional)</span>
                    </span>
                    <span className="mt-1 block text-xs text-[#A1A1A1]">
                        Configure multi-file scoped environment variables. All secrets are encrypted in transit and at rest.
                    </span>
                </div>
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-4 w-4 accent-white rounded border-[#1F1F1F]"
                />
            </label>

            {enabled && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#000000] overflow-hidden">
                    <div className="flex flex-col lg:flex-row min-h-[400px]">
                        {/* Sidebar: Files List */}
                        <div className="hidden lg:flex w-64 shrink-0 flex-col gap-3 border-r border-[#1F1F1F] p-4 bg-[#0A0A0A]">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                                    Env Files
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowAddFile(!showAddFile)}
                                    className="flex h-6 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2 text-[11px] text-white hover:bg-[#1F1F1F] transition-colors"
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>

                            {showAddFile && (
                                <div className="space-y-2 rounded border border-[#1F1F1F] bg-[#111111] p-3">
                                    <p className="text-[10px] text-[#A1A1A1]">File path (relative to repo root)</p>
                                    <input
                                        value={newFilePath}
                                        onChange={(e) => setNewFilePath(e.target.value)}
                                        placeholder="apps/server/.env"
                                        className={INPUT_STYLE}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowAddFile(false);
                                                setNewFilePath('');
                                            }}
                                            className="h-6 rounded border border-[#1F1F1F] px-2 text-[11px] text-[#A1A1A1] hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddFile}
                                            className="h-6 rounded border border-[#1F1F1F] bg-white px-2 text-[11px] font-semibold text-black hover:bg-[#E5E5E5]"
                                        >
                                            Create
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px] lg:max-h-none">
                                {files.map((file, idx) => {
                                    const isActive = idx === activeFileIndex;
                                    const isRenaming = renamingIndex === idx;

                                    return (
                                        <div
                                            key={file.path}
                                            onClick={() => !isRenaming && setActiveFileIndex(idx)}
                                            className={clsx(
                                                'group flex items-center justify-between rounded px-3 py-2 text-xs font-mono cursor-pointer border transition-colors',
                                                isActive
                                                    ? 'bg-[#111111] border-white text-white font-semibold'
                                                    : 'bg-[#000000] border-[#1F1F1F] text-[#A1A1A1] hover:text-white'
                                            )}
                                        >
                                            {isRenaming ? (
                                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        value={renamingPath}
                                                        onChange={(e) => setRenamingPath(e.target.value)}
                                                        className={clsx(INPUT_STYLE, 'h-6 py-0 px-1.5 text-xs')}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRenameFile(idx)}
                                                        className="flex h-6 w-6 items-center justify-center rounded bg-white text-black hover:bg-[#E5E5E5]"
                                                    >
                                                        <Check size={11} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRenamingIndex(null);
                                                            setRenamingPath('');
                                                        }}
                                                        className="flex h-6 w-6 items-center justify-center rounded border border-[#1F1F1F] text-[#A1A1A1] hover:text-white"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="truncate">{file.path}</span>
                                                    <div className="flex items-center gap-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRenamingIndex(idx);
                                                                setRenamingPath(file.path);
                                                            }}
                                                            className="p-1 text-[#666666] hover:text-white"
                                                            title="Rename file"
                                                        >
                                                            <Edit2 size={11} />
                                                        </button>
                                                        {file.path !== '.env' && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteFile(idx);
                                                                }}
                                                                className="p-1 text-[#666666] hover:text-rose-400"
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

                            <div className="text-[10px] text-[#666666] border-t border-[#1F1F1F] pt-2">
                                {files.length}/20 files. Total variables: {totalVariables}/200.
                            </div>
                        </div>

                        {/* Editor Panel */}
                        <div className="flex-1 flex flex-col gap-4 p-4">
                            <div className="flex flex-col gap-3 border-b border-[#1F1F1F] pb-3">
                                {/* Mobile file selector */}
                                <div className="flex lg:hidden flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={activeFileIndex}
                                            onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                                            className={clsx(INPUT_STYLE, 'flex-1')}
                                        >
                                            {files.map((file, idx) => (
                                                <option key={file.path} value={idx}>
                                                    {file.path} ({Object.keys(file.variables || {}).length} vars)
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddFile(!showAddFile)}
                                            className="flex h-9 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white"
                                        >
                                            <Plus size={14} /> Add File
                                        </button>
                                    </div>
                                    {showAddFile && (
                                        <div className="space-y-2 rounded border border-[#1F1F1F] bg-[#111111] p-3">
                                            <p className="text-[10px] text-[#A1A1A1]">File path (relative to repo root)</p>
                                            <input
                                                value={newFilePath}
                                                onChange={(e) => setNewFilePath(e.target.value)}
                                                placeholder="apps/server/.env"
                                                className={INPUT_STYLE}
                                            />
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowAddFile(false);
                                                        setNewFilePath('');
                                                    }}
                                                    className="h-6 rounded border border-[#1F1F1F] px-2 text-[11px] text-[#A1A1A1]"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleAddFile}
                                                    className="h-6 rounded border border-[#1F1F1F] bg-white px-2 text-[11px] font-semibold text-black"
                                                >
                                                    Create
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Active File Header */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                {renamingIndex === activeFileIndex ? (
                                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            value={renamingPath}
                                                            onChange={(e) => setRenamingPath(e.target.value)}
                                                            className={clsx(INPUT_STYLE, 'h-7 py-0 px-2 text-xs w-40 sm:w-48')}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRenameFile(activeFileIndex)}
                                                            className="flex h-7 w-7 items-center justify-center rounded bg-white text-black"
                                                        >
                                                            <Check size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setRenamingIndex(null);
                                                                setRenamingPath('');
                                                            }}
                                                            className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] text-[#A1A1A1]"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <h4
                                                            className="text-xs font-bold text-white font-mono truncate max-w-[150px] sm:max-w-[280px]"
                                                            title={activeFile.path}
                                                        >
                                                            {activeFile.path}
                                                        </h4>
                                                        {activeFile.path !== '.env' && (
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setRenamingIndex(activeFileIndex);
                                                                        setRenamingPath(activeFile.path);
                                                                    }}
                                                                    className="p-1 text-[#666666] hover:text-white"
                                                                    title="Rename file"
                                                                >
                                                                    <Edit2 size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteFile(activeFileIndex);
                                                                    }}
                                                                    className="p-1 text-[#666666] hover:text-rose-400"
                                                                    title="Delete file"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-[#666666]">
                                                {Object.keys(activeFile.variables || {}).length} variables configured
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setIsBulkEdit(!isBulkEdit)}
                                        className="h-8 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1F1F1F] transition-colors shrink-0 font-mono"
                                    >
                                        {isBulkEdit ? 'Table Editor' : 'Bulk Edit / Text'}
                                    </button>
                                </div>
                            </div>

                            {isBulkEdit ? (
                                /* Bulk Text Editor */
                                <div className="flex-1 flex flex-col gap-3">
                                    <p className="text-xs text-[#A1A1A1]">
                                        Paste key-value pairs formatted as <code className="text-white">KEY=VALUE</code>, one per line.
                                    </p>
                                    <textarea
                                        value={bulkText}
                                        onChange={(e) => setBulkText(e.target.value)}
                                        className={clsx(
                                            INPUT_STYLE,
                                            'min-h-[220px] flex-1 p-3 leading-relaxed resize-none'
                                        )}
                                        placeholder={`API_KEY=supersecretkey\nPORT=3000\nDATABASE_URL=postgres://user:pass@host:5432/db`}
                                    />
                                    <div className="flex justify-end gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsBulkEdit(false)}
                                            className="h-8 rounded border border-[#1F1F1F] px-3 text-xs text-[#A1A1A1] hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleBulkImport}
                                            className="h-8 rounded border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black hover:bg-[#E5E5E5]"
                                        >
                                            Import & Merge
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Table Editor */
                                <div className="flex-1 flex flex-col gap-3">
                                    {/* Filters & Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="relative flex-1">
                                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" />
                                            <input
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search variable keys..."
                                                className={clsx(INPUT_STYLE, 'pl-8 h-8')}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSortBy((v) => (v === 'none' ? 'key' : 'none'))}
                                            className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-[#A1A1A1] hover:text-white transition-colors shrink-0"
                                            title="Sort A-Z by key"
                                        >
                                            <ArrowUpDown size={13} className={sortBy === 'key' ? 'text-white' : 'text-[#666666]'} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddVar}
                                            className="flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1F1F1F] transition-colors shrink-0 font-mono"
                                        >
                                            <Plus size={13} /> Add Variable
                                        </button>
                                    </div>

                                    {/* Variables List */}
                                    <div className="flex-1 overflow-y-auto border border-[#1F1F1F] rounded divide-y divide-[#1F1F1F] bg-[#000000] max-h-[300px]">
                                        {filteredVariables.length === 0 ? (
                                            <div className="py-12 text-center text-xs text-[#666666] italic">
                                                {searchQuery ? 'No matching variables found.' : 'No environment variables configured.'}
                                            </div>
                                        ) : (
                                            filteredVariables.map(([key, val]) => {
                                                const isKeyValid = validateKey(key);
                                                return (
                                                    <div
                                                        key={key}
                                                        className={clsx(
                                                            'grid grid-cols-1 sm:grid-cols-[1.5fr_2fr_auto] gap-2 p-2.5 items-start sm:items-center hover:bg-[#0A0A0A] transition-colors',
                                                            !isKeyValid && 'bg-rose-950/10'
                                                        )}
                                                    >
                                                        {/* Key Input */}
                                                        <div className="w-full space-y-1">
                                                            <input
                                                                defaultValue={key}
                                                                onBlur={(e) => handleUpdateVarKey(key, e.target.value)}
                                                                placeholder="VARIABLE_KEY"
                                                                className={clsx(
                                                                    INPUT_STYLE,
                                                                    'h-8',
                                                                    !isKeyValid && 'border-rose-500 text-rose-300'
                                                                )}
                                                            />
                                                            {!isKeyValid && (
                                                                <p className="text-[10px] text-rose-400">
                                                                    Key must start with letter/underscore (A-Z, 0-9, _).
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* Value Input */}
                                                        <div className="w-full">
                                                            <PasswordInput
                                                                value={val}
                                                                onChange={(e) => handleUpdateVarValue(key, e.target.value)}
                                                                placeholder="variable_value"
                                                                className={clsx(INPUT_STYLE, 'h-8 pr-8')}
                                                            />
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-1 shrink-0 justify-end">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDuplicateVar(key, val)}
                                                                className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white transition-colors"
                                                                title="Duplicate variable"
                                                            >
                                                                <Copy size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteVar(key)}
                                                                className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-rose-400 transition-colors"
                                                                title="Delete variable"
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
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {/* Overwrite Confirmation Modal Banner */}
            {showConfirmOverwrite && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-xs text-amber-200">
                        Some variables being imported already exist in this file. Merging will overwrite their existing values.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowConfirmOverwrite(false)}
                            className="h-7 rounded border border-[#1F1F1F] px-3 text-xs text-[#A1A1A1] hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmBulkImport}
                            className="h-7 rounded border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black hover:bg-[#E5E5E5]"
                        >
                            Overwrite & Merge
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
