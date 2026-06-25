'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
    FolderOpen, LayoutGrid, List, Search, Upload, RefreshCw,
    Plus, Trash2, Copy, Scissors, Clipboard, Download, ArrowLeft,
    ArrowUp, X, Loader2, FolderPlus, FilePlus, AlertTriangle,
    FolderArchive, FileArchive,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDirectoryListing, useCreateEntry, useDeleteEntries, useRenameEntry, useCopyEntry, downloadFile, downloadZip, useCompress, useDecompress } from '@/hooks/useFileManager';
import { FileList } from './FileList';
import { Breadcrumb } from './Breadcrumb';
import { ContextMenu } from './ContextMenu';
import { UploadZone } from './UploadZone';
import { PropertiesDialog } from './PropertiesDialog';
import { joinPath, parentPath, basename, validateName, isPreviewable } from './utils';
import type { FileEntry } from '@/lib/api/types';
import type { FMClipboard } from './utils';

type SortKey = 'name' | 'size' | 'modified' | 'type';
type SortDir = 'asc' | 'desc';

interface FileManagerProps {
    vpsId: string;
    vpsName?: string;
}

interface ConfirmState { title: string; message: string; onConfirm: () => void; }
interface RenameState { entry: FileEntry; value: string; }

function sortEntries(entries: FileEntry[], key: SortKey, dir: SortDir): FileEntry[] {
    const dirs = entries.filter((e) => e.type === 'directory');
    const files = entries.filter((e) => e.type !== 'directory');
    const cmp = (a: FileEntry, b: FileEntry): number => {
        let val = 0;
        if (key === 'name') val = a.name.localeCompare(b.name);
        else if (key === 'size') val = (a.size || 0) - (b.size || 0);
        else if (key === 'modified') val = (a.modified || '').localeCompare(b.modified || '');
        else if (key === 'type') val = (a.extension || '').localeCompare(b.extension || '');
        return dir === 'asc' ? val : -val;
    };
    return [...dirs.sort(cmp), ...files.sort(cmp)];
}

export function FileManager({ vpsId, vpsName }: FileManagerProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathParam = searchParams.get('path');

    const [currentPath, setCurrentPath] = useState(pathParam || '~');

    const [view, setView] = useState<'list' | 'grid'>('list');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [clipboard, setClipboard] = useState<FMClipboard | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry?: FileEntry } | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [showProps, setShowProps] = useState<FileEntry | null>(null);
    const [rename, setRename] = useState<RenameState | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [newItemType, setNewItemType] = useState<'file' | 'directory' | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [compressInput, setCompressInput] = useState<{ paths: string[] } | null>(null);
    const [compressName, setCompressName] = useState('');
    const [dragging, setDragging] = useState<string[]>([]);
    const newItemRef = useRef<HTMLInputElement>(null);
    const renameRef = useRef<HTMLInputElement>(null);

    const listing = useDirectoryListing(vpsId, currentPath, !showSearch);
    const createEntry = useCreateEntry(vpsId);
    const deleteEntries = useDeleteEntries(vpsId);
    const renameEntry = useRenameEntry(vpsId);
    const copyEntry = useCopyEntry(vpsId);
    const compress = useCompress(vpsId);
    const decompress = useDecompress(vpsId);

    // Sync currentPath when URL path parameter changes (e.g. back button)
    useEffect(() => {
        if (pathParam && pathParam !== currentPath) {
            setCurrentPath(pathParam);
        }
    }, [pathParam]);

    // Sync currentPath with the resolved absolute path from the server
    useEffect(() => {
        if (listing.data?.path && currentPath !== listing.data.path) {
            setCurrentPath(listing.data.path);
        }
    }, [listing.data?.path, currentPath]);

    const entries = useMemo(() => {
        const raw = listing.data?.entries || [];
        return sortEntries(raw, sortKey, sortDir);
    }, [listing.data, sortKey, sortDir]);

    // Keyboard shortcuts — intentionally uses closure over latest state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (rename || newItemType) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); setSelected(new Set(entries.map((e) => e.path))); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected.size > 0) setClipboard({ paths: Array.from(selected), operation: 'copy' });
            if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selected.size > 0) setClipboard({ paths: Array.from(selected), operation: 'cut' });
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) handlePaste();
            if (e.key === 'Delete' && selected.size > 0) confirmDelete(Array.from(selected));
            if (e.key === 'F2' && selected.size === 1) {
                const entry = entries.find((e) => e.path === Array.from(selected)[0]);
                if (entry) startRename(entry);
            }
            if (e.key === 'Escape') { setSelected(new Set()); setContextMenu(null); }
            if (e.key === 'Backspace' && !e.target) navigateUp();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [entries, selected, clipboard, rename, newItemType]);

    useEffect(() => { setSelected(new Set()); }, [currentPath]);
    useEffect(() => { if (newItemType) setTimeout(() => newItemRef.current?.focus(), 50); }, [newItemType]);
    useEffect(() => { if (rename) setTimeout(() => renameRef.current?.select(), 50); }, [rename]);

    const navigate = (path: string) => {
        setCurrentPath(path);
        setSelected(new Set());
        setShowSearch(false);
        // Update URL query parameters to reflect directory navigation
        router.replace(`/file-manager/${vpsId}?path=${encodeURIComponent(path)}`);
    };
    const navigateUp = () => navigate(parentPath(currentPath));

    const handleOpen = (entry: FileEntry) => {
        if (entry.type === 'directory') { navigate(entry.path); return; }
        if (isPreviewable(entry)) {
            router.push(`/file-manager/${vpsId}/edit?path=${encodeURIComponent(entry.path)}`);
        }
    };

    const handleSelect = useCallback((path: string, multi: boolean, range: boolean) => {
        if (!path) { setSelected(new Set()); return; }
        setSelected((prev) => {
            const next = new Set(prev);
            if (multi) { if (next.has(path)) next.delete(path); else next.add(path); }
            else if (!range) { next.clear(); next.add(path); }
            else { next.add(path); }
            return next;
        });
    }, []);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir('asc'); }
    };

    const confirmDelete = (paths: string[]) => {
        setConfirm({
            title: `Delete ${paths.length > 1 ? `${paths.length} items` : basename(paths[0])}?`,
            message: 'This action cannot be undone.',
            onConfirm: async () => {
                await deleteEntries.mutateAsync(paths);
                setSelected(new Set());
                setConfirm(null);
                listing.refetch();
            },
        });
    };

    const startRename = (entry: FileEntry) => {
        setRename({ entry, value: entry.name });
        setContextMenu(null);
    };

    const submitRename = async () => {
        if (!rename) return;
        const err = validateName(rename.value);
        if (err) return;
        if (rename.value === rename.entry.name) { setRename(null); return; }
        const newPath = joinPath(parentPath(rename.entry.path), rename.value);
        await renameEntry.mutateAsync({ oldPath: rename.entry.path, newPath });
        setRename(null);
        listing.refetch();
    };

    const handlePaste = async () => {
        if (!clipboard) return;
        for (const srcPath of clipboard.paths) {
            const destName = basename(srcPath);
            const dstPath = joinPath(currentPath, destName);
            if (clipboard.operation === 'copy') {
                await copyEntry.mutateAsync({ srcPath, dstPath });
            } else {
                await renameEntry.mutateAsync({ oldPath: srcPath, newPath: dstPath });
            }
        }
        if (clipboard.operation === 'cut') setClipboard(null);
        listing.refetch();
    };

    const handleDrop = async (targetDirPath: string) => {
        if (dragging.length === 0) return;
        for (const srcPath of dragging) {
            const destName = basename(srcPath);
            const dstPath = joinPath(targetDirPath, destName);
            await renameEntry.mutateAsync({ oldPath: srcPath, newPath: dstPath });
        }
        setDragging([]);
        listing.refetch();
    };

    const handleCreateNew = async () => {
        if (!newItemType || !newItemName.trim()) return;
        const err = validateName(newItemName);
        if (err) return;
        const path = joinPath(currentPath, newItemName.trim());
        await createEntry.mutateAsync({ path, type: newItemType });
        setNewItemType(null);
        setNewItemName('');
        listing.refetch();
    };

    const handleCompressSubmit = async () => {
        if (!compressInput || !compressName.trim()) return;
        let archive = compressName.trim();
        if (!archive.endsWith('.zip')) {
            archive += '.zip';
        }
        await compress.mutateAsync({
            parentDir: currentPath,
            paths: compressInput.paths,
            archiveName: archive,
        });
        setCompressInput(null);
        setCompressName('');
        setSelected(new Set());
        listing.refetch();
    };

    const handleDecompress = async (entry: FileEntry) => {
        await decompress.mutateAsync({
            zipFilePath: entry.path,
        });
        listing.refetch();
    };

    const buildContextItems = (entry?: FileEntry) => {
        const forEntry = !!entry;
        const isZip = entry?.name.endsWith('.zip');
        return [
            ...(forEntry ? [
                { label: 'Open', icon: <FolderOpen size={13} />, onClick: () => handleOpen(entry!) },
                { label: 'Rename', icon: null, onClick: () => startRename(entry!), divider: false },
                { label: 'Duplicate', icon: <Copy size={13} />, onClick: async () => { await copyEntry.mutateAsync({ srcPath: entry!.path, dstPath: entry!.path + '_copy' }); listing.refetch(); } },
                { label: 'Copy', icon: <Copy size={13} />, onClick: () => setClipboard({ paths: [entry!.path], operation: 'copy' }) },
                { label: 'Cut', icon: <Scissors size={13} />, onClick: () => setClipboard({ paths: [entry!.path], operation: 'cut' }) },
                { label: 'Download', icon: <Download size={13} />, onClick: () => entry!.type === 'directory' ? downloadZip(vpsId, entry!.path) : downloadFile(vpsId, entry!.path), divider: true },
                ...(isZip ? [
                    { label: 'Extract ZIP', icon: <FolderArchive size={13} />, onClick: () => handleDecompress(entry!), divider: false }
                ] : []),
                {
                    label: 'Compress to ZIP',
                    icon: <FileArchive size={13} />,
                    onClick: () => {
                        const paths = selected.size > 0 && selected.has(entry!.path)
                            ? Array.from(selected)
                            : [entry!.path];
                        setCompressInput({ paths });
                        const baseName = basename(entry!.path);
                        setCompressName(baseName ? `${baseName}.zip` : 'archive.zip');
                    },
                    divider: true
                },
                { label: 'Properties', icon: null, onClick: () => setShowProps(entry!) },
                { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => confirmDelete([entry!.path]), danger: true, divider: true },
            ] : []),
            { label: 'New File', icon: <FilePlus size={13} />, onClick: () => { setNewItemType('file'); setNewItemName(''); }, divider: !forEntry },
            { label: 'New Folder', icon: <FolderPlus size={13} />, onClick: () => { setNewItemType('directory'); setNewItemName(''); } },
            { label: 'Paste', icon: <Clipboard size={13} />, onClick: handlePaste, disabled: !clipboard },
            { label: 'Refresh', icon: <RefreshCw size={13} />, onClick: () => listing.refetch(), divider: true },
        ];
    };

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl">
            {/* ── Toolbar ── */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 bg-slate-900/80 px-3 py-2">
                {/* Nav buttons */}
                <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
                    <button onClick={navigateUp} disabled={currentPath === '/'} title="Up" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed">
                        <ArrowUp size={14} />
                    </button>
                    <button onClick={() => navigate('/')} title="Root" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200">
                        <ArrowLeft size={14} />
                    </button>
                </div>

                {/* Breadcrumb bar */}
                <div className="flex flex-1 min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 font-mono">
                    <Breadcrumb path={currentPath} onNavigate={navigate} />
                </div>

                {/* Action group */}
                <div className="flex items-center gap-1">
                    <button onClick={() => setShowSearch((v) => !v)} title="Search" className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${showSearch ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-300' : 'border-white/10 bg-white/[0.04] text-slate-500 hover:text-slate-200'}`}>
                        <Search size={13} />
                    </button>
                    <button onClick={() => setNewItemType('file')} title="New File" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-500 transition-colors hover:text-cyan-300">
                        <FilePlus size={13} />
                    </button>
                    <button onClick={() => setNewItemType('directory')} title="New Folder" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-500 transition-colors hover:text-cyan-300">
                        <FolderPlus size={13} />
                    </button>
                    <button onClick={() => setShowUpload(true)} className="flex h-7 items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2.5 text-[11px] font-bold text-cyan-300 transition-all hover:bg-cyan-300/15">
                        <Upload size={12} /> Upload
                    </button>
                </div>

                {/* Selection actions */}
                {selected.size > 0 && (
                    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
                        <button onClick={() => setClipboard({ paths: Array.from(selected), operation: 'copy' })} title="Copy" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-cyan-300 transition-colors"><Copy size={13} /></button>
                        <button onClick={() => setClipboard({ paths: Array.from(selected), operation: 'cut' })} title="Cut" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-amber-300 transition-colors"><Scissors size={13} /></button>
                        <button onClick={() => confirmDelete(Array.from(selected))} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:text-rose-400 transition-colors"><Trash2 size={13} /></button>
                        <button onClick={() => {
                            setCompressInput({ paths: Array.from(selected) });
                            setCompressName(selected.size === 1 ? `${basename(Array.from(selected)[0])}.zip` : 'archive.zip');
                        }} title="Compress to ZIP" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-cyan-300 transition-colors">
                            <FileArchive size={13} />
                        </button>
                        <button onClick={() => {
                            Array.from(selected).forEach((path) => {
                                const entry = entries.find(e => e.path === path);
                                if (entry) {
                                    if (entry.type === 'directory') {
                                        downloadZip(vpsId, entry.path);
                                    } else {
                                        downloadFile(vpsId, entry.path);
                                    }
                                }
                            });
                        }} title="Download Selected" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-cyan-300 transition-colors">
                            <Download size={13} />
                        </button>
                    </div>
                )}
                {clipboard && (
                    <button onClick={handlePaste} title={`Paste (${clipboard.operation})`} className="flex h-7 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/15 transition-all">
                        <Clipboard size={12} /> Paste
                    </button>
                )}

                {/* Right side */}
                <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => listing.refetch()} title="Refresh" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-500 hover:text-slate-200 transition-colors">
                        <RefreshCw size={12} className={listing.isFetching ? 'animate-spin text-cyan-300' : ''} />
                    </button>
                    <div className="flex rounded-lg border border-white/10 overflow-hidden">
                        <button onClick={() => setView('list')} title="List" className={`flex h-7 w-7 items-center justify-center transition-colors ${view === 'list' ? 'bg-cyan-300/15 text-cyan-300' : 'bg-white/[0.04] text-slate-600 hover:text-slate-300'}`}><List size={13} /></button>
                        <button onClick={() => setView('grid')} title="Grid" className={`flex h-7 w-7 items-center justify-center transition-colors ${view === 'grid' ? 'bg-cyan-300/15 text-cyan-300' : 'bg-white/[0.04] text-slate-600 hover:text-slate-300'}`}><LayoutGrid size={13} /></button>
                    </div>
                </div>
            </div>

            {/* ── Status bar ── */}
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-slate-950/60 px-4 py-0.5 font-mono text-[10px]">
                <span className="text-slate-700">{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
                {selected.size > 0 && <><span className="text-slate-800">·</span><span className="text-cyan-500/60">{selected.size} selected</span></>}
                {clipboard && <><span className="text-slate-800">·</span><span className="text-amber-500/60">{clipboard.paths.length} in {clipboard.operation}</span></>}
                <div className="flex-1" />
                <span className="truncate text-slate-800 max-w-xs">{currentPath}</span>
                {listing.isFetching && <Loader2 size={9} className="animate-spin text-cyan-500 shrink-0" />}
            </div>

            {/* ── Search bar ── */}
            {showSearch && (
                <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-slate-900/50 px-4 py-2 font-mono">
                    <span className="text-cyan-400/60 text-xs select-none">~$</span>
                    <input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="find . -name &quot;&quot;"
                        className="flex-1 bg-transparent text-xs text-cyan-100 outline-none placeholder:text-slate-700 font-mono"
                    />
                    <span className="text-[10px] text-slate-700 select-none">ESC to close</span>
                    <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-slate-600 hover:text-slate-400 transition-colors"><X size={13} /></button>
                </div>
            )}

            {/* ── New item input ── */}
            {newItemType && (
                <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/20 px-4 py-2 font-mono">
                    <span className="text-cyan-400/60 text-xs select-none">{newItemType === 'directory' ? 'mkdir' : 'touch'}</span>
                    <input
                        ref={newItemRef}
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew(); if (e.key === 'Escape') setNewItemType(null); }}
                        placeholder={`new_${newItemType === 'directory' ? 'folder' : 'file'}…`}
                        className="flex-1 bg-transparent text-xs text-cyan-100 outline-none placeholder:text-slate-700 font-mono"
                    />
                    <button onClick={handleCreateNew} disabled={createEntry.isPending} className="h-6 rounded border border-cyan-400/25 bg-cyan-400/10 px-2.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-400/20 transition-colors">
                        {createEntry.isPending ? <Loader2 size={10} className="animate-spin" /> : '↵ Create'}
                    </button>
                    <button onClick={() => setNewItemType(null)} className="text-slate-600 hover:text-slate-400 transition-colors"><X size={13} /></button>
                </div>
            )}

            {/* ── Compress input ── */}
            {compressInput && (
                <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/20 px-4 py-2 font-mono">
                    <span className="text-cyan-400/60 text-xs select-none">zip -r</span>
                    <input
                        autoFocus
                        value={compressName}
                        onChange={(e) => setCompressName(e.target.value)}
                        onKeyDown={(e) => { 
                            if (e.key === 'Enter') handleCompressSubmit(); 
                            if (e.key === 'Escape') setCompressInput(null); 
                        }}
                        placeholder="archive.zip"
                        className="flex-1 bg-transparent text-xs text-cyan-100 outline-none placeholder:text-slate-700 font-mono"
                    />
                    <button onClick={handleCompressSubmit} disabled={compress.isPending} className="h-6 rounded border border-cyan-400/25 bg-cyan-400/10 px-2.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-400/20 transition-colors">
                        {compress.isPending ? <Loader2 size={10} className="animate-spin" /> : '↵ Zip'}
                    </button>
                    <button onClick={() => setCompressInput(null)} className="text-slate-600 hover:text-slate-400 transition-colors"><X size={13} /></button>
                </div>
            )}

            {/* ── Main content area ── */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* File list panel */}
                {/* File list panel */}
                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto terminal-scrollbar">
                    {listing.isLoading ? (
                        <div className="flex flex-1 items-center justify-center p-12">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 size={20} className="animate-spin text-cyan-400/60" />
                                <span className="font-mono text-[10px] text-slate-700">loading…</span>
                            </div>
                        </div>
                    ) : listing.isError ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10">
                                <AlertTriangle size={22} className="text-rose-400" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-rose-300">Failed to load directory</p>
                                <p className="mt-1 font-mono text-[10px] text-slate-700">SSH connection error or permission denied</p>
                            </div>
                            <button onClick={() => listing.refetch()} className="h-7 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 text-[11px] font-bold text-cyan-400 hover:bg-cyan-400/20 transition-colors">Retry</button>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                <FolderOpen size={22} className="text-slate-600" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-semibold text-slate-500">Empty directory</p>
                                <p className="mt-1 font-mono text-[10px] text-slate-700">{currentPath}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setNewItemType('file')} className="h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[11px] text-slate-500 hover:text-cyan-300 transition-colors">New File</button>
                                <button onClick={() => setShowUpload(true)} className="h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[11px] text-slate-500 hover:text-cyan-300 transition-colors">Upload</button>
                            </div>
                        </div>
                    ) : (
                        <FileList
                            entries={entries}
                            selected={selected}
                            view={view}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            onSelect={handleSelect}
                            onOpen={handleOpen}
                            onContextMenu={(e, entry) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, entry }); }}
                            onDropZoneContext={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
                            dragging={dragging}
                            onDragStart={(entry) => setDragging(selected.size > 0 ? Array.from(selected) : [entry.path])}
                            onDrop={handleDrop}
                            onDownload={(entry) => entry.type === 'directory' ? downloadZip(vpsId, entry.path) : downloadFile(vpsId, entry.path)}
                        />
                    )}

                    {/* Rename dialog */}
                    {rename && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                            <div className="w-80 rounded-xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
                                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Rename</p>
                                <p className="mb-3 truncate font-mono text-[11px] text-slate-600">{rename.entry.path}</p>
                                <input
                                    ref={renameRef}
                                    value={rename.value}
                                    onChange={(e) => setRename({ ...rename, value: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRename(null); }}
                                    className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-300/40"
                                />
                                <div className="mt-3 flex justify-end gap-2">
                                    <button onClick={() => setRename(null)} className="h-8 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-xs font-semibold text-slate-300 hover:text-white transition-colors">Cancel</button>
                                    <button onClick={submitRename} className="h-8 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 text-xs font-bold text-cyan-300 hover:bg-cyan-300/20 transition-colors">Rename</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Context menu ── */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={buildContextItems(contextMenu.entry) as any}
                />
            )}

            {/* ── Upload modal ── */}
            {showUpload && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Upload Files</p>
                                <p className="font-mono text-[10px] text-slate-700">{currentPath}</p>
                            </div>
                            <button onClick={() => setShowUpload(false)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-500 hover:text-white transition-colors"><X size={13} /></button>
                        </div>
                        <UploadZone vpsId={vpsId} currentPath={currentPath} onClose={() => { setShowUpload(false); listing.refetch(); }} />
                    </div>
                </div>
            )}

            {/* ── Properties modal ── */}
            {showProps && (
                <PropertiesDialog
                    vpsId={vpsId}
                    path={showProps.path}
                    name={showProps.name}
                    onClose={() => setShowProps(null)}
                />
            )}

            {/* ── Confirm dialog ── */}
            {confirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-xl border border-rose-400/20 bg-slate-900 p-5 shadow-2xl">
                        <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-500/10">
                                <AlertTriangle size={16} className="text-rose-400" />
                            </div>
                            <p className="text-sm font-bold text-white">{confirm.title}</p>
                        </div>
                        <p className="mb-5 text-xs text-slate-500">{confirm.message}</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setConfirm(null)} className="h-8 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-xs font-semibold text-slate-300 hover:text-white transition-colors">Cancel</button>
                            <button onClick={confirm.onConfirm} disabled={deleteEntries.isPending} className="h-8 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition-colors">
                                {deleteEntries.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
