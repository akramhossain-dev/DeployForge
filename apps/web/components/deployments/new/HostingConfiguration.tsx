'use client';

import clsx from 'clsx';
import { ShieldCheck } from 'lucide-react';
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
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                    Ingress Gateway & Routing (Traefik v3.1)
                </p>
                <span className="text-[10px] text-[#A1A1A1] flex items-center gap-1">
                    <ShieldCheck size={11} className="text-emerald-400" /> Automated TLS on :443
                </span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {/* Auto Subdomain (.sslip.io) */}
                <label
                    className={clsx(
                        'rounded-md border p-3.5 cursor-pointer transition-colors flex flex-col justify-between',
                        hostType === 'ip' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000] hover:border-[#333333]'
                    )}
                >
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 font-semibold text-white">
                                <input
                                    type="radio"
                                    checked={hostType === 'ip'}
                                    onChange={() => setHostType('ip')}
                                    className="accent-white"
                                />
                                Automatic Subdomain
                            </span>
                            <span className="rounded border border-[#1F1F1F] bg-[#0A0A0A] px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                                INSTANT HTTPS
                            </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[#A1A1A1]">
                            Zero-configuration <code className="text-white">.sslip.io</code> domain routed through Traefik Ingress. Zero port exposure, isolated multi-tenant network.
                        </p>
                    </div>

                    <div className="mt-3 rounded border border-[#1F1F1F] bg-[#050505] p-2 text-[11px] text-[#A1A1A1]">
                        <span className="text-[10px] text-[#666666] block uppercase font-semibold">Assigned Ingress URL</span>
                        <span className="text-white truncate block font-mono">
                            {ipPreview.startsWith('http') ? ipPreview : `https://${ipPreview}`}
                        </span>
                    </div>
                </label>

                {/* Custom Domain */}
                <label
                    className={clsx(
                        'rounded-md border p-3.5 cursor-pointer transition-colors flex flex-col justify-between',
                        hostType === 'domain' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000] hover:border-[#333333]'
                    )}
                >
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 font-semibold text-white">
                                <input
                                    type="radio"
                                    checked={hostType === 'domain'}
                                    onChange={() => setHostType('domain')}
                                    className="accent-white"
                                />
                                Custom Domain
                            </span>
                            <span className="rounded border border-[#1F1F1F] bg-[#0A0A0A] px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">
                                LET&apos;S ENCRYPT ACME
                            </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[#A1A1A1]">
                            Bind your own domain or subdomain. Traefik automatically issues and auto-renews SSL certificates.
                        </p>
                    </div>

                    <div className="mt-3">
                        <input
                            value={domainName}
                            onChange={(e) => setDomainName(e.target.value.trim().toLowerCase())}
                            disabled={hostType !== 'domain'}
                            placeholder="app.yourdomain.com"
                            className={clsx(INPUT_STYLE, error && 'border-rose-500')}
                        />
                        {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
                        {!error && domainInvalid && (
                            <p className="mt-1 text-xs text-rose-400">Enter a valid domain without http://, spaces, or paths.</p>
                        )}
                        {!error && !domainInvalid && hostType === 'domain' && (
                            <p className="mt-1 text-[10px] text-[#666666]">
                                Point an <strong className="text-[#A1A1A1]">A Record</strong> to VPS IP or <strong className="text-[#A1A1A1]">CNAME</strong> to <code className="text-[#A1A1A1]">{ipPreview}</code>
                            </p>
                        )}
                    </div>
                </label>
            </div>
        </div>
    );
}
