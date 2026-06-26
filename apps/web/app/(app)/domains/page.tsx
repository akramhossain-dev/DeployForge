'use client';

import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
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
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    Button,
    EmptyState,
    ErrorState,
    PageHeader,
    Panel,
    SkeletonBlock,
    StatusBadge,
    formatDate,
    inputClassName,
    AppModal,
} from '@/components/ui';
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

// ─── Add Domain Modal ────────────────────────────────────────────────────────

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

    return (
        <AppModal title="Add Domain" open={open} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                        Deployment
                    </label>
                    <select
                        id="domain-deployment-select"
                        value={deploymentId}
                        onChange={(e) => setDeploymentId(e.target.value)}
                        className={inputClassName}
                        required
                    >
                        <option value="">Select a running deployment…</option>
                        {deployments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name || d.id.slice(0, 8)}
                                {d.vps?.ipAddress ? ` — ${d.vps.ipAddress}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                        Domain / Subdomain
                    </label>
                    <input
                        id="domain-name-input"
                        type="text"
                        value={domainName}
                        onChange={(e) => setDomainName(e.target.value)}
                        placeholder="e.g. app.example.com or sub.example.com"
                        className={inputClassName}
                        required
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                        Enter the exact domain or subdomain pointing to your VPS IP.
                    </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={attach.isPending} disabled={!deploymentId || !domainName.trim()}>
                        <Globe size={15} /> Attach Domain
                    </Button>
                </div>
            </form>
        </AppModal>
    );
}

// ─── DNS Status Panel ────────────────────────────────────────────────────────

function DnsStatusPanel({ domain, vpsIp }: { domain: Domain; vpsIp?: string }) {
    const verify = useVerifyDns(domain.domainName, vpsIp, !!vpsIp);

    if (!vpsIp) {
        return (
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <WifiOff size={13} /> No VPS IP available
            </div>
        );
    }

    if (verify.isLoading) {
        return <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />;
    }

    const data = verify.data;
    if (!data) return null;

    return (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
                <span className="font-black text-slate-400 uppercase tracking-wide">DNS Status</span>
                <button
                    id={`dns-refresh-${domain.id}`}
                    onClick={() => verify.refetch()}
                    className="flex items-center gap-1 text-slate-500 hover:text-cyan-300 transition-colors"
                >
                    <RefreshCw size={11} className={verify.isFetching ? 'animate-spin' : ''} /> Check
                </button>
            </div>
            <div className="space-y-1.5">
                <Row
                    label="Propagated"
                    value={
                        data.propagated ? (
                            <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle2 size={12} /> Yes
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-rose-400">
                                <WifiOff size={12} /> No
                            </span>
                        )
                    }
                />
                <Row label="Expected IP" value={<span className="font-mono">{data.expectedIp}</span>} />
                {data.resolvedIps.length > 0 && (
                    <Row
                        label="Resolved IPs"
                        value={<span className="font-mono">{data.resolvedIps.join(', ')}</span>}
                    />
                )}
                {data.cname && (
                    <Row label="CNAME" value={<span className="font-mono">{data.cname}</span>} />
                )}
                <Row
                    label="Checked"
                    value={<span>{new Date(data.checkedAt).toLocaleTimeString()}</span>}
                />
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-200">{value}</span>
        </div>
    );
}

// ─── Domain Card ─────────────────────────────────────────────────────────────

function DomainCard({ domain, vpsIp }: { domain: Domain & { deployment?: any }; vpsIp?: string }) {
    const remove = useRemoveDomain();
    const issueSSL = useIssueSSL();
    const toggleHttps = useToggleAutoHttps();
    const [expanded, setExpanded] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const isDeleted = domain.status === 'DELETED';
    const sslIssued = domain.sslStatus === 'ISSUED';
    const sslFailed = domain.sslStatus === 'FAILED';
    const isSubdomain = domain.domainName.split('.').length > 2;

    return (
        <Panel className={`transition-all ${isDeleted ? 'opacity-50' : ''}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                            isDeleted
                                ? 'border-slate-700 bg-slate-800 text-slate-500'
                                : sslIssued
                                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                                : 'border-cyan-300/15 bg-cyan-300/10 text-cyan-300'
                        }`}
                    >
                        {sslIssued ? <ShieldCheck size={17} /> : <Globe size={17} />}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-white truncate">{domain.domainName}</p>
                            {isSubdomain && (
                                <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-violet-300 ring-1 ring-violet-400/20">
                                    Subdomain
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                            Deployment: {domain.deployment?.name || domain.deploymentId.slice(0, 8)}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={domain.status} />
                    {!isDeleted && (
                        <button
                            id={`domain-expand-${domain.id}`}
                            onClick={() => setExpanded((v) => !v)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
                        >
                            <ChevronRight size={15} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Badges row */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <SslBadge status={domain.sslStatus} />
                {domain.domainName && (
                    <a
                        href={`http${sslIssued ? 's' : ''}://${domain.domainName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-1 text-[11px] font-black text-cyan-300 hover:bg-cyan-300/10 transition-colors"
                    >
                        <Wifi size={11} /> Visit
                    </a>
                )}
                <span className="ml-auto text-xs text-slate-500">{formatDate(domain.createdAt)}</span>
            </div>

            {/* Expanded panel */}
            {expanded && !isDeleted && (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                    {/* DNS Status */}
                    <DnsStatusPanel domain={domain} vpsIp={vpsIp} />

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {/* SSL Issue */}
                        {!sslIssued && (
                            <Button
                                id={`ssl-issue-${domain.id}`}
                                variant="secondary"
                                onClick={() => issueSSL.mutate(domain.id)}
                                loading={issueSSL.isPending}
                            >
                                <Lock size={14} /> Issue SSL
                            </Button>
                        )}

                        {/* Auto-HTTPS toggle */}
                        {sslIssued && (
                            <Button
                                id={`auto-https-${domain.id}`}
                                variant="secondary"
                                onClick={() =>
                                    toggleHttps.mutate({ domainId: domain.id, enabled: true })
                                }
                                loading={toggleHttps.isPending}
                            >
                                <Zap size={14} /> Enable Auto-HTTPS
                            </Button>
                        )}

                        {/* Delete */}
                        {confirmDelete ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-rose-300">Are you sure?</span>
                                <Button
                                    id={`domain-delete-confirm-${domain.id}`}
                                    variant="danger"
                                    onClick={() => {
                                        remove.mutate(domain.id);
                                        setConfirmDelete(false);
                                    }}
                                    loading={remove.isPending}
                                >
                                    Yes, remove
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setConfirmDelete(false)}
                                >
                                    <X size={14} />
                                </Button>
                            </div>
                        ) : (
                            <Button
                                id={`domain-delete-${domain.id}`}
                                variant="secondary"
                                className="border-rose-400/20 text-rose-300 hover:border-rose-300/30 hover:bg-rose-500/10"
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 size={14} /> Remove
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </Panel>
    );
}

function SslBadge({ status }: { status?: string }) {
    const s = (status || 'NONE').toUpperCase();
    const map: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
        ISSUED: { label: 'SSL Active', className: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20', Icon: ShieldCheck },
        FAILED: { label: 'SSL Failed', className: 'bg-rose-400/10 text-rose-300 ring-rose-400/20', Icon: AlertTriangle },
        EXPIRED: { label: 'SSL Expired', className: 'bg-amber-400/10 text-amber-300 ring-amber-400/20', Icon: AlertTriangle },
        NONE: { label: 'No SSL', className: 'bg-slate-700/40 text-slate-400 ring-slate-600', Icon: Shield },
    };
    const { label, className, Icon } = map[s] || map['NONE'];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${className}`}>
            <Icon size={11} /> {label}
        </span>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DomainsPage() {
    const domains = useDomains();
    const deployments = useDeployments();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [addOpen, setAddOpen] = useState(false);

    const runningDeployments = useMemo(
        () =>
            (deployments.data || []).filter((d) =>
                ['RUNNING', 'PAUSED'].includes(d.status)
            ),
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

    // Build a map: deploymentId -> vpsIp for DNS checks
    const vpsIpMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const dep of deployments.data || []) {
            if (dep.vps?.ipAddress) map[dep.id] = dep.vps.ipAddress;
        }
        return map;
    }, [deployments.data]);

    const activeCount = (domains.data || []).filter((d) => d.status === 'ACTIVE').length;
    const sslCount = (domains.data || []).filter((d) => d.sslStatus === 'ISSUED').length;
    const failedCount = (domains.data || []).filter((d) => d.status === 'FAILED' || d.sslStatus === 'FAILED').length;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Domain Manager"
                description="Add custom domains and subdomains, manage SSL certificates, monitor DNS propagation, and enable Auto-HTTPS redirects."
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => domains.refetch()} loading={domains.isFetching}>
                            <RefreshCw size={15} /> Refresh
                        </Button>
                        <Button id="add-domain-btn" onClick={() => setAddOpen(true)}>
                            <PlusCircle size={15} /> Add Domain
                        </Button>
                    </div>
                }
            />

            {domains.isError ? (
                <ErrorState message={(domains.error as Error)?.message} onRetry={() => domains.refetch()} />
            ) : null}

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard title="Total Domains" value={domains.data?.length || 0} icon={<Globe size={18} />} />
                <MetricCard title="Active" value={activeCount} icon={<CheckCircle2 size={18} />} accent="emerald" />
                <MetricCard title="Issues" value={failedCount} icon={<AlertTriangle size={18} />} accent={failedCount > 0 ? 'rose' : undefined} />
            </div>

            {/* SSL Summary banner */}
            {domains.data && domains.data.length > 0 && (
                <Panel>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
                                <ShieldCheck size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-black text-white">SSL Coverage</p>
                                <p className="text-xs text-slate-400">
                                    {sslCount} of {domains.data.length} domain{domains.data.length !== 1 ? 's' : ''} secured
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className="h-full rounded-full bg-emerald-400 transition-all"
                                    style={{ width: `${domains.data.length ? (sslCount / domains.data.length) * 100 : 0}%` }}
                                />
                            </div>
                            <span className="text-xs font-black text-slate-300">
                                {domains.data.length ? Math.round((sslCount / domains.data.length) * 100) : 0}%
                            </span>
                        </div>
                    </div>
                </Panel>
            )}

            {/* Filters */}
            <Panel>
                <div className="flex flex-col gap-3 md:flex-row">
                    <label className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                        <input
                            id="domain-search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search domains…"
                            className={`${inputClassName} pl-10`}
                        />
                    </label>
                    <select
                        id="domain-status-filter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className={`${inputClassName} md:max-w-44`}
                    >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="deleted">Deleted</option>
                    </select>
                </div>
            </Panel>

            {/* Domain list */}
            {domains.isLoading ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonBlock key={i} className="h-40" />
                    ))}
                </div>
            ) : filtered.length ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filtered.map((domain) => (
                        <DomainCard
                            key={domain.id}
                            domain={domain}
                            vpsIp={vpsIpMap[domain.deploymentId]}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    title="No domains found"
                    description="Attach a custom domain or subdomain to a running deployment to get started. You can also issue SSL certificates and enable Auto-HTTPS."
                    action={
                        <Button id="add-domain-empty" onClick={() => setAddOpen(true)}>
                            <PlusCircle size={15} /> Add First Domain
                        </Button>
                    }
                />
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

function MetricCard({
    title,
    value,
    icon,
    accent,
}: {
    title: string;
    value: number;
    icon: React.ReactNode;
    accent?: 'emerald' | 'rose';
}) {
    const valueColor =
        accent === 'emerald'
            ? 'text-emerald-300'
            : accent === 'rose'
            ? 'text-rose-300'
            : 'text-white';

    return (
        <Panel>
            <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
                <span className="text-slate-600">{icon}</span>
            </div>
            <p className={`mt-3 text-3xl font-black ${valueColor}`}>{value}</p>
        </Panel>
    );
}
