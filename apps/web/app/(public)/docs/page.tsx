'use client';

import Link from 'next/link';
import {
    ArrowRight,
    BookOpen,
    Braces,
    CheckCircle2,
    FileTerminal,
    Github,
    KeyRound,
    Lock,
    ScrollText,
    Server,
    ShieldCheck,
    Terminal,
} from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';

const nav = [
    ['Overview', 'overview'],
    ['Getting Started', 'getting-started'],
    ['GitHub Integration', 'github-integration'],
    ['VPS Management', 'vps-management'],
    ['Deployment System', 'deployment-system'],
    ['Terminal System', 'terminal-system'],
    ['Monitoring & Logs', 'monitoring-logs'],
    ['Admin Panel', 'admin-panel'],
    ['Security', 'security'],
];

const sections = [
    {
        id: 'overview',
        title: 'Overview',
        icon: BookOpen,
        description: 'DeployForge is a self-hosted deployment platform for GitHub-connected projects running on VPS infrastructure you control.',
        items: [
            'It solves the gap between polished platform deployment workflows and teams that still want ownership of their servers.',
            'The product brings repositories, VPS inventory, deployment jobs, live terminals, monitoring, logs, and admin controls into one focused interface.',
            'The public site, dashboard, and backend are designed around production clarity: explicit actions, visible state, and minimal friction.',
        ],
    },
    {
        id: 'getting-started',
        title: 'Getting Started',
        icon: CheckCircle2,
        description: 'The first setup path connects identity, source code, server access, and a deployable project.',
        items: [
            'Log in to DeployForge and connect your GitHub account from the authenticated console.',
            'Add a VPS with reachable SSH credentials and run the connection test before assigning deployments.',
            'Create the first deployment by selecting a repository, branch, project configuration, and destination server.',
        ],
    },
    {
        id: 'github-integration',
        title: 'GitHub Integration',
        icon: Github,
        description: 'GitHub is the source-control entry point for repositories, branches, and automated deployment events.',
        items: [
            'The OAuth flow authorizes DeployForge to connect a user session to GitHub and store the access needed for repository operations.',
            'Repository sync imports available projects and branch metadata so deployment forms can use current source-control data.',
            'Webhook automation receives repository events and can trigger redeployment flows without manual dashboard clicks.',
        ],
    },
    {
        id: 'vps-management',
        title: 'VPS Management',
        icon: Server,
        description: 'Servers are first-class deployment targets with SSH setup, connection testing, and health visibility.',
        items: [
            'Add servers with host, port, username, authentication material, and metadata needed for deployment orchestration.',
            'Test SSH connections before using a VPS in production so invalid credentials or unreachable hosts are caught early.',
            'Use server status and health checks to understand which machines are available for terminal access and deployments.',
        ],
    },
    {
        id: 'deployment-system',
        title: 'Deployment System',
        icon: FileTerminal,
        description: 'The deployment engine uses Docker-oriented automation to build, run, expose, and track project releases.',
        items: [
            'Build detection identifies how the project should be packaged and deployed from repository content and configuration.',
            'Docker-based deployment jobs create repeatable runtime environments and keep release state visible in the dashboard.',
            'Auto redeploy flows can react to GitHub webhooks and push new versions through the same auditable deployment path.',
        ],
    },
    {
        id: 'terminal-system',
        title: 'Terminal System',
        icon: Terminal,
        description: 'Browser SSH gives operators direct server access from the DeployForge interface.',
        items: [
            'Terminal sessions connect through the backend to the selected VPS instead of exposing raw credentials in the browser.',
            'Session handling keeps the terminal scoped to authenticated users and the server they are allowed to access.',
            'The terminal UI is meant for inspection, recovery, and operational commands when a deployment needs hands-on attention.',
        ],
    },
    {
        id: 'monitoring-logs',
        title: 'Monitoring & Logs',
        icon: ScrollText,
        description: 'Monitoring surfaces resource usage, application logs, deployment logs, and operational alerts.',
        items: [
            'CPU and RAM metrics help teams spot overloaded servers and correlate resource pressure with deployment activity.',
            'Logs provide a timeline for builds, runtime behavior, errors, and infrastructure events.',
            'Alerts and status indicators keep attention on degraded services, failed jobs, or unreachable infrastructure.',
        ],
    },
    {
        id: 'admin-panel',
        title: 'Admin Panel',
        icon: ShieldCheck,
        description: 'The admin system centralizes platform oversight, role boundaries, and sensitive operational controls.',
        items: [
            'RBAC controls separate administrative workflows from normal authenticated deployment operations.',
            'Admins can review users, servers, deployments, GitHub state, monitoring data, and global settings from protected routes.',
            'The admin control flow is designed for clear authority boundaries before changing security-sensitive resources.',
        ],
    },
    {
        id: 'security',
        title: 'Security',
        icon: Lock,
        description: 'DeployForge treats authentication, encryption, and secrets handling as core platform responsibilities.',
        items: [
            'JWT auth protects API and app routes while preserving a clear session model for the dashboard and admin areas.',
            'Encryption helpers protect sensitive values such as credentials, tokens, and deployment secrets before storage or use.',
            'Secrets handling keeps environment values scoped to projects and deployment execution instead of leaking into public UI surfaces.',
        ],
    },
];

export default function DocsPage() {
    const auth = useAuthSession();
    const ctaHref = auth.isAuthenticated ? '/dashboard' : '/login';
    const ctaLabel = auth.isAuthenticated ? 'Go to Dashboard' : 'Get Started';

    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <section className="relative isolate px-4 pb-16 pt-20 sm:px-6 lg:px-8">
                <Aurora />
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-4xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100 shadow-lg shadow-cyan-500/10">
                            <BookOpen size={14} /> Documentation
                        </div>
                        <h1 className="mt-8 text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                            DeployForge docs
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                            A practical guide to the platform architecture, first deployment path, GitHub automation, VPS operations, terminals, monitoring, admin controls, and security model.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href={ctaHref}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]"
                            >
                                {ctaLabel} <ArrowRight size={17} />
                            </Link>
                            <Link
                                href="/features"
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/15"
                            >
                                View Features
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-y border-white/10 bg-white/[0.03] px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[18rem_1fr]">
                    <aside className="lg:sticky lg:top-24 lg:self-start">
                        <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                            <div className="flex items-center gap-2 text-sm font-black text-white">
                                <Braces className="text-cyan-300" size={18} />
                                Contents
                            </div>
                            <nav className="mt-4 flex flex-col gap-1">
                                {nav.map(([label, id]) => (
                                    <a
                                        key={id}
                                        href={`#${id}`}
                                        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                                    >
                                        {label}
                                    </a>
                                ))}
                            </nav>
                        </div>
                    </aside>

                    <div className="space-y-5">
                        {sections.map((section) => {
                            const Icon = section.icon;
                            return (
                                <article key={section.id} id={section.id} className="scroll-mt-24 rounded-lg border border-white/10 bg-slate-900/70 p-6 sm:p-7">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                                            <Icon size={22} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black tracking-tight text-white">{section.title}</h2>
                                            <p className="mt-3 text-base leading-7 text-slate-400">{section.description}</p>
                                        </div>
                                    </div>
                                    <div className="mt-6 grid gap-3">
                                        {section.items.map((item) => (
                                            <div key={item} className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
                                                <p className="text-sm leading-6 text-slate-300">{item}</p>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-8 shadow-2xl shadow-cyan-950/30 sm:p-10 lg:flex lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-3 text-cyan-100">
                            <KeyRound size={22} />
                            <p className="text-sm font-black uppercase tracking-wide">From docs to deployment</p>
                        </div>
                        <h2 className="mt-4 text-3xl font-black tracking-tight text-white">Use the guide, then open the console.</h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/75">
                            Start from login when you need a session, or return directly to the dashboard when DeployForge already knows you.
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
            <div className="absolute bottom-8 left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-rose-400/10 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}
