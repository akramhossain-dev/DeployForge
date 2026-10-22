'use client';

import { INPUT_STYLE } from '@/components/ui';

export type ResourceTier = 'STATIC' | 'SERVER' | 'FULLSTACK';

export function ResourcePolicyFields({
    resourceTier,
    setResourceTier,
    composeService,
    setComposeService,
    composePort,
    setComposePort,
    disabled,
}: {
    resourceTier: ResourceTier | '';
    setResourceTier: (value: ResourceTier | '') => void;
    composeService: string;
    setComposeService: (value: string) => void;
    composePort: string;
    setComposePort: (value: string) => void;
    disabled?: boolean;
}) {
    return (
        <div className="space-y-3 rounded-md border border-[#1F1F1F] bg-[#111111] p-4 font-mono text-xs">
            <div>
                <p className="font-semibold text-white">Resource & Compose Policy</p>
                <p className="mt-1 text-[11px] text-[#A1A1A1]">Leave tier on automatic unless the workload type is already known. Compose deployments require Full-stack.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Resource Tier</span>
                    <select value={resourceTier} onChange={(event) => setResourceTier(event.target.value as ResourceTier | '')} className={INPUT_STYLE} disabled={disabled}>
                        <option value="">Automatic (recommended)</option>
                        <option value="STATIC">Static — 0.25 CPU / 256 MiB</option>
                        <option value="SERVER">Server — 1 CPU / 1 GiB</option>
                        <option value="FULLSTACK">Full-stack — 2 CPU / 2 GiB</option>
                    </select>
                </label>
                <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Compose Ingress Service</span>
                    <input value={composeService} onChange={(event) => setComposeService(event.target.value)} placeholder="Optional, e.g. web" className={INPUT_STYLE} disabled={disabled} />
                </label>
                <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Compose Ingress Port</span>
                    <input type="number" min={1} max={65535} value={composePort} onChange={(event) => setComposePort(event.target.value)} placeholder="Optional, e.g. 3000" className={INPUT_STYLE} disabled={disabled} />
                </label>
            </div>
        </div>
    );
}
