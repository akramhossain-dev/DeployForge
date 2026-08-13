'use client';

import clsx from 'clsx';
import { INPUT_STYLE } from '@/components/ui';

export function isValidDomainInput(input: string): boolean {
    if (!input || input.trim().length === 0) return false;
    const clean = input.trim().toLowerCase();
    if (clean.includes('://') || clean.includes('/') || clean.includes(' ') || clean.includes(':')) return false;
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i.test(clean);
}

export function HostingConfiguration({
    hostType,
    setHostType,
    domainName,
    setDomainName,
    ipPreview,
    error,
}: {
    hostType: 'ip' | 'domain';
    setHostType: (value: 'ip' | 'domain') => void;
    domainName: string;
    setDomainName: (value: string) => void;
    ipPreview: string;
    error?: string;
}) {
    const domainInvalid = hostType === 'domain' && domainName.trim().length > 0 && !isValidDomainInput(domainName);

    return (
        <div className="space-y-3 border-t border-[#1F1F1F] pt-4 font-mono text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Hosting & Domain Routing</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label
                    className={clsx(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        hostType === 'ip' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <span className="flex items-center gap-2 font-semibold text-white">
                        <input
                            type="radio"
                            checked={hostType === 'ip'}
                            onChange={() => setHostType('ip')}
                            className="accent-white"
                        />
                        Use IP Direct Hosting
                    </span>
                    <span className="mt-1 block text-[11px] text-[#A1A1A1]">{ipPreview}</span>
                </label>
                <label
                    className={clsx(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        hostType === 'domain' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <span className="flex items-center gap-2 font-semibold text-white">
                        <input
                            type="radio"
                            checked={hostType === 'domain'}
                            onChange={() => setHostType('domain')}
                            className="accent-white"
                        />
                        Use Custom Domain
                    </span>
                    <input
                        value={domainName}
                        onChange={(e) => setDomainName(e.target.value.trim().toLowerCase())}
                        disabled={hostType !== 'domain'}
                        placeholder="app.example.com"
                        className={clsx(INPUT_STYLE, 'mt-2', error && 'border-rose-500')}
                    />
                    {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
                    {!error && domainInvalid && (
                        <p className="mt-1 text-xs text-rose-400">Enter a valid domain without http://, spaces, or paths.</p>
                    )}
                </label>
            </div>
        </div>
    );
}
