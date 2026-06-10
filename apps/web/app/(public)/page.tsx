'use client';

import Link from 'next/link';
import {
    Activity,
    ArrowRight,
    Github,
    GitBranch,
    LayoutDashboard,
    LineChart,
    Lock,
    Rocket,
    Server,
    Terminal,
    Users,
    Zap,
} from 'lucide-react';
import { useAuthSession, useDeployments, usePublicStats, useVpsList } from '@/hooks/useDeployForgeData';
import { SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';

const features = [
    {
        title: 'GitHub integration',
        description: 'Connect repositories, sync branches, and keep deployment workflows close to the code your team already ships.',
        icon: Github,
        accent: 'text-cyan-300',
    },
    {
        title: 'VPS deployment',
        description: 'Register your own servers and deploy services without handing infrastructure control to a hosted platform.',
        icon: Server,
        accent: 'text-emerald-300',
    },
    {
        title: 'Auto deploy system',
        description: 'Run repeatable deployment jobs with build logs, status tracking, and rollback-ready history.',
        icon: Zap,
        accent: 'text-amber-300',
    },
    {
        title: 'Terminal access',
        description: 'Reach server sessions from the browser when production needs hands-on attention.',
        icon: Terminal,
        accent: 'text-rose-300',
    },
    {
        title: 'Monitoring system',
        description: 'Watch deployment health, VPS signals, and platform activity from a single operations surface.',
        icon: Activity,
        accent: 'text-indigo-300',
    },
];

const steps = [
    ['Connect GitHub', 'Authorize DeployForge and select the repository you want to ship.'],
    ['Add VPS', 'Attach your server with the right SSH credentials and health checks.'],
    ['Deploy repo', 'Choose branch, framework, and destination, then launch the deployment job.'],
    ['Auto scaling', 'Grow capacity across registered infrastructure as workloads expand.'],
];

export default function HomePage() {
    const auth = useAuthSession();
    const stats = usePublicStats();
    const deployments = useDeployments(auth.isAuthenticated);
    const vps = useVpsList(auth.isAuthenticated);
    const latestDeployments = deployments.data?.slice(0, 3) || [];
    const activeVps = vps.data?.filter((server) => server.status.toLowerCase() === 'active').length;

    const primaryHref = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Open Dashboard' : 'Get Started';
    const secondaryHref = auth.isAuthenticated ? '/dashboard' : '/github/connect';
    const secondaryLabel = auth.isAuthenticated ? 'Dashboard' : 'Connect GitHub';
    const ctaHref = auth.isAuthenticated ? '/dashboard' : '/login';

    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <section className="relative isolate min-h-[calc(100vh-4rem)] px-4 pb-20 pt-20 sm:px-6 lg:px-8">
                <Aurora />
                <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100 shadow-lg shadow-cyan-500/10">
                            <Lock size={14} /> Self-hosted deployment control
                        </div>
                        <h1 className="mt-8 max-w-4xl text-5xl font-black leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
                            DeployForge
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                            A focused deployment platform for GitHub-connected apps, VPS infrastructure, live terminals, and real operational visibility.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href={primaryHref}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]"
                            >
                                {primaryLabel} <ArrowRight size={17} />
                            </Link>
                            <Link
                                href={secondaryHref}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/15"
                            >
                                {auth.isAuthenticated ? <LayoutDashboard size={17} /> : <Github size={17} />}
                                {secondaryLabel}
                            </Link>
                        </div>
                    </div>

                    <DeploymentPreview
                        isAuthenticated={auth.isAuthenticated}
                        isLoading={auth.isAuthenticated && deployments.isLoading}
                        deployments={latestDeployments}
                        activeVps={activeVps}
                    />
                </div>
            </section>

            <section id="features" className="border-y border-white/10 bg-white/[0.03] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <SectionIntro
                        eyebrow="Platform"
                        title="Everything public cloud polish needs, pointed at your own servers."
                        description="DeployForge keeps the workflow compact: source control, server inventory, build status, terminal access, and monitoring stay in one coherent interface."
                    />
                    <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                        {features.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <article key={feature.title} className="rounded-lg border border-white/10 bg-slate-900/70 p-5 transition-colors hover:border-white/20">
                                    <Icon className={feature.accent} size={24} />
                                    <h3 className="mt-5 text-base font-black text-white">{feature.title}</h3>
                                    <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <SectionIntro
                        eyebrow="Workflow"
                        title="From repository to running service without losing server ownership."
                        description="The core path is short enough for solo builders and explicit enough for teams managing production infrastructure."
                    />
                    <div className="mt-12 grid gap-4 lg:grid-cols-4">
                        {steps.map(([title, description], index) => (
                            <article key={title} className="relative rounded-lg border border-white/10 bg-slate-900/55 p-6">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sm font-black text-slate-950">
                                    {index + 1}
                                </div>
                                <h3 className="mt-6 text-lg font-black text-white">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="border-y border-white/10 bg-slate-900/40 px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <LiveDeployments deployments={latestDeployments} isLoading={auth.isAuthenticated && deployments.isLoading} isAuthenticated={auth.isAuthenticated} />
                    <TerminalPreview />
                </div>
            </section>

            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <SectionIntro
                        eyebrow="Live stats"
                        title="Platform totals from the DeployForge API."
                        description="These numbers are read from the backend. When the API is unavailable, the page leaves them blank instead of substituting placeholders."
                    />
                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        <StatCard title="Total users" icon={<Users size={20} />} value={stats.data?.totalUsers} loading={stats.isLoading} error={stats.isError} />
                        <StatCard title="Total deployments" icon={<Rocket size={20} />} value={stats.data?.totalDeployments} loading={stats.isLoading} error={stats.isError} />
                        <StatCard title="Active VPS" icon={<Server size={20} />} value={stats.data?.activeVps} loading={stats.isLoading} error={stats.isError} />
                    </div>
                </div>
            </section>

            <section className="px-4 pb-24 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-8 shadow-2xl shadow-cyan-950/30 sm:p-10 lg:flex lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight text-white">Start deploying on infrastructure you control.</h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/75">
                            Jump into the right place based on your current session and keep the workflow moving.
                        </p>
                    </div>
                    <Link
                        href={ctaHref}
                        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02] lg:mt-0"
                    >
                        Start deploying <ArrowRight size={17} />
                    </Link>
                </div>
            </section>
        </main>
    );
}

function Aurora() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/14 blur-3xl" />
            <div className="absolute right-[-8rem] top-36 h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute bottom-20 left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/10 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return (
        <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-300">{eyebrow}</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">{description}</p>
        </div>
    );
}

function DeploymentPreview({
    isAuthenticated,
    isLoading,
    deployments,
    activeVps,
}: {
    isAuthenticated: boolean;
    isLoading: boolean;
    deployments: Array<{ id: string; name?: string | null; status: string; updatedAt: string; project?: { name: string } | null }>;
    activeVps?: number;
}) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
            <div className="rounded-lg border border-white/10 bg-slate-950/85 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase text-slate-500">Live preview</p>
                        <h2 className="mt-1 text-lg font-black text-white">Deployment console</h2>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-200">
                        <span className="h-2 w-2 rounded-full bg-emerald-300" /> API linked
                    </div>
                </div>
                <div className="mt-5 grid gap-3">
                    {isLoading ? (
                        <>
                            <SkeletonBlock className="h-16" />
                            <SkeletonBlock className="h-16" />
                            <SkeletonBlock className="h-16" />
                        </>
                    ) : isAuthenticated && deployments.length ? (
                        deployments.map((deployment) => (
                            <div key={deployment.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-white">{deployment.name || deployment.project?.name || 'Deployment'}</p>
                                        <p className="mt-1 text-xs text-slate-500">{formatDate(deployment.updatedAt)}</p>
                                    </div>
                                    <StatusBadge status={deployment.status} />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
                            <GitBranch className="mx-auto text-slate-500" size={28} />
                            <p className="mt-3 text-sm font-bold text-white">{isAuthenticated ? 'No live deployments yet' : 'Sign in to preview your deployments'}</p>
                            <p className="mt-2 text-xs leading-5 text-slate-500">Deployment rows appear here only when the API returns real records.</p>
                        </div>
                    )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <MiniMetric label="Deployments" value={isAuthenticated ? deployments.length : undefined} />
                    <MiniMetric label="Active VPS" value={isAuthenticated ? activeVps : undefined} />
                </div>
            </div>
        </div>
    );
}

function MiniMetric({ label, value }: { label: string; value?: number }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-white">{typeof value === 'number' ? value : '-'}</p>
        </div>
    );
}

function LiveDeployments({
    deployments,
    isLoading,
    isAuthenticated,
}: {
    deployments: Array<{ id: string; name?: string | null; status: string; updatedAt: string; project?: { name: string } | null }>;
    isLoading: boolean;
    isAuthenticated: boolean;
}) {
    return (
        <section className="rounded-lg border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-center gap-3">
                <LineChart className="text-cyan-300" size={22} />
                <h2 className="text-xl font-black text-white">Deployment preview</h2>
            </div>
            <div className="mt-6 space-y-3">
                {isLoading ? (
                    <>
                        <SkeletonBlock className="h-14" />
                        <SkeletonBlock className="h-14" />
                    </>
                ) : isAuthenticated && deployments.length ? (
                    deployments.map((deployment) => (
                        <div key={deployment.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white">{deployment.name || deployment.project?.name || deployment.id}</p>
                                <p className="mt-1 text-xs text-slate-500">{formatDate(deployment.updatedAt)}</p>
                            </div>
                            <StatusBadge status={deployment.status} />
                        </div>
                    ))
                ) : (
                    <div className="rounded-lg border border-dashed border-white/15 p-6 text-sm text-slate-400">
                        {isAuthenticated ? 'No deployment data returned by the API yet.' : 'Authenticated deployment data appears here after login.'}
                    </div>
                )}
            </div>
        </section>
    );
}

function TerminalPreview() {
    return (
        <section className="rounded-lg border border-white/10 bg-slate-950 p-6">
            <div className="flex items-center gap-3">
                <Terminal className="text-emerald-300" size={22} />
                <h2 className="text-xl font-black text-white">Terminal preview</h2>
            </div>
            <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-black">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-red-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-300" />
                    <span className="h-3 w-3 rounded-full bg-emerald-300" />
                </div>
                <div className="space-y-3 p-4 font-mono text-xs leading-6 text-emerald-200">
                    <p>$ deployforge status</p>
                    <p className="text-slate-500">waiting for an authenticated server session...</p>
                    <p>$ tail deployment.log</p>
                    <p className="text-slate-500">terminal output streams here from your VPS.</p>
                </div>
            </div>
        </section>
    );
}

function StatCard({ title, value, icon, loading, error }: { title: string; value?: number; icon: React.ReactNode; loading: boolean; error: boolean }) {
    return (
        <article className="rounded-lg border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-400">{title}</p>
                <span className="text-cyan-300">{icon}</span>
            </div>
            {loading ? (
                <SkeletonBlock className="mt-6 h-10 w-28" />
            ) : error ? (
                <p className="mt-6 text-sm font-bold text-slate-500">Unavailable</p>
            ) : (
                <p className="mt-6 text-4xl font-black tracking-tight text-white">{typeof value === 'number' ? value.toLocaleString() : '-'}</p>
            )}
        </article>
    );
}
