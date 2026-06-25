'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Save, X, WrapText, Search, Loader2, FileCode, AlertTriangle, Eye, ArrowLeft, Server } from 'lucide-react';
import { useFileContent, useSaveFile } from '@/hooks/useFileManager';
import { getLanguage } from './utils';
import type { FileEntry } from '@/lib/api/types';

interface CodeEditorProps {
    vpsId: string;
    vpsName?: string;
    vpsUser?: string;
    vpsIp?: string;
    file: FileEntry;
    onClose: () => void;
}

/** Virtualised line-number gutter — only renders lines in the visible viewport. */
function VirtualLineNumbers({ lineCount, activeLine, lineHeight = 24 }: { lineCount: number; activeLine: number; lineHeight?: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [range, setRange] = useState({ start: 0, end: 80 });

    useEffect(() => {
        const el = containerRef.current?.parentElement;
        if (!el) return;
        const update = () => {
            const scrollTop = el.scrollTop;
            const visible = el.clientHeight;
            const start = Math.max(0, Math.floor(scrollTop / lineHeight) - 5);
            const end = Math.min(lineCount, Math.ceil((scrollTop + visible) / lineHeight) + 5);
            setRange({ start, end });
        };
        el.addEventListener('scroll', update, { passive: true });
        update();
        return () => el.removeEventListener('scroll', update);
    }, [lineCount, lineHeight]);

    const totalHeight = lineCount * lineHeight;

    return (
        <div
            ref={containerRef}
            className="select-none border-r border-white/10 bg-slate-950/60 text-right text-slate-600 shrink-0 font-mono"
            style={{ position: 'relative', height: totalHeight, minWidth: 56 }}
            aria-hidden
        >
            <div style={{ position: 'absolute', top: range.start * lineHeight, width: '100%' }}>
                {Array.from({ length: range.end - range.start }, (_, i) => {
                    const lineNum = range.start + i + 1;
                    const isActive = lineNum === activeLine;
                    return (
                        <div
                            key={lineNum}
                            style={{ height: lineHeight, lineHeight: `${lineHeight}px`, fontSize: 11 }}
                            className={`px-3 transition-colors duration-150 ${
                                isActive ? 'text-cyan-400 bg-cyan-500/5 font-bold border-r border-cyan-500/30' : ''
                            }`}
                        >
                            {lineNum}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function CodeEditor({ vpsId, vpsName, vpsUser, vpsIp, file, onClose }: CodeEditorProps) {
    const { data, isLoading, isError, refetch } = useFileContent(vpsId, file.path, true);
    const saveFile = useSaveFile(vpsId);
    const [content, setContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [wordWrap, setWordWrap] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [activeLine, setActiveLine] = useState(1);
    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (data?.content && data.encoding === 'utf-8') {
            setContent(data.content);
            setIsDirty(false);
        }
    }, [data]);

    // Handle cursor and active line changes
    const updateCursorInfo = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const selStart = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, selStart);
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines.length;
        setActiveLine(currentLine);
        setCursorPos({
            line: currentLine,
            col: lines[lines.length - 1].length + 1
        });
    }, []);

    // Ctrl+S / Ctrl+F shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowSearch((v) => !v); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    const handleSave = async () => {
        if (!isDirty) return;
        await saveFile.mutateAsync({ path: file.path, content });
        setIsDirty(false);
    };

    const handleReplace = () => {
        if (!searchTerm) return;
        setContent((c) => c.split(searchTerm).join(replaceTerm));
        setIsDirty(true);
        setTimeout(updateCursorInfo, 10);
    };

    const lineCount = useMemo(() => content.split('\n').length, [content]);
    const fileSizeLabel = formatBytes(file.size ?? 0);

    // ── Image preview ────────────────────────────────────────────────────────
    if (data?.encoding === 'base64') {
        return (
            <div className="flex flex-col h-full w-full bg-slate-950">
                <EditorHeader
                    file={file}
                    onClose={onClose}
                    isDirty={false}
                    onSave={handleSave}
                    isSaving={false}
                    wordWrap={wordWrap}
                    setWordWrap={setWordWrap}
                    showSearch={showSearch}
                    setShowSearch={setShowSearch}
                    vpsName={vpsName}
                    vpsUser={vpsUser}
                    vpsIp={vpsIp}
                    isReadOnly
                />
                <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950/20 p-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`data:${data.mimeType};base64,${data.content}`} alt={file.name}
                        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl border border-white/10" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-slate-950">
            <EditorHeader
                file={file}
                onClose={onClose}
                isDirty={isDirty}
                onSave={handleSave}
                isSaving={saveFile.isPending}
                wordWrap={wordWrap}
                setWordWrap={setWordWrap}
                showSearch={showSearch}
                setShowSearch={setShowSearch}
                vpsName={vpsName}
                vpsUser={vpsUser}
                vpsIp={vpsIp}
            />

            {/* Find & Replace Bar */}
            {showSearch && (
                <div className="flex items-center gap-3 border-b border-white/10 bg-slate-900/60 px-4 py-2 font-mono">
                    <Search size={13} className="shrink-0 text-cyan-400" />
                    <input
                        autoFocus
                        placeholder="Find…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-48 bg-transparent text-xs text-white outline-none placeholder:text-slate-600 focus:border-b focus:border-cyan-400/30 transition-all pb-0.5"
                    />
                    <div className="h-4 w-px bg-white/10" />
                    <input
                        placeholder="Replace…"
                        value={replaceTerm}
                        onChange={(e) => setReplaceTerm(e.target.value)}
                        className="w-48 bg-transparent text-xs text-white outline-none placeholder:text-slate-600 focus:border-b focus:border-cyan-400/30 transition-all pb-0.5"
                    />
                    <button onClick={handleReplace} className="h-6 rounded border border-cyan-400/25 bg-cyan-400/10 px-2.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-400/20 transition-colors">
                        Replace All
                    </button>
                    <button onClick={() => setShowSearch(false)} className="ml-auto text-slate-500 hover:text-white transition-colors">
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* Editor body */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {/* Loading overlay */}
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/80 backdrop-blur-sm">
                        <Loader2 size={20} className="animate-spin text-cyan-300" />
                        <div className="text-center">
                            <p className="font-mono text-xs text-slate-400">Loading {file.name}</p>
                            <p className="font-mono text-[10px] text-slate-600">{fileSizeLabel} — please wait…</p>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {isError && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
                            <FileCode size={22} className="text-slate-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-slate-300">Cannot preview this file</p>
                            <p className="mt-1 text-xs text-slate-600">Binary files or files over 20 MB cannot be edited in the browser.</p>
                        </div>
                        <button onClick={() => refetch()} className="h-7 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
                            Retry
                        </button>
                    </div>
                )}

                {/* Editor — virtualized line numbers + textarea */}
                {!isError && !isLoading && (
                    <div className="flex flex-1 overflow-auto font-mono text-[12px] terminal-scrollbar">
                        <VirtualLineNumbers lineCount={lineCount} activeLine={activeLine} lineHeight={24} />
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => { setContent(e.target.value); setIsDirty(true); }}
                            onKeyUp={updateCursorInfo}
                            onClick={updateCursorInfo}
                            onSelect={updateCursorInfo}
                            spellCheck={false}
                            className={`flex-1 resize-none bg-transparent px-4 py-0 leading-6 text-slate-300 caret-cyan-400 outline-none ${
                                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                            }`}
                        />
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between border-t border-white/10 bg-slate-950 px-4 py-1.5 text-[10px] text-slate-500 font-mono">
                <div className="flex items-center gap-4">
                    <span className="text-cyan-400 font-bold">{getLanguage(file.name).toUpperCase()}</span>
                    <span>·</span>
                    <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span>{lineCount.toLocaleString()} lines</span>
                    <span>·</span>
                    <span>{fileSizeLabel}</span>
                    {isDirty && (
                        <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-amber-400 font-bold animate-pulse">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                unsaved changes
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EditorHeader({
    file, onClose, isDirty, onSave, isSaving, wordWrap, setWordWrap, showSearch, setShowSearch, vpsName, vpsUser, vpsIp, isReadOnly,
}: {
    file: FileEntry;
    onClose: () => void;
    isDirty: boolean;
    onSave: () => void;
    isSaving: boolean;
    wordWrap: boolean;
    setWordWrap: (v: boolean) => void;
    showSearch: boolean;
    setShowSearch: (v: boolean) => void;
    vpsName?: string;
    vpsUser?: string;
    vpsIp?: string;
    isReadOnly?: boolean;
}) {
    return (
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-4 py-2">
            {/* Left section: navigation + file name + full path */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 hover:text-cyan-300 transition-colors border border-white/10 rounded-md px-2 py-1 bg-white/[0.02]"
                >
                    <ArrowLeft size={10} />
                    back
                </button>
                <div className="h-4 w-px bg-white/10" />
                <FileCode size={14} className="shrink-0 text-cyan-300" />
                <div className="flex flex-col min-w-0">
                    <span className="truncate font-mono text-[11px] font-semibold text-slate-200 leading-tight">
                        {file.name}
                    </span>
                    <span className="truncate font-mono text-[9px] text-slate-500 leading-none" title={file.path}>
                        {file.path}
                    </span>
                </div>
            </div>

            {/* Middle section: VPS details capsule */}
            {vpsName && (
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 border border-cyan-400/10 rounded-md bg-cyan-400/[0.02] font-mono text-[9px] text-cyan-400 shrink-0">
                    <Server size={9} />
                    <span>{vpsName}</span>
                    <span className="text-cyan-600">({vpsUser}@{vpsIp})</span>
                </div>
            )}

            {/* Right section: Editor controls */}
            <div className="flex items-center gap-1.5 ml-4 shrink-0">
                {!isReadOnly && (
                    <>
                        <button
                            onClick={() => setShowSearch(!showSearch)}
                            title="Find & Replace (Ctrl+F)"
                            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                                showSearch ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-300' : 'border-white/10 bg-white/[0.04] text-slate-500 hover:text-white'
                            }`}
                        >
                            <Search size={12} />
                        </button>
                        <button
                            onClick={() => setWordWrap(!wordWrap)}
                            title="Toggle Word Wrap"
                            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                                wordWrap ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-300' : 'border-white/10 bg-white/[0.04] text-slate-500 hover:text-white'
                            }`}
                        >
                            <WrapText size={12} />
                        </button>
                        <button
                            onClick={onSave}
                            disabled={!isDirty || isSaving}
                            title="Save changes (Ctrl+S)"
                            className="flex h-7 items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            Save
                        </button>
                    </>
                )}
                <button
                    onClick={onClose}
                    title="Close editor"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-500 hover:text-white transition-colors"
                >
                    <X size={13} />
                </button>
            </div>
        </div>
    );
}
