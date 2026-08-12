'use client';

import Link from 'next/link';
import {
    ArrowRight,
    CheckCircle2,
    Cpu,
    Database,
    Github,
    Globe,
    KeyRound,
    Lock,
    Rocket,
    Server,
    ShieldCheck,
    Terminal,
    Zap
} from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';

const TECH_STACK = [
    { category: 'Frontend Dashboard', tech: 'Next.js 14 App Router, React 18, Tailwind CSS, xterm.js', detail: 'Public pages, dashboard console, browser SSH terminal, admin views' },
    { category: 'Control Plane API', tech: 'Fastify, TypeScript, Pino Logger, WebSockets', detail: 'High-performance REST API, webhook handlers, live streaming sockets' },
    { category: 'Task & Queue Engine', tech: 'BullMQ, ioredis, Redis 7', detail: 'Asynchronous deployment pipelines, job retries, task scheduling' },
    { category: 'Database & ORM', tech: 'PostgreSQL 16, Prisma ORM', detail: 'Relational store for users, VPS nodes, projects, builds, and audit logs' },
    { category: 'Orchestration Driver', tech: 'Agentless SSH2, SFTP, Docker Engine', detail: 'Direct server command execution, container build, and file sync' },
    { category: 'Security & Encryption', tech: 'AES-256-GCM, Argon2id, Crypto HMAC', detail: 'Vault secrets encryption, password hashing, webhook signature checks' },
    { category: 'Proxy & Networking', tech: 'Nginx 1.27 Alpine, Certbot ACME', detail: 'Dynamic reverse proxy routing, Let\'s Encrypt TLS cert renewal' },
];

const PRACTICAL_PROBLEMS = [
    {
        title: 'Infrastructure Sovereignty',
        description: 'Host applications on Virtual Private Servers you control. DeployForge connects over standard SSH without third-party daemons or platform lock-in.'
    },
    {
        title: 'Predictable Cost & Scaling',
        description: 'Avoid arbitrary per-app or per-bandwidth pricing penalties. Run high-density workloads on fixed-cost cloud servers or bare metal.'
    },
    {
        title: 'Zero-Downtime Reliability',
        description: 'Blue-Green deployments isolate new container builds, verify HTTP health check endpoints, and update Nginx upstream routes without dropping connections.'
    },
    {
        title: 'Zero-Trust Data Protection',
        description: 'Environment variables are encrypted at rest with AES-256-GCM. Passwords use Argon2id, and admin controls enforce lockout rules.'
    }
];

const PHILOSOPHY = [
    {
        title: 'Developer Control',
        description: 'Infrastructure management should feel transparent. Operators retain full root access and visibility into underlying Docker containers and Nginx configs.'
    },
    {
        title: 'Agentless Architecture',
        description: 'No proprietary agent daemons or cluster overhead on target servers. SSH2 is the single, auditable communication channel.'
    },
    {
        title: 'Operational Simplicity',
        description: 'Focus on clear status surfaces, real-time logs, and direct terminal access rather than noisy dashboards and complex abstractions.'
    }
];

export default function AboutPage() {
    const auth = useAuthSession();
    const primaryHref = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Open Console' : 'Get Started';

    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Header Section ────────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 pb-16 pt-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        {/* Eyebrow */}
                        <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>DEPLOYFORGE — ABOUT</span>
                        </div>

                        {/* Title */}
                        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                            Self-hosted deployment control for modern software teams.
                        </h1>

                        {/* Description */}
                        <p className="mt-4 text-base leading-relaxed text-[#A1A1A1] sm:text-lg">
                            DeployForge bridges the gap between polished platform ergonomics and complete server sovereignty. Connect repositories, manage VPS fleets over agentless SSH, and release applications with zero downtime.
                        </p>

                        {/* CTAs */}
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                href={primaryHref}
                                className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-4 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                            >
                                <span>{primaryLabel}</span>
                                <ArrowRight size={13} />
                            </Link>
                            <Link
                                href="/docs"
                                className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-4 text-xs font-medium text-white transition-colors hover:bg-[#111111]"
                            >
                                <span>Read Documentation</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 2. What is DeployForge? ────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
                        <div className="space-y-4 lg:col-span-6">
                            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Platform Purpose</h2>
                            <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                                An open-source PaaS orchestrator built for owned infrastructure.
                            </h3>
                            <p className="text-sm leading-relaxed text-[#A1A1A1]">
                                DeployForge is an open-source, self-hosted Platform-as-a-Service designed to automate application building, deployment, and operational monitoring on your Virtual Private Servers (VPS).
                            </p>
                            <p className="text-sm leading-relaxed text-[#A1A1A1]">
                                It connects GitHub repositories directly to your infrastructure. Pushing code triggers container builds, dynamic Nginx reverse proxy updates, Let’s Encrypt TLS certificate generation, and zero-downtime Blue-Green releases without relying on third-party cloud lock-in.
                            </p>
                        </div>

                        {/* Specs Box */}
                        <div className="lg:col-span-6">
                            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 font-mono text-xs">
                                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3 text-[#666666]">
                                    <span>DEPLOYFORGE PRIMITIVES</span>
                                    <span className="text-emerald-400">STATUS: ACTIVE</span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-start gap-3 rounded border border-[#1F1F1F] bg-[#000000] p-3">
                                        <Server size={15} className="text-white shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-white">Agentless SSH Protocol</p>
                                            <p className="text-[11px] text-[#A1A1A1]">Executes builds and container lifecycles via SSH2. Zero custom daemons required on target VPS.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 rounded border border-[#1F1F1F] bg-[#000000] p-3">
                                        <Zap size={15} className="text-white shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-white">Blue-Green Zero Downtime</p>
                                            <p className="text-[11px] text-[#A1A1A1]">Parallel container deployments with HTTP health checks before Nginx route switching.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 rounded border border-[#1F1F1F] bg-[#000000] p-3">
                                        <Lock size={15} className="text-white shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-white">AES-256 Secret Vault</p>
                                            <p className="text-[11px] text-[#A1A1A1]">Environment variables encrypted at rest with AES-256-GCM and Argon2id auth hashing.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 3. Why DeployForge? ────────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Problem & Solution</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Why DeployForge exists.
                        </p>
                    </div>

                    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {PRACTICAL_PROBLEMS.map((prob) => (
                            <div key={prob.title} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                                <h3 className="text-sm font-semibold text-white">{prob.title}</h3>
                                <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">{prob.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── 4. Product Philosophy ──────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Core Principles</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Design & engineering philosophy.
                        </p>
                    </div>

                    <div className="mt-8 grid gap-6 md:grid-cols-3">
                        {PHILOSOPHY.map((item) => (
                            <div key={item.title} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                                <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                                <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── 5. Technology Stack ───────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Technology Architecture</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Built with production-proven open primitives.
                        </p>
                    </div>

                    <div className="mt-8 overflow-hidden rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left font-mono text-xs">
                                <thead className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">COMPONENT</th>
                                        <th className="px-4 py-3 font-semibold">TECHNOLOGY</th>
                                        <th className="px-4 py-3 font-semibold">ROLE & FUNCTION</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                                    {TECH_STACK.map((row) => (
                                        <tr key={row.category} className="transition-colors hover:bg-[#111111]/50">
                                            <td className="px-4 py-3 font-semibold text-white">{row.category}</td>
                                            <td className="px-4 py-3 text-emerald-400">{row.tech}</td>
                                            <td className="px-4 py-3 text-[#A1A1A1]">{row.detail}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 6. Final CTA ──────────────────────────────────────────── */}
            <section className="px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 sm:p-10">
                    <div className="max-w-xl">
                        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Ready to take control of your deployments?
                        </h2>
                        <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">
                            Connect your servers, authorize your GitHub repositories, and start shipping software on your own infrastructure.
                        </p>
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
                    </div>
                </div>
            </section>

        </main>
    );
}
