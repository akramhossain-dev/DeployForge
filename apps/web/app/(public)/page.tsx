'use client';

import Link from 'next/link';
import {
    Activity, ArrowRight, CheckCircle2, Github,
    GitBranch, LayoutDashboard, Lock, Rocket,
    Server, Terminal, Users, Zap,
} from 'lucide-react';
import { useAuthSession, useDeployments, usePublicStats, useVpsList } from '@/hooks/useDeployForgeData';
import { SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import clsx from 'clsx';

const FEATURES = [
    { title: 'GitHub Integration', description: 'Connect repositories, sync branches, and keep deployments close to your code.', icon: Github, accent: 'text-cyan-300', bg: 'bg-cyan-300/10 border-cyan-300/15' },
    { title: 'VPS Deployment',     description: 'Register your own servers — no handing infra control to a third-party cloud.', icon: Server, accent: 'text-emerald-300', bg: 'bg-emerald-300/10 border-emerald-300/15' },
    { title: 'Auto Deploy',        description: 'Repeatable build jobs with live logs, status tracking, and rollback-ready history.', icon: Zap, accent: 'text-amber-300', bg: 'bg-amber-300/10 border-amber-300/15' },
    { title: 'Terminal Access',    description: 'Reach server sessions from the browser when production needs hands-on attention.', icon: Terminal, accent: 'text-rose-300', bg: 'bg-rose-300/10 border-rose-300/15' },
    { title: 'Live Monitoring',    description: 'Watch deployment health, VPS signals, and platform activity from one surface.', icon: Activity, accent: 'text-indigo-300', bg: 'bg-indigo-300/10 border-indigo-300/15' },
];

const STEPS = [
    { step: '01', title: 'Connect GitHub',  desc: 'Authorize DeployForge and pick the repository you want to ship.',           accent: 'text-cyan-300' },
    { step: '02', title: 'Add VPS',         desc: 'Attach your server with SSH credentials and health check configuration.',   accent: 'text-emerald-300' },
    { step: '03', title: 'Deploy Repo',     desc: 'Choose branch, framework, and destination — then launch the build job.',   accent: 'text-amber-300' },
    { step: '04', title: 'Scale Out',       desc: 'Grow capacity across registered infrastructure as workloads expand.',      accent: 'text-violet-300' },
];

export default function HomePage() {
    const auth        = useAuthSession();
    const stats       = usePublicStats();
    const deployments = useDeployments(auth.isAuthenticated);
    const vps         = useVpsList(auth.isAuthenticated);
    const latestDeployments = deployments.data?.slice(0, 3) || [];
    const activeVps   = vps.data?.filter(s => s.status.toLowerCase() === 'active').length;

    const primaryHref  = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Go to Dashboard' : 'Get Started Free';
    const ctaHref      = auth.isAuthenticated ? '/dashboard' : '/login';
    const ctaLabel     = auth.isAuthenticated ? 'Go to Dashboard' : 'Start Deploying';

    return (
        <main className="overflow-hidden bg-slate-950 text-white">

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="relative isolate min-h-[calc(100vh-4rem)] px-4 pb-24 pt-20 sm:px-6 lg:px-8">
                <HeroAurora />
                <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100 shadow-lg shadow-cyan-500/10">
                            <Lock size={12} /> Self-hosted deployment control
                        </div>
                        <h1 className="mt-8 max-w-3xl text-5xl font-black leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
                            Deploy on infrastructure{' '}
                            <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                                you own.
                            </span>
                        </h1>
                        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                            A focused deployment platform for GitHub-connected apps, VPS infrastructure, live terminals, and real operational visibility.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link href={primaryHref}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 shadow-xl shadow-white/10 transition-all hover:scale-[1.02] hover:shadow-white/20">
                                {primaryLabel} <ArrowRight size={16} />
                            </Link>
                            <Link href={auth.isAuthenticated ? '/dashboard' : '/login'}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-6 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/12">
                                {auth.isAuthenticated ? <><LayoutDashboard size={16} /> Dashboard</> : <><Github size={16} /> Sign In</>}
                            </Link>
                        </div>
                        {/* Trust badges */}
                        <div className="mt-10 flex flex-wrap gap-4 text-xs font-bold text-slate-500">
                            {['Open source friendly', 'No vendor lock-in', 'SSH-based deployments', 'Live log streaming'].map(b => (
                                <span key={b} className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-400" />{b}</span>
                            ))}
                        </div>
                    </div>

                    {/* Hero preview card */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 shadow-2xl shadow-slate-950/70 backdrop-blur-xl">
                        <div className="rounded-xl border border-white/[0.07] bg-slate-950/90 p-5">
                            <div className="flex items-center justify-between gap-4 mb-5">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live preview</p>
                                    <h2 className="text-base font-black text-white">Deployment Console</h2>
                                </div>
                                <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-black text-emerald-200">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" /> API Linked
                                </span>
                            </div>
                            <div className="space-y-2">
                                {auth.isAuthenticated && deployments.isLoading ? (
                                    <><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></>
                                ) : auth.isAuthenticated && latestDeployments.length ? (
                                    latestDeployments.map(d => (
                                        <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className={clsx('h-2 w-2 shrink-0 rounded-full',
                                                    d.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' :
                                                    d.status === 'FAILED'  ? 'bg-rose-400' : 'bg-cyan-400')} />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black text-white">{d.name || d.project?.name || 'Deployment'}</p>
                                                    <p className="text-[10px] text-slate-500">{formatDate(d.updatedAt)}</p>
                                                </div>
                                            </div>
                                            <StatusBadge status={d.status} />
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                                        <GitBranch className="text-slate-600" size={28} />
                                        <p className="mt-3 text-sm font-black text-white">{auth.isAuthenticated ? 'No live deployments yet' : 'Sign in to see your deployments'}</p>
                                        <p className="mt-1 text-xs text-slate-600">Real records stream here from the API.</p>
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Deployments', value: auth.isAuthenticated ? latestDeployments.length : undefined },
                                    { label: 'Active VPS',  value: auth.isAuthenticated ? activeVps           : undefined },
                                ].map(m => (
                                    <div key={m.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{m.label}</p>
                                        <p className="mt-1.5 text-2xl font-black text-white">{typeof m.value === 'number' ? m.value : '—'}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Features ─────────────────────────────────────────────────── */}
            <section id="features" className="border-y border-white/[0.07] bg-white/[0.02] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <p className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Platform</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Everything you need, pointed at your servers.
                        </h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">
                            Source control, server inventory, build status, terminal access, and monitoring in one coherent interface.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {FEATURES.map(f => {
                            const Icon = f.icon;
                            return (
                                <article key={f.title} className="group rounded-2xl border border-white/[0.07] bg-slate-900/60 p-5 transition-all hover:border-white/15 hover:bg-slate-900/80">
                                    <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl border', f.bg)}>
                                        <Icon size={18} className={f.accent} />
                                    </div>
                                    <h3 className="mt-5 text-sm font-black text-white">{f.title}</h3>
                                    <p className="mt-2.5 text-xs leading-5 text-slate-400">{f.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Steps ────────────────────────────────────────────────────── */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <p className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Workflow</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            From repository to running service.
                        </h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">
                            Short enough for solo builders, explicit enough for teams managing production infrastructure.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 lg:grid-cols-4">
                        {STEPS.map(({ step, title, desc, accent }) => (
                            <article key={step} className="relative rounded-2xl border border-white/[0.07] bg-slate-900/55 p-6 transition-all hover:border-white/12">
                                <p className={clsx('text-4xl font-black', accent)}>{step}</p>
                                <h3 className="mt-5 text-base font-black text-white">{title}</h3>
                                <p className="mt-2.5 text-sm leading-6 text-slate-400">{desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Live preview + Terminal ───────────────────────────────────── */}
            <section className="border-y border-white/[0.07] bg-slate-900/30 px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
                    {/* Deployment list */}
                    <div className="rounded-2xl border border-white/[0.07] bg-slate-950/70 p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/8 text-cyan-300">
                                <Rocket size={15} />
                            </div>
                            <h2 className="text-lg font-black text-white">Deployment Preview</h2>
                        </div>
                        <div className="space-y-2">
                            {auth.isAuthenticated && deployments.isLoading ? (
                                <><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /></>
                            ) : auth.isAuthenticated && latestDeployments.length ? (
                                latestDeployments.map(d => (
                                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-white">{d.name || d.project?.name || d.id}</p>
                                            <p className="text-[10px] text-slate-500">{formatDate(d.updatedAt)}</p>
                                        </div>
                                        <StatusBadge status={d.status} />
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-slate-500">
                                    {auth.isAuthenticated ? 'No deployments returned yet.' : 'Sign in to preview your live deployments.'}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Terminal mock */}
                    <div className="rounded-2xl border border-white/[0.07] bg-slate-950 p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/8 text-emerald-300">
                                <Terminal size={15} />
                            </div>
                            <h2 className="text-lg font-black text-white">Terminal Access</h2>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black">
                            <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-3">
                                <span className="h-3 w-3 rounded-full bg-rose-400/80" />
                                <span className="h-3 w-3 rounded-full bg-amber-300/80" />
                                <span className="h-3 w-3 rounded-full bg-emerald-300/80" />
                                <span className="ml-3 text-[10px] font-mono text-slate-600">deployforge — bash</span>
                            </div>
                            <div className="space-y-2.5 p-5 font-mono text-xs leading-6">
                                <p className="text-emerald-300">$ deployforge status</p>
                                <p className="text-slate-500">↳ connecting to authenticated session…</p>
                                <p className="text-emerald-300">$ tail -f deployment.log</p>
                                <p className="text-slate-500">↳ streaming output from your VPS in real-time.</p>
                                <p className="text-cyan-300 animate-pulse">█</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Live stats ───────────────────────────────────────────────── */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <p className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Live Stats</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Platform at a glance.</h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">Numbers read directly from the backend API — no placeholders.</p>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        {[
                            { title: 'Total Users',       icon: <Users size={20} />,  value: stats.data?.totalUsers,       accent: 'from-violet-400/25' },
                            { title: 'Total Deployments', icon: <Rocket size={20} />, value: stats.data?.totalDeployments, accent: 'from-cyan-400/25' },
                            { title: 'Active VPS',        icon: <Server size={20} />, value: stats.data?.activeVps,        accent: 'from-emerald-400/25' },
                        ].map(card => (
                            <article key={card.title} className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/70 p-6">
                                <div className={clsx('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', card.accent)} />
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">{card.title}</p>
                                    <span className="text-cyan-300">{card.icon}</span>
                                </div>
                                {stats.isLoading ? (
                                    <SkeletonBlock className="mt-6 h-10 w-28" />
                                ) : stats.isError ? (
                                    <p className="mt-6 text-sm font-bold text-slate-600">Unavailable</p>
                                ) : (
                                    <p className="mt-5 text-5xl font-black tracking-tight text-white">
                                        {typeof card.value === 'number' ? card.value.toLocaleString() : '—'}
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ──────────────────────────────────────────────────────── */}
            <section className="px-4 pb-24 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 via-cyan-300/5 to-transparent p-8 shadow-2xl shadow-cyan-950/20 sm:p-12 lg:flex lg:items-center lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Ready?</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Start deploying on infrastructure you control.</h2>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                            Jump into the right workspace based on your session and keep the workflow moving.
                        </p>
                    </div>
                    <Link href={ctaHref}
                        className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-8 text-sm font-black text-slate-950 shadow-xl shadow-white/10 transition-all hover:scale-[1.02] lg:mt-0">
                        {ctaLabel} <ArrowRight size={16} />
                    </Link>
                </div>
            </section>
        </main>
    );
}

function HeroAurora() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="absolute right-[-8rem] top-40 h-[28rem] w-[28rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute bottom-20 left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/8 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        </div>
    );
}
