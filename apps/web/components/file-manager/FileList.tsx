'use client';

import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { FileEntry } from '@/lib/api/types';
import { FileIcon } from './FileIcon';
import { formatSize, formatDate } from './utils';

type SortKey = 'name' | 'size' | 'modified' | 'type';
type SortDir = 'asc' | 'desc';

interface FileListProps {
    entries: FileEntry[];
    selected: Set<string>;
    view: 'list' | 'grid';
    sortKey: SortKey;
    sortDir: SortDir;
    onSort: (key: SortKey) => void;
    onSelect: (path: string, multi: boolean, range: boolean) => void;
    onOpen: (entry: FileEntry) => void;
    onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
    onDropZoneContext: (e: React.MouseEvent) => void;
    openFolders?: Set<string>;
    dragging: string[];
    onDragStart: (entry: FileEntry) => void;
    onDrop: (targetPath: string) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <ChevronUp size={11} className="opacity-20" />;
    return dir === 'asc'
        ? <ChevronUp size={11} className="text-cyan-400" />
        : <ChevronDown size={11} className="text-cyan-400" />;
}

export function FileList({
    entries, selected, view, sortKey, sortDir, onSort,
    onSelect, onOpen, onContextMenu, onDropZoneContext,
    dragging, onDragStart, onDrop,
}: FileListProps) {

    const handleClick = (e: React.MouseEvent, entry: FileEntry) => {
        e.stopPropagation();
        onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey);
    };

    if (view === 'grid') {
        return (
            <div
                className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5 p-3"
                onContextMenu={onDropZoneContext}
                onClick={() => onSelect('', false, false)}
            >
                {entries.map((entry) => {
                    const isSelected = selected.has(entry.path);
                    const isDragging = dragging.includes(entry.path);
                    return (
                        <div
                            key={entry.path}
                            draggable
                            onDragStart={() => onDragStart(entry)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => entry.type === 'directory' && onDrop(entry.path)}
                            onClick={(e) => handleClick(e, entry)}
                            onDoubleClick={() => onOpen(entry)}
                            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
                            className={`group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-2.5 text-center transition-all duration-150 select-none ${
                                isDragging ? 'opacity-40' :
                                isSelected
                                    ? 'bg-cyan-500/10 ring-1 ring-cyan-400/40'
                                    : 'hover:bg-white/[0.05]'
                            }`}
                        >
                            <FileIcon entry={entry} size={28} isOpen={false} />
                            <span className="w-full break-words text-[10px] font-medium leading-tight text-slate-400 line-clamp-2 group-hover:text-slate-200 transition-colors">
                                {entry.name}
                            </span>
                            {isSelected && (
                                <div className="absolute top-1.5 right-1.5 h-3.5 w-3.5 rounded-full bg-cyan-400 flex items-center justify-center">
                                    <svg viewBox="0 0 10 8" className="h-2 w-2 fill-slate-950"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    const cols: { key: SortKey; label: string; className: string }[] = [
        { key: 'name', label: 'Name', className: 'flex-1 min-w-0' },
        { key: 'size', label: 'Size', className: 'w-20 text-right hidden sm:block' },
        { key: 'modified', label: 'Modified', className: 'w-36 hidden md:block' },
        { key: 'type', label: 'Kind', className: 'w-20 hidden lg:block' },
    ];

    return (
        <div onContextMenu={onDropZoneContext} onClick={() => onSelect('', false, false)}>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-sm px-4 py-2">
                <div className="w-8 shrink-0" />
                {cols.map((col) => (
                    <button
                        key={col.key}
                        onClick={(e) => { e.stopPropagation(); onSort(col.key); }}
                        className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors hover:text-slate-300 ${col.className}`}
                    >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                    </button>
                ))}
                <div className="w-6 shrink-0" />
            </div>

            {/* Rows */}
            <div className="font-mono">
                {entries.map((entry, idx) => {
                    const isSelected = selected.has(entry.path);
                    const isDragging = dragging.includes(entry.path);
                    const isDir = entry.type === 'directory';

                    return (
                        <div
                            key={entry.path}
                            draggable
                            onDragStart={() => onDragStart(entry)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => isDir && onDrop(entry.path)}
                            onClick={(e) => handleClick(e, entry)}
                            onDoubleClick={() => onOpen(entry)}
                            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
                            className={`group relative flex cursor-pointer items-center gap-3 px-4 py-1.5 text-xs select-none transition-colors ${
                                isDragging ? 'opacity-30' :
                                isSelected
                                    ? 'bg-cyan-500/[0.08] border-l-2 border-cyan-400/60'
                                    : 'border-l-2 border-transparent hover:bg-white/[0.03] hover:border-white/10'
                            }`}
                        >
                            {/* Checkbox */}
                            <div className="w-4 shrink-0 flex items-center">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    onClick={(e) => { e.stopPropagation(); onSelect(entry.path, true, false); }}
                                    className={`h-3.5 w-3.5 rounded border cursor-pointer transition-all ${
                                        isSelected
                                            ? 'border-cyan-400 bg-cyan-400 accent-cyan-400'
                                            : 'border-white/20 bg-transparent opacity-0 group-hover:opacity-100'
                                    }`}
                                />
                            </div>

                            {/* Icon + Name */}
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <FileIcon entry={entry} size={14} />
                                <span className={`truncate text-[12px] transition-colors ${
                                    isSelected
                                        ? 'text-cyan-100 font-semibold'
                                        : isDir
                                            ? 'text-slate-200 font-semibold group-hover:text-white'
                                            : 'text-slate-400 group-hover:text-slate-200'
                                }`}>
                                    {entry.name}
                                </span>
                                {isDir && (
                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-700 group-hover:text-slate-600">
                                        /
                                    </span>
                                )}
                            </div>

                            {/* Size */}
                            <span className="w-20 text-right text-[11px] text-slate-600 hidden sm:block font-mono">
                                {isDir ? '—' : formatSize(entry.size)}
                            </span>

                            {/* Modified */}
                            <span className="w-36 text-[11px] text-slate-600 hidden md:block font-mono">
                                {formatDate(entry.modified)}
                            </span>

                            {/* Kind */}
                            <span className="w-20 text-[10px] uppercase tracking-wider text-slate-700 hidden lg:block">
                                {isDir ? 'DIR' : (entry.extension?.toUpperCase() || 'FILE')}
                            </span>

                            {/* Row number */}
                            <span className="w-6 text-right text-[9px] text-slate-800 select-none font-mono">
                                {String(idx + 1).padStart(2, '0')}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
