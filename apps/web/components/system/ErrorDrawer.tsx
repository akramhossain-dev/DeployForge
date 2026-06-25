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
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            {}
            <div className="absolute inset-0" onClick={closeErrorDrawer} />

            {}
            <div className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950 p-6 shadow-2xl animate-slide-left overflow-y-auto">
                {}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2.5">
                        <AlertOctagon className="text-rose-400" size={22} />
                        <div>
                            <h2 className="text-lg font-black text-white leading-none">Diagnostic Details</h2>
                            <p className="mt-1 text-xs text-slate-500 font-mono">ID: {deploymentId.slice(0, 8)}... | Code: {code}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={closeErrorDrawer}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-300 hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {}
                <div className="flex-1 space-y-6 py-6">
                    {}
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-black uppercase text-slate-500">Category:</span>
                        <StatusBadge status={category} />
                        <span className="ml-auto rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-400 font-mono ring-1 ring-slate-700">
                            {code}
                        </span>
                    </div>

                    {}
                    <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-4">
                        <p className="text-xs font-black uppercase text-rose-300 tracking-wider">What happened</p>
                        <p className="mt-2 text-sm leading-6 font-semibold text-rose-100 whitespace-pre-line">{explanation}</p>
                    </div>

                    {}
                    <div>
                        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Suggested Fixes</h3>
                        <ul className="mt-3 space-y-2.5">
                            {suggestions.map((suggestion, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                                    <CheckCircle className="mt-0.5 shrink-0 text-emerald-400" size={16} />
                                    <span>{suggestion}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-400 tracking-wider">
                                <Terminal size={14} className="text-cyan-400" />
                                Raw Execution Logs / Trace
                            </h3>
                            <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(rawError)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                <Copy size={12} /> Copy Raw
                            </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-3.5 font-mono text-xs text-slate-300 leading-normal whitespace-pre-wrap terminal-scrollbar">
                            {rawError || 'No technical traceback recorded.'}
                        </div>
                    </div>

                    {}
                    <div className="grid grid-cols-2 gap-4 rounded-lg border border-white/10 bg-slate-900/40 p-4 text-xs font-mono">
                        <div>
                            <p className="text-slate-500 uppercase font-black">Deployment ID</p>
                            <p className="mt-1 text-slate-200 truncate select-all" title={deploymentId}>{deploymentId}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 uppercase font-black">Timestamp</p>
                            <p className="mt-1 text-slate-200">{new Date(timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {}
                <div className="border-t border-white/10 pt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={handleCopyError}
                        className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-slate-950 transition-all hover:bg-cyan-50"
                    >
                        <Copy size={16} />
                        {copied ? 'Copied Details!' : 'Copy Error Details'}
                    </button>
                    <button
                        type="button"
                        onClick={closeErrorDrawer}
                        className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-slate-100 backdrop-blur-md hover:border-white/20 hover:bg-white/[0.11] transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
