'use client';

import Link from 'next/link';
import {
    Activity,
    ArrowRight,
    Boxes,
    CheckCircle2,
    Database,
    Gauge,
    Github,
    GitBranch,
    KeyRound,
    Layers3,
    Lock,
    Network,
    RotateCcw,
    Server,
    ShieldCheck,
    Terminal,
    Workflow,
} from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';

const featureBlocks = [
    {
        title: 'GitHub Integration',
        icon: Github,
        accent: 'text-cyan-300',
        description: 'OAuth connection, repository sync, and webhook automation keep deployments attached to the code path your team already uses.',
        points: ['GitHub OAuth authorization', 'Repository and branch synchronization', 'Webhook-triggered redeployments'],
    },
    {
        title: 'VPS Management',
        icon: Server,
        accent: 'text-emerald-300',
        description: 'Register infrastructure you own, verify SSH access, and control multiple servers from one operational inventory.',
        points: ['SSH credential validation', 'Multi-server control plane', 'Health and status monitoring'],
    },
    {
        title: 'Deployment Engine',
        icon: Boxes,
        accent: 'text-amber-300',
        description: 'Docker-based deployment jobs build, ship, and expose applications with repeatable automation and clear status history.',
        points: ['Docker image and container workflow', 'Automated build and release jobs', 'Nginx-aware service exposure'],
    },
    {
        title: 'Terminal Access',
        icon: Terminal,
        accent: 'text-rose-300',
        description: 'Open browser-based SSH sessions for hands-on production inspection without leaving the DeployForge console.',
        points: ['Interactive browser terminal', 'Session lifecycle handling', 'Server-scoped access control'],
    },
    {
        title: 'Monitoring System',
        icon: Activity,
        accent: 'text-indigo-300',
        description: 'Track CPU, RAM, logs, and deployment signals through flat operational views designed for fast scanning.',
        points: ['CPU and memory metrics', 'Deployment and server logs', 'Health-oriented status surfaces'],
    },
    {
        title: 'Backup & Rollback System',
        icon: RotateCcw,
        accent: 'text-lime-300',
        description: 'Keep release history actionable with rollback-ready deployment records and operational recovery hooks.',
        points: ['Deployment history retention', 'Rollback service controls', 'Recovery-focused release metadata'],
    },
    {
        title: 'Environment Variable Manager',
        icon: KeyRound,
        accent: 'text-fuchsia-300',
        description: 'Manage project secrets and environment values from a single interface built around explicit deployment targets.',
        points: ['Project-scoped environment values', 'Secret-aware configuration flow', 'Deployment-time injection'],
    },
    {
        title: 'Admin Panel System',
        icon: ShieldCheck,
        accent: 'text-sky-300',
        description: 'Secure team and platform operations with admin controls, role boundaries, and production-facing security workflows.',
        points: ['RBAC administration', 'User and VPS oversight', 'Security-first control surfaces'],
    },
];

const workflow = [
    ['Connect GitHub', 'Authorize GitHub, sync repositories, and select the project branch that should drive releases.'],
    ['Add VPS', 'Attach your server over SSH, test connectivity, and make it available as a deployment target.'],
    ['Deploy project', 'Launch a Docker-based deployment with live status, logs, and destination-aware configuration.'],
    ['Scale + monitor', 'Expand across registered servers while monitoring health, resource usage, and release activity.'],
];

const architecture = [
    ['Next.js frontend', 'Public site, dashboard, admin surfaces, terminal UI, and deployment workflows in the App Router.'],
    ['Fastify backend', 'API routes for auth, GitHub, VPS, deployments, webhooks, monitoring, domains, and terminals.'],
    ['PostgreSQL + Prisma', 'Relational source of truth for users, servers, repositories, deployments, roles, and audit-ready records.'],
    ['Redis + BullMQ', 'Queue-backed background processing for long-running deployment and automation workloads.'],
    ['Docker + Nginx', 'Containerized application runtime with reverse proxy exposure for deployed services.'],
];

export default function FeaturesPage() {
    const auth = useAuthSession();
    const ctaHref = auth.isAuthenticated ? '/dashboard' : '/login';
    const ctaLabel = auth.isAuthenticated ? 'Go to Dashboard' : 'Get Started';

    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <section className="relative isolate px-4 pb-20 pt-20 sm:px-6 lg:px-8">
                <Aurora />
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-4xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100 shadow-lg shadow-cyan-500/10">
                            <Layers3 size={14} /> Capabilities
                        </div>
                        <h1 className="mt-8 text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                            DeployForge features for self-hosted delivery.
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                            Connect source control, manage VPS infrastructure, deploy Dockerized applications, inspect live terminals, and keep production signals visible from one focused console.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href={ctaHref}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]"
                            >
                                {ctaLabel} <ArrowRight size={17} />
                            </Link>
                            <Link
                                href="/docs"
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/15"
                            >
                                Read Docs
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-y border-white/10 bg-white/[0.03] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <SectionIntro
                        eyebrow="Core platform"
                        title="A complete deployment control plane without giving up your servers."
                        description="Each module is designed as a practical operations surface: clear actions, compact state, and minimal decoration around the data that matters."
                    />
                    <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {featureBlocks.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <article key={feature.title} className="rounded-lg border border-white/10 bg-slate-900/70 p-6 transition-colors hover:border-white/20">
                                    <Icon className={feature.accent} size={26} />
                                    <h2 className="mt-5 text-lg font-black text-white">{feature.title}</h2>
                                    <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
                                    <ul className="mt-5 space-y-3">
                                        {feature.points.map((point) => (
                                            <li key={point} className="flex gap-2 text-sm leading-5 text-slate-300">
                                                <CheckCircle2 className="mt-0.5 shrink-0 text-cyan-300" size={15} />
                                                <span>{point}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <SectionIntro
                        eyebrow="How it works"
                        title="A direct path from repository to monitored service."
                        description="DeployForge keeps the main flow explicit so teams can understand what is connected, where code is running, and what happened during each deployment."
                    />
                    <div className="mt-12 grid gap-4 lg:grid-cols-4">
                        {workflow.map(([title, description], index) => (
                            <article key={title} className="rounded-lg border border-white/10 bg-slate-900/55 p-6">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sm font-black text-slate-950">
                                    {index + 1}
                                </div>
                                <h2 className="mt-6 text-lg font-black text-white">{title}</h2>
                                <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="border-y border-white/10 bg-slate-900/40 px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Technical architecture</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Built from boring, production-friendly primitives.</h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">
                            The stack separates public UI, authenticated operations, API orchestration, queue workers, persistent data, and runtime infrastructure.
                        </p>
                        <div className="mt-8 grid grid-cols-3 gap-3">
                            <Metric icon={<Network size={18} />} label="API" value="Fastify" />
                            <Metric icon={<Database size={18} />} label="Data" value="Prisma" />
                            <Metric icon={<Gauge size={18} />} label="Ops" value="BullMQ" />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {architecture.map(([title, description]) => (
                            <article key={title} className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
                                <h3 className="text-base font-black text-white">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-8 shadow-2xl shadow-cyan-950/30 sm:p-10 lg:flex lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-3 text-cyan-100">
                            <Workflow size={22} />
                            <p className="text-sm font-black uppercase tracking-wide">Ready for the deployment loop</p>
                        </div>
                        <h2 className="mt-4 text-3xl font-black tracking-tight text-white">Start deploying with infrastructure you control.</h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/75">
                            Move into the authenticated console when you are signed in, or start from login to connect GitHub and add your first VPS.
                        </p>
                    </div>
                    <Link
                        href={ctaHref}
                        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02] lg:mt-0"
                    >
                        {ctaLabel} <ArrowRight size={17} />
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
            <div className="absolute bottom-10 left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/10 blur-3xl" />
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

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
            <div className="text-cyan-300">{icon}</div>
            <p className="mt-4 text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-white">{value}</p>
        </div>
    );
}
