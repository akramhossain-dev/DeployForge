'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useFileProperties } from '@/hooks/useFileManager';
import { formatSize, formatDate } from './utils';

interface PropertiesDialogProps {
    vpsId: string;
    path: string;
    name: string;
    onClose: () => void;
}

export function PropertiesDialog({ vpsId, path, name, onClose }: PropertiesDialogProps) {
    const { data, isLoading } = useFileProperties(vpsId, path, true);

    const rows: { label: string; value: string }[] = data
        ? [
              { label: 'Name', value: data.name || name },
              { label: 'Absolute Path', value: data.absolutePath || '—' },
              { label: 'Type', value: data.type || '—' },
              { label: 'Extension', value: data.extension || '—' },
              { label: 'Size', value: data.size ? formatSize(parseInt(data.size, 10)) : '—' },
              { label: 'Permissions', value: data.permissions || '—' },
              { label: 'Modified', value: data.modified ? formatDate(data.modified) : '—' },
              { label: 'Accessed', value: data.access ? formatDate(data.access) : '—' },
          ]
        : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-2xl">
                {}
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <h2 className="text-base font-black text-white">Properties</h2>
                    <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white">
                        <X size={15} />
                    </button>
                </div>

                {}
                <div className="p-5">
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.05]" />
                            ))}
                        </div>
                    ) : (
                        <dl className="space-y-2.5">
                            {rows.map(({ label, value }) => (
                                <div key={label} className="flex items-start gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                                    <dt className="w-28 shrink-0 text-xs font-bold text-slate-500">{label}</dt>
                                    <dd className="min-w-0 flex-1 break-all text-xs font-semibold text-slate-200">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                <div className="border-t border-white/10 px-5 py-3 text-right">
                    <button onClick={onClose} className="h-9 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-xs font-bold text-slate-300 hover:text-white">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
