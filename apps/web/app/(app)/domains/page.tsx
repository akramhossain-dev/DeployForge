'use client';

import {
    AlertTriangle,
    Check,
    CheckCircle2,
    ChevronRight,
    Copy,
    ExternalLink,
    Globe,
    Lock,
    PlusCircle,
    RefreshCw,
    Search,
    Shield,
    ShieldCheck,
    Trash2,
    Wifi,
    WifiOff,
    X,
    Zap,
    Loader2
} from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { formatDate } from '@/components/ui';
import {
    useAttachDomain,
    useDeployments,
    useDomains,
    useIssueSSL,
    useRemoveDomain,
    useToggleAutoHttps,
    useVerifyDns,
} from '@/hooks/useDeployForgeData';
import type { Domain } from '@/lib/api/types';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function AddDomainModal({
    open,
    onClose,
    deployments,
}: {
    open: boolean;
    onClose: () => void;
    deployments: { id: string; name?: string | null; vps?: { ipAddress?: string } | null }[];
}) {
    const attach = useAttachDomain();
    const [deploymentId, setDeploymentId] = useState('');
    const [domainName, setDomainName] = useState('');

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!deploymentId || !domainName.trim()) return;
        attach.mutate(
            { deploymentId, domainName: domainName.trim() },
            {
                onSuccess: () => {
                    setDeploymentId('');
                    setDomainName('');
                    onClose();
                },
            }
        );
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
            <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                    <h3 className="text-sm font-bold text-white">Attach Custom Domain</h3>
                    <button onClick={onClose} className="text-[#666666] hover:text-white">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                            Target Deployment
                        </label>
                        <select
                            value={deploymentId}
                            onChange={(e) => setDeploymentId(e.target.value)}
                            className={INPUT_STYLE}
                            required
                        >
                            <option value="">Select running deployment...</option>
                            {deployments.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name || d.id.slice(0, 8)}
                                    {d.vps?.ipAddress ? ` — (${d.vps.ipAddress})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                            Domain Name / Subdomain
                        </label>
                        <input
                            type="text"
                            value={domainName}
                            onChange={(e) => setDomainName(e.target.value)}
                            placeholder="app.example.com"
                            className={INPUT_STYLE}
                            required
                        />
                        <p className="mt-1 text-[11px] text-[#666666]">
                            Enter full domain name pointing to the target VPS IP via A/CNAME record.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-[#1F1F1F] pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={attach.isPending || !deploymentId || !domainName.trim()}
                            className="flex h-8 items-center gap-1 rounded border border-[#1F1F1F] bg-white px-4 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {attach.isPending ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
                            <span>Attach Domain</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function DomainCard({ domain }: { domain: Domain & { deployment?: any } }) {
    const remove = useRemoveDomain();
    const issueSSL = useIssueSSL();
    const toggleHttps = useToggleAutoHttps();
    const [expanded, setExpanded] = useState(false);
    const [copiedA, setCopiedA] = useState(false);
    const [copiedCname, setCopiedCname] = useState(false);
    const [autoHttpsEnabled, setAutoHttpsEnabled] = useState(domain.autoHttps ?? false);

    const vpsIp = domain.deployment?.vps?.ipAddress;
    const dnsQuery = useVerifyDns(domain.domainName, vpsIp, expanded && !!vpsIp);

    const isDeleted = domain.status === 'DELETED';
    const sslIssued = domain.sslStatus === 'ISSUED';

    function copyToClipboard(text: string, type: 'a' | 'cname') {
        navigator.clipboard.writeText(text);
        if (type === 'a') {
            setCopiedA(true);
            setTimeout(() => setCopiedA(false), 2000);
        } else {
            setCopiedCname(true);
            setTimeout(() => setCopiedCname(false), 2000);
        }
    }

    return (
        <div className={clsx('rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4 font-mono text-xs transition-colors hover:border-[#333333]', isDeleted && 'opacity-50')}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#1F1F1F] pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <Globe size={15} className={sslIssued ? 'text-emerald-400 shrink-0' : 'text-[#666666] shrink-0'} />
                    <div className="min-w-0">
                        <a
                            href={`https://${domain.domainName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-white text-sm hover:underline inline-flex items-center gap-1.5 truncate group"
                        >
                            <span className="truncate">{domain.domainName}</span>
                            <ExternalLink size={12} className="text-[#666666] group-hover:text-white shrink-0" />
                        </a>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#666666]">
                            <span>Traefik Gateway Ingress</span>
                            <span>•</span>
                            <span>Port :443</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={clsx(
                        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] uppercase font-bold',
                        sslIssued ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-400' : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]'
                    )}>
                        {sslIssued ? <ShieldCheck size={11} /> : <Lock size={11} />}
                        {sslIssued ? 'TLS Active' : 'No TLS'}
                    </span>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="h-7 w-7 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white transition-colors"
                        title={expanded ? 'Collapse details' : 'Expand details'}
                    >
                        <ChevronRight size={13} className={clsx('transition-transform', expanded && 'rotate-90')} />
                    </button>
                </div>
            </div>

            {/* Target & Created Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-[#A1A1A1] border-b border-[#1F1F1F] pb-3">
                <div>
                    <span className="text-[10px] text-[#666666] block uppercase">Deployment</span>
                    <span className="text-white truncate block font-semibold">
                        {domain.deployment?.name || domain.deploymentId.slice(0, 8)}
                    </span>
                </div>
                <div>
                    <span className="text-[10px] text-[#666666] block uppercase">Target Node</span>
                    <span className="text-white truncate block">
                        {vpsIp ? `${domain.deployment?.vps?.name || 'VPS'} (${vpsIp})` : 'Node unassigned'}
                    </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-[#666666] block uppercase">Bound Date</span>
                    <span className="text-[#A1A1A1]">{formatDate(domain.createdAt)}</span>
                </div>
            </div>

            {/* Expanded details */}
            {expanded && !isDeleted && (
                <div className="space-y-4 pt-1">
                    {/* DNS Setup Guide */}
                    {vpsIp && (
                        <div className="rounded-md border border-[#1F1F1F] bg-[#000000] p-3 space-y-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                                DNS Configuration Records
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-2 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] text-[#666666] block">A RECORD</span>
                                        <code className="text-white font-mono text-[11px]">{domain.domainName} &rarr; {vpsIp}</code>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(vpsIp, 'a')}
                                        className="h-6 w-6 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white"
                                        title="Copy IP"
                                    >
                                        {copiedA ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                    </button>
                                </div>
                                <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-2 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] text-[#666666] block">CNAME (OPTIONAL)</span>
                                        <code className="text-white font-mono text-[11px]">{domain.domainName} &rarr; {vpsIp}.sslip.io</code>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(`${vpsIp}.sslip.io`, 'cname')}
                                        className="h-6 w-6 flex items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white"
                                        title="Copy CNAME"
                                    >
                                        {copiedCname ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Live DNS Propagation Verification */}
                    {vpsIp && (
                        <div className="rounded-md border border-[#1F1F1F] bg-[#050505] p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase text-[#666666]">
                                    Live DNS Propagation Status
                                </span>
                                <button
                                    onClick={() => dnsQuery.refetch()}
                                    disabled={dnsQuery.isFetching}
                                    className="flex items-center gap-1 text-[10px] text-[#A1A1A1] hover:text-white disabled:opacity-50"
                                >
                                    <RefreshCw size={10} className={dnsQuery.isFetching ? 'animate-spin' : ''} />
                                    <span>Re-check DNS</span>
                                </button>
                            </div>

                            {dnsQuery.isLoading ? (
                                <div className="flex items-center gap-2 text-[11px] text-[#666666] py-1">
                                    <Loader2 size={12} className="animate-spin text-[#A1A1A1]" />
                                    <span>Querying edge DNS resolvers...</span>
                                </div>
                            ) : dnsQuery.data?.propagated ? (
                                <div className="flex items-center gap-2 rounded border border-emerald-900/40 bg-emerald-950/20 p-2 text-[11px] text-emerald-300">
                                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                                    <span>
                                        DNS verified: domain points to <strong>{dnsQuery.data.resolvedIps?.join(', ')}</strong> matching server IP ({vpsIp}).
                                    </span>
                                </div>
                            ) : dnsQuery.data ? (
                                <div className="flex items-center gap-2 rounded border border-amber-900/40 bg-amber-950/20 p-2 text-[11px] text-amber-300">
                                    <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                                    <span>
                                        DNS pending propagation: resolves to {dnsQuery.data.resolvedIps?.length ? <strong>{dnsQuery.data.resolvedIps.join(', ')}</strong> : 'none'} (expected: <strong>{vpsIp}</strong>).
                                    </span>
                                </div>
                            ) : (
                                <div className="text-[11px] text-[#666666]">
                                    Click Re-check DNS to verify whether your domain records have propagated.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Traefik ACME Automated SSL Note */}
                    <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-2.5 text-[11px] text-[#A1A1A1] flex items-center gap-2">
                        <ShieldCheck size={14} className="text-cyan-400 shrink-0" />
                        <span>
                            Traefik Ingress automatically detects HTTP TLS challenges and manages Let&apos;s Encrypt certificate issuance and renewal on port 443.
                        </span>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F1F1F] pt-3">
                        <div className="flex flex-wrap gap-2">
                            {!sslIssued && (
                                <button
                                    onClick={() => issueSSL.mutate(domain.id)}
                                    disabled={issueSSL.isPending}
                                    className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                                >
                                    {issueSSL.isPending ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                                    <span>Trigger ACME SSL Issue</span>
                                </button>
                            )}
                            {sslIssued && (
                                <button
                                    onClick={() => {
                                        const next = !autoHttpsEnabled;
                                        toggleHttps.mutate(
                                            { domainId: domain.id, enabled: next },
                                            { onSuccess: () => setAutoHttpsEnabled(next) }
                                        );
                                    }}
                                    disabled={toggleHttps.isPending}
                                    className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                                >
                                    <Zap size={12} className="text-amber-400" />
                                    <span>{autoHttpsEnabled ? 'Disable Auto-HTTPS' : 'Enable Auto-HTTPS'}</span>
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => remove.mutate(domain.id)}
                            disabled={remove.isPending}
                            className="flex h-7 items-center gap-1 rounded border border-rose-900/40 bg-rose-950/20 px-2.5 text-xs text-rose-300 hover:bg-rose-900/30 disabled:opacity-50"
                        >
                            <Trash2 size={12} />
                            <span>Detach Domain</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DomainsPage() {
    const domains = useDomains();
    const deployments = useDeployments();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [addOpen, setAddOpen] = useState(false);

    const runningDeployments = useMemo(
        () => (deployments.data || []).filter((d) => ['RUNNING', 'PAUSED'].includes(d.status)),
        [deployments.data]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (domains.data || []).filter((d) => {
            const hay = [d.domainName, d.status, d.sslStatus].filter(Boolean).join(' ').toLowerCase();
            const matchSearch = !q || hay.includes(q);
            const matchStatus = statusFilter === 'all' || d.status.toLowerCase() === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [domains.data, search, statusFilter]);

    const activeDomains = (domains.data || []).filter((d) => d.status !== 'DELETED');
    const activeCount = activeDomains.filter((d) => d.status === 'ACTIVE').length;
    const sslCount = activeDomains.filter((d) => d.sslStatus === 'ISSUED').length;

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Domain Manager
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Attach custom domains, monitor DNS propagation, issue Let&apos;s Encrypt SSL certificates, and enable Auto-HTTPS.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => domains.refetch()}
                        disabled={domains.isFetching}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white transition-colors hover:bg-[#1A1A1A]"
                    >
                        <RefreshCw size={13} className={domains.isFetching ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                    <button
                        onClick={() => setAddOpen(true)}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-white px-3 font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                    >
                        <PlusCircle size={13} />
                        <span>Add Domain</span>
                    </button>
                </div>
            </div>

            {/* Error state */}
            {domains.isError && (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                    Failed to load domains: {(domains.error as Error)?.message}
                </div>
            )}

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                    <p className="text-[10px] uppercase text-[#666666]">TOTAL DOMAINS</p>
                    <p className="text-2xl font-bold text-white">{activeDomains.length}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                    <p className="text-[10px] uppercase text-[#666666]">ACTIVE DOMAINS</p>
                    <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
                </div>
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-1">
                    <p className="text-[10px] uppercase text-[#666666]">SSL SECURED</p>
                    <p className="text-2xl font-bold text-cyan-400">{sslCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search custom domains..."
                    className={clsx(INPUT_STYLE, 'flex-1')}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={clsx(INPUT_STYLE, 'sm:w-44')}
                >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Domain list */}
            {domains.isLoading ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-32 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                    ))}
                </div>
            ) : filtered.length ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filtered.map((domain) => (
                        <DomainCard
                            key={domain.id}
                            domain={domain}
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center text-[#666666]">
                    <Globe size={24} className="mx-auto mb-2 text-[#666666]" />
                    <p className="text-white font-semibold">No Custom Domains Attached</p>
                    <p className="mt-1 text-xs">Attach a custom domain or subdomain to your running application deployments.</p>
                    <button
                        onClick={() => setAddOpen(true)}
                        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-4 font-semibold text-black hover:bg-[#E5E5E5]"
                    >
                        <PlusCircle size={13} />
                        <span>Add First Domain</span>
                    </button>
                </div>
            )}

            {/* Add Domain Modal */}
            <AddDomainModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                deployments={runningDeployments}
            />
        </div>
    );
}
