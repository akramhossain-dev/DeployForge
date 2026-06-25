'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, File as FileIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useUploadFile } from '@/hooks/useFileManager';

interface UploadItem {
    file: File;
    status: 'pending' | 'uploading' | 'done' | 'error';
    error?: string;
    progress: number;
}

interface UploadZoneProps {
    vpsId: string;
    currentPath: string;
    onClose: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; 

export function UploadZone({ vpsId, currentPath, onClose }: UploadZoneProps) {
    const [items, setItems] = useState<UploadItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const upload = useUploadFile(vpsId);

    const addFiles = useCallback((files: File[]) => {
        const newItems: UploadItem[] = files.map((file) => ({
            file,
            status: file.size > MAX_FILE_SIZE ? 'error' : 'pending',
            error: file.size > MAX_FILE_SIZE ? 'File exceeds 50MB limit' : undefined,
            progress: 0,
        }));
        setItems((prev) => [...prev, ...newItems]);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        addFiles(files);
    }, [addFiles]);

    const handleUploadAll = async () => {
        const pending = items.filter((i) => i.status === 'pending');
        for (const item of pending) {
            setItems((prev) =>
                prev.map((i) => i.file === item.file ? { ...i, status: 'uploading', progress: 30 } : i)
            );
            try {
                await upload.mutateAsync({ file: item.file, path: currentPath });
                setItems((prev) =>
                    prev.map((i) => i.file === item.file ? { ...i, status: 'done', progress: 100 } : i)
                );
            } catch (err: any) {
                setItems((prev) =>
                    prev.map((i) => i.file === item.file ? { ...i, status: 'error', error: err?.message || 'Upload failed' } : i)
                );
            }
        }
    };

    const removeItem = (file: File) => {
        setItems((prev) => prev.filter((i) => i.file !== file));
    };

    const hasPending = items.some((i) => i.status === 'pending');

    return (
        <div className="flex flex-col gap-4">
            {}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all ${
                    isDragging
                        ? 'border-cyan-300/50 bg-cyan-300/5 scale-[0.99]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
            >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                    isDragging ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-300' : 'border-white/10 bg-white/[0.04] text-slate-500'
                }`}>
                    <Upload size={20} />
                </div>
                <div className="text-center">
                    <p className="text-sm font-semibold text-slate-200">Drop files here or <span className="text-cyan-300">click to browse</span></p>
                    <p className="mt-1 font-mono text-[10px] text-slate-600">Max 50 MB per file · Multiple files supported</p>
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(Array.from(e.target.files || []))}
                />
            </div>

            {}
            {items.length > 0 && (
                <div className="max-h-56 space-y-1.5 overflow-y-auto terminal-scrollbar">
                    {items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
                            {item.status === 'uploading' ? (
                                <Loader2 size={14} className="animate-spin text-cyan-300 shrink-0" />
                            ) : item.status === 'done' ? (
                                <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                            ) : item.status === 'error' ? (
                                <AlertCircle size={14} className="text-rose-400 shrink-0" />
                            ) : (
                                <FileIcon size={14} className="text-slate-500 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-mono text-[11px] font-semibold text-slate-200">{item.file.name}</p>
                                <p className="font-mono text-[9px] text-slate-600">{(item.file.size / 1024).toFixed(1)} KB</p>
                                {item.error && <p className="font-mono text-[9px] text-rose-400">{item.error}</p>}
                                {item.status === 'uploading' && (
                                    <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full animate-pulse rounded-full bg-cyan-300" style={{ width: `${item.progress}%` }} />
                                    </div>
                                )}
                                {item.status === 'done' && (
                                    <div className="mt-1.5 h-0.5 w-full rounded-full bg-emerald-400/40" />
                                )}
                            </div>
                            <button onClick={() => removeItem(item.file)} className="shrink-0 text-slate-600 hover:text-slate-300 transition-colors">
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {}
            <div className="flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="h-8 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                >
                    Close
                </button>
                {hasPending && (
                    <button
                        onClick={handleUploadAll}
                        disabled={upload.isPending}
                        className="h-8 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 text-xs font-bold text-cyan-300 hover:bg-cyan-300/20 transition-colors disabled:opacity-50"
                    >
                        {upload.isPending ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
                        Upload {items.filter((i) => i.status === 'pending').length} file{items.filter((i) => i.status === 'pending').length !== 1 ? 's' : ''}
                    </button>
                )}
            </div>
        </div>
    );
}
