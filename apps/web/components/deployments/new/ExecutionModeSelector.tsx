'use client';

import clsx from 'clsx';
import { Rocket, Shield } from 'lucide-react';

type ExecutionMode = 'production' | 'sandbox';

export function ExecutionModeSelector({
    mode,
    setMode,
}: {
    mode: ExecutionMode;
    setMode: (m: ExecutionMode) => void;
}) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#111111] p-4 space-y-3 font-mono text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                Execution Mode
            </p>
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => setMode('production')}
                    className={clsx(
                        'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
                        mode === 'production'
                            ? 'border-white bg-[#000000] text-white'
                            : 'border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white'
                    )}
                >
                    <div className="flex items-center gap-2 font-semibold text-white">
                        <Rocket size={14} />
                        <span>Production Release</span>
                    </div>
                    <p className="text-[11px] text-[#A1A1A1] leading-relaxed">
                        Persistent container release with zero-downtime Traefik Ingress routing, instant .sslip.io / custom domain TLS, and rollback history.
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => setMode('sandbox')}
                    className={clsx(
                        'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors',
                        mode === 'sandbox'
                            ? 'border-amber-400 bg-[#000000] text-white'
                            : 'border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white'
                    )}
                >
                    <div className="flex items-center gap-2 font-semibold text-amber-400">
                        <Shield size={14} />
                        <span>Ephemeral Sandbox Test</span>
                    </div>
                    <p className="text-[11px] text-[#A1A1A1] leading-relaxed">
                        Temporary sandbox container with direct host port access for rapid debugging and dry-run validation.
                    </p>
                </button>
            </div>
        </div>
    );
}
