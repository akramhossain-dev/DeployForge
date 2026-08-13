'use client';

import { useToastStore } from '@/lib/store/useToastStore';
import { X, CheckCircle, Copy, AlertOctagon, Terminal } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui';

export function ErrorDrawer() {
    const { drawerOpen, activeErrorDetails, closeErrorDrawer } = useToastStore();
    const [copied, setCopied] = useState(false);

    if (!drawerOpen || !activeErrorDetails) return null;

    const { category, code, explanation, suggestions, rawError, timestamp, deploymentId } = activeErrorDetails;

    function handleCopyError() {
        const textToCopy = `
=== DEPLOYFORGE ERROR REPORT ===
Deployment ID: ${deploymentId}
Timestamp: ${timestamp}
Error Code: ${code}
Category: ${category}

[User Explanation]
${explanation}

[Suggested Fixes]
${suggestions.map((s) => `- ${s}`).join('\n')}

[Technical / Raw Error]
${rawError}
================================
`.trim();

        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm">
            {/* Backdrop */}
            <div className="absolute inset-0" onClick={closeErrorDrawer} />

            {/* Drawer */}
            <div className="glass-modal relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[#1F1F1F] p-5 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-4">
                    <div className="flex items-center gap-2.5">
                        <AlertOctagon className="text-rose-400" size={18} />
                        <div>
                            <h2 className="text-sm font-semibold text-white leading-none">Diagnostic Details</h2>
                            <p className="mt-1 text-xs text-[#A1A1A1] font-mono">ID: {deploymentId.slice(0, 8)}... | Code: {code}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={closeErrorDrawer}
                        className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-5 py-5">
                    {/* Category */}
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-mono font-medium text-[#A1A1A1]">Category:</span>
                        <StatusBadge status={category} />
                        <span className="ml-auto rounded bg-[#111111] border border-[#1F1F1F] px-2 py-0.5 text-xs font-mono text-[#A1A1A1]">
                            {code}
                        </span>
                    </div>

                    {/* Explanation */}
                    <div className="rounded-md border border-[#1F1F1F] bg-[#111111] p-3.5">
                        <p className="text-[11px] font-mono font-semibold uppercase text-rose-400 tracking-wider">What happened</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-white font-sans whitespace-pre-line">{explanation}</p>
                    </div>

                    {/* Suggestions */}
                    <div>
                        <h3 className="text-[11px] font-mono font-semibold uppercase text-[#A1A1A1] tracking-wider">Suggested Fixes</h3>
                        <ul className="mt-2.5 space-y-2">
                            {suggestions.map((suggestion, index) => (
                                <li key={index} className="flex items-start gap-2 text-xs text-white">
                                    <CheckCircle className="mt-0.5 shrink-0 text-emerald-400" size={14} />
                                    <span>{suggestion}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Technical traceback */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase text-[#A1A1A1] tracking-wider">
                                <Terminal size={13} className="text-[#A1A1A1]" />
                                Raw Execution Logs / Trace
                            </h3>
                            <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(rawError)}
                                className="flex items-center gap-1 text-[11px] font-mono text-[#A1A1A1] hover:text-white transition-colors"
                            >
                                <Copy size={11} /> Copy Raw
                            </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-md border border-[#1F1F1F] bg-[#000000] p-3 font-mono text-xs text-[#A1A1A1] leading-relaxed whitespace-pre-wrap">
                            {rawError || 'No technical traceback recorded.'}
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3 rounded-md border border-[#1F1F1F] bg-[#111111] p-3 text-xs font-mono">
                        <div>
                            <p className="text-[#666666] uppercase text-[10px] font-semibold">Deployment ID</p>
                            <p className="mt-0.5 text-white truncate select-all" title={deploymentId}>{deploymentId}</p>
                        </div>
                        <div>
                            <p className="text-[#666666] uppercase text-[10px] font-semibold">Timestamp</p>
                            <p className="mt-0.5 text-white">{new Date(timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-[#1F1F1F] pt-4 flex gap-2.5">
                    <button
                        type="button"
                        onClick={handleCopyError}
                        className="flex-1 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-white px-3 text-xs font-mono font-semibold text-black transition-colors hover:bg-slate-200"
                    >
                        <Copy size={14} />
                        {copied ? 'Copied Details!' : 'Copy Error Details'}
                    </button>
                    <button
                        type="button"
                        onClick={closeErrorDrawer}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] px-4 text-xs font-mono font-medium text-white hover:bg-[#1F1F1F] transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
