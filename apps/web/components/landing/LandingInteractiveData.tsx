'use client';

import Link from 'next/link';
import { ArrowRight, GitCommit, Rocket, Server, Lock, KeyRound, Github } from 'lucide-react';
import { useAuthSession, useDeployments, usePublicStats, useVpsList } from '@/hooks/useDeployForgeData';
import { SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';

export function LandingHeroButtons() {
    const auth = useAuthSession();
    const primaryHref = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Open Console' : 'Get Started';

    return (
        <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
                href={primaryHref}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
            >
                <span>{primaryLabel}</span>
                <ArrowRight size={14} />
            </Link>

            <Link
                href="/docs"
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-5 text-xs font-medium text-white transition-colors hover:bg-[#111111]"
            >
                <span>Documentation</span>
            </Link>

            {!auth.isAuthenticated && (
                <Link
                    href="/login"
                    className="flex h-10 items-center justify-center rounded-md px-4 text-xs font-medium text-[#A1A1A1] transition-colors hover:text-white"
                >
                    <span>Sign In</span>
                </Link>
            )}
        </div>
    );
}

export function LandingConsolePreview() {
    const auth = useAuthSession();
    const stats = usePublicStats();
    const deployments = useDeployments(auth.isAuthenticated);
    const vps = useVpsList(auth.isAuthenticated);
    const latestDeployments = deployments.data?.slice(0, 3) || [];
    const activeVpsCount = vps.data?.filter((s) => s.status.toLowerCase() === 'active').length || 0;

    return (
        <div className="grid gap-6 p-6 lg:grid-cols-3">
            {/* Pipeline status column */}
            <div className="space-y-4 lg:col-span-2">
                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                    <div className="flex items-center gap-2">
                        <Rocket size={14} className="text-white" />
                        <span className="text-xs font-mono font-semibold text-white">Active Deployment Pipeline</span>
                    </div>
                    <span className="text-xs font-mono text-[#666666]">Target: Ubuntu 22.04 LTS</span>
                </div>

                <div className="space-y-2">
                    {auth.isAuthenticated && deployments.isLoading ? (
                        <div className="space-y-2">
                            <SkeletonBlock className="h-12 bg-[#111111]" />
                            <SkeletonBlock className="h-12 bg-[#111111]" />
                        </div>
                    ) : auth.isAuthenticated && latestDeployments.length ? (
                        latestDeployments.map((d) => (
                            <div
                                key={d.id}
                                className="flex items-center justify-between rounded-md border border-[#1F1F1F] bg-[#000000] p-3 text-xs font-mono"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <GitCommit size={14} className="text-[#666666] shrink-0" />
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-white">{d.name || d.project?.name || d.id}</p>
                                        <p className="text-[11px] text-[#666666]">{d.branch || 'main'} • {formatDate(d.updatedAt)}</p>
                                    </div>
                                </div>
                                <StatusBadge status={d.status} />
                            </div>
                        ))
                    ) : (
                        /* Static realistic sample when unauthenticated or empty */
                        <div className="space-y-2">
                            <div className="flex items-center justify-between rounded-md border border-[#1F1F1F] bg-[#000000] p-3 text-xs font-mono">
                                <div className="flex items-center gap-3 min-w-0">
                                    <GitCommit size={14} className="text-emerald-400 shrink-0" />
                                    <div>
                                        <p className="font-semibold text-white">deployforge-api-service</p>
                                        <p className="text-[11px] text-[#666666]">main • commit f83a219 • 2m ago</p>
                                    </div>
                                </div>
                                <span className="rounded bg-[#111111] px-2 py-0.5 text-[11px] text-emerald-400 border border-[#1F1F1F]">
                                    SUCCESS
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-md border border-[#1F1F1F] bg-[#000000] p-3 text-xs font-mono">
                                <div className="flex items-center gap-3 min-w-0">
                                    <GitCommit size={14} className="text-white shrink-0" />
                                    <div>
                                        <p className="font-semibold text-white">deployforge-web-dashboard</p>
                                        <p className="text-[11px] text-[#666666]">main • commit 4b12c90 • 14m ago</p>
                                    </div>
                                </div>
                                <span className="rounded bg-[#111111] px-2 py-0.5 text-[11px] text-emerald-400 border border-[#1F1F1F]">
                                    SUCCESS
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Terminal log output snippet */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#000000] p-3 font-mono text-[11px] leading-relaxed text-[#A1A1A1]">
                    <p className="text-[#666666]">[15:24:02] SSH pool connection verified (root@192.168.1.100:22)</p>
                    <p className="text-[#666666]">[15:24:04] Extracting build context into Docker engine container sandbox...</p>
                    <p className="text-white">[15:24:08] Nginx dynamic configuration updated: SSL cert renewed via Let&apos;s Encrypt</p>
                    <p className="text-emerald-400">[15:24:09] Health check passed (HTTP 200 OK). Traffic switched with 0 downtime.</p>
                </div>
            </div>

            {/* Node status / stats sidebar */}
            <div className="space-y-4 border-t border-[#1F1F1F] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                    <div className="flex items-center gap-2">
                        <Server size={14} className="text-white" />
                        <span className="text-xs font-mono font-semibold text-white">Registered Infrastructure</span>
                    </div>
                </div>

                <div className="space-y-3 font-mono text-xs">
                    <div className="rounded-md border border-[#1F1F1F] bg-[#000000] p-3">
                        <p className="text-[11px] text-[#666666]">CONTROL PLANE METRICS</p>
                        <div className="mt-2 space-y-1.5">
                            <div className="flex justify-between">
                                <span className="text-[#A1A1A1]">Active VPS Nodes</span>
                                <span className="font-semibold text-white">
                                    {auth.isAuthenticated ? activeVpsCount : stats.data?.activeVps || 1}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#A1A1A1]">Total Deployments</span>
                                <span className="font-semibold text-white">{stats.data?.totalDeployments || 12}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#A1A1A1]">Database</span>
                                <span className="font-semibold text-emerald-400">PostgreSQL 16</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-md border border-[#1F1F1F] bg-[#000000] p-3">
                        <p className="text-[11px] text-[#666666]">SECURITY PROTOCOLS</p>
                        <div className="mt-2 space-y-1 text-[11px] text-[#A1A1A1]">
                            <p className="flex items-center gap-1.5">
                                <Lock size={12} className="text-white" /> AES-256-GCM Vault
                            </p>
                            <p className="flex items-center gap-1.5">
                                <KeyRound size={12} className="text-white" /> Argon2id Password Hash
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LandingCtaButtons() {
    const auth = useAuthSession();
    const primaryHref = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Open Console' : 'Get Started';

    return (
        <div className="mt-6 flex flex-wrap gap-3">
            <Link
                href={primaryHref}
                className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-4 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
            >
                <span>{primaryLabel}</span>
                <ArrowRight size={13} />
            </Link>
            <a
                href="https://github.com/akramhossain-dev/DeployForge"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] px-4 text-xs font-medium text-white transition-colors hover:bg-[#1F1F1F]"
            >
                <Github size={13} />
                <span>Star on GitHub</span>
            </a>
        </div>
    );
}
