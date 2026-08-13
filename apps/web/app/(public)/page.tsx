import type { Metadata } from 'next';
import Link from 'next/link';
import {
    Activity, CheckCircle2, Cpu, GitBranch, Github,
    Globe, Server, ShieldCheck, Terminal, Zap,
} from 'lucide-react';
import {
    LandingHeroButtons,
    LandingConsolePreview,
    LandingCtaButtons,
} from '@/components/landing/LandingInteractiveData';

export const metadata: Metadata = {
    title: 'DeployForge — Self-Hosted PaaS & VPS Deployment Platform',
    description: 'DeployForge connects your GitHub repositories to Virtual Private Servers over agentless SSH. Automate container builds, dynamic Nginx routing, and zero-downtime releases.',
    alternates: {
        canonical: '/',
    },
};

const CORE_FEATURES = [
    {
        title: 'Agentless SSH Orchestration',
        description: 'Connect standard Ubuntu servers. DeployForge manages builds, containers, and networking securely over SSH without third-party daemons.',
        icon: Server,
    },
    {
        title: 'Automated Git Workflows',
        description: 'Sync repositories via GitHub OAuth. Webhooks automatically trigger isolated build pipelines when code is pushed to monitored branches.',
        icon: Github,
    },
    {
        title: 'Zero-Config Nginx & SSL',
        description: 'Dynamic reverse proxy routing with automatic Let’s Encrypt TLS certificate issuance and renewal via Certbot.',
        icon: Globe,
    },
    {
        title: 'Blue-Green Deployments',
        description: 'Deploy new application releases into parallel containers, execute health checks, and switch live traffic with zero downtime.',
        icon: Zap,
    },
    {
        title: 'Web Terminal & Live Logs',
        description: 'Inspect running containers and access server SSH sessions directly in the browser via WebSockets and xterm.js.',
        icon: Terminal,
    },
    {
        title: 'AES-256 Security & Hardening',
        description: 'Environment variables encrypted at rest with AES-256-GCM, Argon2id auth hashing, and container sandbox profiles.',
        icon: ShieldCheck,
    },
];

const WORKFLOW_STEPS = [
    {
        step: '01',
        title: 'Connect GitHub Repository',
        description: 'Authorize DeployForge to listen for branch pushes and build webhooks.',
    },
    {
        step: '02',
        title: 'Register Target VPS',
        description: 'Attach your server credentials over SSH and define health check rules.',
    },
    {
        step: '03',
        title: 'Automated Container Build',
        description: 'DeployForge compiles your application runtime inside a sandbox container.',
    },
    {
        step: '04',
        title: 'Zero-Downtime Route Switch',
        description: 'Nginx dynamically updates traffic routes with active SSL certificate renewal.',
    },
];

export default function HomePage() {
    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Hero Section ────────────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 pb-20 pt-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        {/* Status label */}
                        <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>v1.0.0 — Self-Hosted PaaS Orchestrator</span>
                        </div>

                        {/* Headline */}
                        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                            Self-hosted application deployments on your own infrastructure.
                        </h1>

                        {/* Description */}
                        <p className="mt-5 text-base leading-relaxed text-[#A1A1A1] sm:text-lg">
                            DeployForge connects your GitHub repositories to Virtual Private Servers over agentless SSH.
                            Automate container builds, dynamic Nginx routing, and zero-downtime releases without vendor lock-in.
                        </p>

                        {/* Interactive CTAs */}
                        <LandingHeroButtons />

                        {/* Trust/spec points */}
                        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#1F1F1F] pt-6 text-xs font-mono text-[#666666]">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> Agentless SSH Protocol
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> Blue-Green Zero Downtime
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> Automated Certbot SSL
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> AES-256 Encrypted Secrets
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 2. Product Interface Preview ──────────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Platform Preview</h2>
                            <p className="mt-1 text-sm font-semibold text-white">Live Orchestration Console</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono text-[#666666]">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            <span>System Normal</span>
                        </div>
                    </div>

                    {/* Console mock shell */}
                    <div className="overflow-hidden rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                        {/* Terminal title bar */}
                        <div className="flex items-center justify-between border-b border-[#1F1F1F] bg-[#111111] px-4 py-2.5 font-mono text-xs text-[#A1A1A1]">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#1F1F1F]" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#1F1F1F]" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#1F1F1F]" />
                                </div>
                                <span className="ml-2 text-[#666666]">deployforge-console — v1.0.0</span>
                            </div>
                            <div className="flex items-center gap-4 text-[11px] text-[#666666]">
                                <span>BRANCH: main</span>
                                <span>PROTOCOL: SSH2</span>
                            </div>
                        </div>

                        {/* Interactive Console Content */}
                        <LandingConsolePreview />
                    </div>
                </div>
            </section>

            {/* ── 3. Core Features Grid ─────────────────────────────────── */}
            <section id="features" className="border-b border-[#1F1F1F] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Platform Features</h2>
                        <p className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Everything required to operate self-hosted infrastructure.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {CORE_FEATURES.map((f) => {
                            const Icon = f.icon;
                            return (
                                <div
                                    key={f.title}
                                    className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 transition-colors hover:border-[#333333]"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#111111] text-white">
                                        <Icon size={16} />
                                    </div>
                                    <h3 className="mt-4 text-sm font-semibold text-white">{f.title}</h3>
                                    <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">{f.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── 4. How It Works / Workflow Pipeline ────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Deployment Flow</h2>
                        <p className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            From git push to live production container.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {WORKFLOW_STEPS.map((s) => (
                            <div key={s.step} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                                <span className="font-mono text-xs font-bold text-[#666666]">{s.step}</span>
                                <h3 className="mt-3 text-sm font-semibold text-white">{s.title}</h3>
                                <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">{s.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── 5. Technical Architecture Section ─────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                        <div>
                            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Architecture</h2>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                                Built for complete data sovereignty and operational control.
                            </p>
                            <p className="mt-4 text-xs leading-relaxed text-[#A1A1A1]">
                                DeployForge keeps control plane operations decoupled from target server runtimes.
                                Application code, secrets, and customer data remain strictly on your owned infrastructure.
                            </p>

                            <div className="mt-6 space-y-3 font-mono text-xs">
                                <div className="flex items-start gap-3 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-3">
                                    <Cpu size={15} className="text-white shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-white">BullMQ & Redis Task Queues</p>
                                        <p className="text-[11px] text-[#A1A1A1]">Asynchronous deployment jobs with retry policies and execution history logs.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-3">
                                    <Activity size={15} className="text-white shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-white">Fastify & WebSocket Control Engine</p>
                                        <p className="text-[11px] text-[#A1A1A1]">Low-overhead REST API with real-time WebSocket log and web terminal streaming.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Code / Config architecture specification box */}
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 font-mono text-xs leading-relaxed">
                            <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3 text-[#666666]">
                                <span>deployforge.config.json</span>
                                <span>JSON SCHEMA</span>
                            </div>
                            <pre className="mt-4 overflow-x-auto text-[#A1A1A1]">
{`{
  "platform": "deployforge",
  "version": "1.0.0",
  "controlPlane": {
    "engine": "fastify-prisma",
    "queue": "bullmq-redis",
    "security": "aes-256-gcm"
  },
  "deployment": {
    "protocol": "ssh2",
    "strategy": "blue-green",
    "proxy": "nginx-certbot",
    "isolation": "docker-sandbox"
  }
}`}
                            </pre>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 6. Final CTA Section ──────────────────────────────────── */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 sm:p-12">
                    <div className="max-w-xl">
                        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Deploy on your own infrastructure today.
                        </h2>
                        <p className="mt-3 text-xs leading-relaxed text-[#A1A1A1]">
                            Connect your GitHub repositories to your Virtual Private Servers with automated builds and zero-downtime releases.
                        </p>
                        <LandingCtaButtons />
                    </div>
                </div>
            </section>

        </main>
    );
}
