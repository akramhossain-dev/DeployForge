'use client';

import { AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import type { ParsedError } from '@/lib/utils/errorParser';
import { useToastStore } from '@/lib/store/useToastStore';

export function DeploymentErrorBanner({
    parsedError,
    deploymentId,
    updatedAt,
}: {
    parsedError: ParsedError;
    deploymentId: string;
    updatedAt: string;
}) {
    const addToast = useToastStore((s) => s.addToast);
    const openErrorDrawer = useToastStore((s) => s.openErrorDrawer);

    return (
        <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 space-y-3 font-mono text-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 shrink-0 text-rose-400" size={18} />
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-rose-300 uppercase">{parsedError.category}</span>
                            <span className="rounded bg-rose-950 border border-rose-800/50 px-2 py-0.5 text-[10px] text-rose-300 font-mono">
                                {parsedError.code}
                            </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-white font-sans whitespace-pre-line">
                            {parsedError.explanation}
                        </p>
                        {parsedError.suggestions?.length ? (
                            <ul className="mt-2.5 space-y-1">
                                {parsedError.suggestions.map((s, i) => (
                                    <li key={i} className="flex items-center gap-2 text-xs text-rose-200">
                                        <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                        <span>{s}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </div>
                <div className="flex gap-2 sm:flex-col sm:items-end shrink-0">
                    <button
                        onClick={() => openErrorDrawer({ ...parsedError, timestamp: updatedAt, deploymentId })}
                        className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]"
                    >
                        Details
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(
                                `Deployment: ${deploymentId}\nError: ${parsedError.code}\n${parsedError.explanation}`
                            );
                            addToast({ title: 'Copied Report', description: 'Error report copied to clipboard.', severity: 'success' });
                        }}
                        className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A]"
                    >
                        <Copy size={12} /> Copy
                    </button>
                </div>
            </div>
        </div>
    );
}
