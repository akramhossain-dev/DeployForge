'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    CheckCircle2,
    Cpu,
    Database,
    FileText,
    GitCommit,
    Github,
    Globe,
    HardDrive,
    KeyRound,
    Lock,
    Rocket,
    Server,
    ShieldCheck,
    Sliders,
    Terminal,
    Zap,
    Activity,
    FolderKanban,
    RotateCcw,
    Check,
    ChevronRight
} from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import clsx from 'clsx';

// Core feature categories for the interactive subsystem explorer
const FEATURE_CATEGORIES = [
    {
        id: 'orchestration',
        name: 'SSH Orchestration',
        tag: 'AGENTLESS PROTOCOL',
        title: 'Agentless VPS Control over Secure SSH',
        description: 'Connect standard Ubuntu servers using standard SSH key pairs. DeployForge manages dependencies, builds Docker images, and configures runtime services over SSH without third-party agent daemons.',
        highlights: [
            'No agent installation or background daemons on target servers',
            'SSH key-based authentication with automated connection pool management',
            'Supports multi-server inventories and custom port configurations',
            'Pre-flight connection health probes and environment checks'
        ],
        codeSnippet: `// SSH2 Agentless Execution Flow
const connection = await vpsPool.acquire({
  host: "192.168.1.100",
  port: 22,
  username: "root",
  privateKey: encryptedKey
});

await connection.exec("docker build -t app:v1.4.2 .");
await connection.exec("docker run -d --name app-v1.4.2 app:v1.4.2");`
    },
    {
        id: 'bluegreen',
        name: 'Blue-Green Deployments',
        tag: 'ZERO-DOWNTIME',
        title: 'Zero-Downtime Traffic Switching & Instant Rollbacks',
        description: 'Every release builds inside a new parallel container. DeployForge runs HTTP health checks against the new container before updating Nginx upstream targets, ensuring existing connections are never dropped.',
        highlights: [
            'Parallel container isolation during build and verification steps',
            'Automated HTTP health check verification before traffic switch',
            'Instant single-click rollbacks to previous container release images',
            'Zero-downtime Nginx reload with active connection draining'
        ],
        codeSnippet: `// Nginx Upstream Traffic Switch
upstream deployforge_app {
    # Blue (Active): Container app_v1.4.1 -> Draining
    # Green (New):    Container app_v1.4.2 -> 100% Traffic
    server 127.0.0.1:3002 max_fails=3 fail_timeout=5s;
}`
    },
    {
        id: 'networking',
        name: 'Nginx & Let\'s Encrypt',
        tag: 'DYNAMIC PROXY',
        title: 'Zero-Config Reverse Proxy & Automatic SSL',
        description: 'DeployForge automatically generates Nginx vhost configurations and manages Let’s Encrypt SSL/TLS certificates via Certbot, including automatic 90-day background renewal.',
        highlights: [
            'Dynamic Nginx server block generation per domain',
            'Automated HTTP-01 ACME challenge for Let\'s Encrypt TLS',
            'Automatic SSL certificate renewal background cron workers',
            'Custom domain aliases and wildcard routing options'
        ],
        codeSnippet: `// Dynamic VHost Template
server {
    listen 443 ssl http2;
    server_name app.example.com;
    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
}`
    },
    {
        id: 'envvault',
        name: 'Secrets & Environment',
        tag: 'AES-256 ENCRYPTION',
        title: 'Multi-Environment Secret Management',
        description: 'Manage project environment variables across production, staging, and preview environments with AES-256-GCM encryption at rest and seamless injection at deployment time.',
        highlights: [
            'AES-256-GCM encryption at rest with master key derivation',
            'Tabbed multi-environment file editor (.env.production, .env.staging)',
            'Deployment-time secret injection directly into Docker containers',
            'Masked values in UI with explicit permission-gated reveals'
        ],
        codeSnippet: `# Encrypted Environment Storage
DATABASE_URL="postgresql://user:***@localhost:5432/db"  [AES-256-GCM]
JWT_SECRET="****************************************"  [AES-256-GCM]
API_KEY="sk_live_********************************"     [AES-256-GCM]`
    },
    {
        id: 'terminal',
        name: 'Terminal & Web SSH',
        tag: 'WEBSOCKET STREAMING',
        title: 'Browser-Based Interactive SSH & Container Logs',
        description: 'Debug production issues directly in the browser. Interactive SSH terminal powered by xterm.js and WebSockets gives full command-line access to registered servers and containers.',
        highlights: [
            'Full terminal emulation via xterm.js and WebSocket streams',
            'Real-time streaming deployment logs with search and filter',
            'Container-level execution (\`docker exec -it\`) or full VPS SSH',
            'Session timeout controls and audit logging'
        ],
        codeSnippet: `// Terminal Stream Session
$ ssh root@192.168.1.100
Linux ubuntu-22-04-lts 5.15.0-91-generic x86_64
root@vps-01:~# docker ps --format "table {{.ID}}\\t{{.Image}}\\t{{.Status}}"
CONTAINER ID   IMAGE        STATUS
8f19a023b12c   app:v1.4.2   Up 4 hours (healthy)`
    },
    {
        id: 'monitoring',
        name: 'Metrics & Backups',
        tag: 'SYSTEM VISIBILITY',
        title: 'Server Resource Metrics & Automated Database Backups',
        description: 'Track CPU, RAM, Disk, and Network metrics in real time. Set custom alert thresholds and trigger automated database backup exports with one-click restore capabilities.',
        highlights: [
            'Real-time CPU, RAM, Disk, and Swap metrics collection',
            'Configurable per-user resource usage alert thresholds',
            'Automated PostgreSQL database dump exports to local storage',
            'One-click database backup restoration workflow'
        ],
        codeSnippet: `// System Health & Threshold Status
CPU Usage:    12.4%  [Normal]
RAM Usage:    412 MB / 4096 MB (10.0%) [Normal]
Disk Space:   14.2 GB / 80.0 GB (17.7%) [Normal]
Backup Status: Automated daily dump complete (24.1 MB)`
    }
];

// Workflow pipeline steps
const PIPELINE_STEPS = [
    {
        number: '01',
        title: 'Git Push Event',
        sub: 'SOURCE CONTROL',
        desc: 'Developer pushes code to a monitored GitHub branch. Fastify webhook handler receives payload and validates HMAC signature.'
    },
    {
        number: '02',
        title: 'BullMQ Queue Dispatch',
        sub: 'TASK ORCHESTRATION',
        desc: 'Build job is pushed to Redis queue. Workers pick up job, fetch credentials from AES-256 vault, and establish SSH session.'
    },
    {
        number: '03',
        title: 'Docker Image Build',
        sub: 'CONTAINER RUNTIME',
        desc: 'VPS pulls repository commit over SSH, compiles runtime inside Docker sandbox profile, and tags new release image.'
    },
    {
        number: '04',
        title: 'Zero-Downtime Release',
        sub: 'NGINX ROUTING',
        desc: 'HTTP health check confirms container readiness. Nginx reloads upstream routes, switching live traffic with 0ms downtime.'
    }
];

// Architecture table entries
const ARCHITECTURE_LAYERS = [
    { component: 'Frontend Console', tech: 'Next.js 14 App Router, React 18, Tailwind CSS, xterm.js', role: 'Dashboard UI, web terminal, deployment control surfaces' },
    { component: 'Backend API Engine', tech: 'Fastify, TypeScript, Pino Logger, WebSockets', role: 'REST API endpoints, webhook receivers, live streaming' },
    { component: 'Task Queue Manager', tech: 'BullMQ, ioredis, Redis 7', role: 'Asynchronous deployment jobs, retries, and task queues' },
    { component: 'Database & Schema', tech: 'PostgreSQL 16, Prisma ORM', role: 'Relational storage for users, VPS nodes, apps, and audit logs' },
    { component: 'Agentless SSH Driver', tech: 'SSH2 Node module, SFTP', role: 'Direct VPS command execution, file sync, and container ops' },
    { component: 'Security & Vault', tech: 'AES-256-GCM, Argon2id, Crypto', role: 'Encrypted env variables, password hashing, HMAC webhooks' },
    { component: 'Proxy & TLS', tech: 'Nginx 1.27 Alpine, Certbot ACME', role: 'Dynamic reverse proxy routing & auto Let\'s Encrypt SSL' },
];

export default function FeaturesPage() {
    const auth = useAuthSession();
    const [activeTab, setActiveTab] = useState('orchestration');
    const selectedFeature = FEATURE_CATEGORIES.find(f => f.id === activeTab) || FEATURE_CATEGORIES[0];

    const primaryHref = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Open Console' : 'Get Started';

    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Page Header ────────────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 pb-16 pt-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        {/* Small Eyebrow */}
                        <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>DeployForge — Platform Capabilities</span>
                        </div>

                        {/* Confident Restrained Headline */}
                        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                            Infrastructure control for self-hosted server fleets.
                        </h1>

                        {/* Supporting Description */}
                        <p className="mt-4 text-base leading-relaxed text-[#A1A1A1] sm:text-lg">
                            DeployForge connects your source repositories to Virtual Private Servers over agentless SSH.
                            Orchestrate container builds, dynamic Nginx routing, encrypted secrets, and zero-downtime releases from a single interface.
                        </p>

                        {/* Actions */}
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

                        {/* Spec Pills */}
                        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#1F1F1F] pt-5 text-xs font-mono text-[#666666]">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> Agentless SSH2
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> Blue-Green Zero Downtime
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> Auto Certbot SSL
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-white" /> AES-256 Vault
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 2. Feature Overview (Interactive Subsystem Explorer) ───── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-8">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Subsystem Capabilities</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Engineered around actual operational requirements.
                        </p>
                    </div>

                    {/* Subsystem Tabs */}
                    <div className="flex flex-wrap gap-1.5 border-b border-[#1F1F1F] pb-3">
                        {FEATURE_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={clsx(
                                    'rounded-md px-3 py-1.5 text-xs font-mono transition-colors',
                                    activeTab === cat.id
                                        ? 'border border-[#1F1F1F] bg-[#111111] font-semibold text-white'
                                        : 'text-[#A1A1A1] hover:bg-[#0A0A0A] hover:text-white'
                                )}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    {/* Active Subsystem Detail View */}
                    <div className="mt-6 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 lg:p-8">
                        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">

                            {/* Left Description & Specs (7 cols) */}
                            <div className="space-y-6 lg:col-span-7">
                                <div>
                                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
                                        {selectedFeature.tag}
                                    </span>
                                    <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">
                                        {selectedFeature.title}
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-[#A1A1A1]">
                                        {selectedFeature.description}
                                    </p>
                                </div>

                                <div className="space-y-2 border-t border-[#1F1F1F] pt-4">
                                    <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">KEY CAPABILITIES</p>
                                    <ul className="space-y-2">
                                        {selectedFeature.highlights.map((item, idx) => (
                                            <li key={idx} className="flex items-start gap-2.5 text-xs text-[#A1A1A1]">
                                                <Check size={14} className="mt-0.5 shrink-0 text-white" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Right Code / Config Console Preview (5 cols) */}
                            <div className="lg:col-span-5">
                                <div className="overflow-hidden rounded-md border border-[#1F1F1F] bg-[#000000]">
                                    <div className="flex items-center justify-between border-b border-[#1F1F1F] bg-[#111111] px-3.5 py-2 font-mono text-[11px] text-[#666666]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full bg-[#1F1F1F]" />
                                            <span className="text-white">{selectedFeature.id}.spec.ts</span>
                                        </div>
                                        <span>EXECUTION CONSOLE</span>
                                    </div>
                                    <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-[#A1A1A1]">
                                        {selectedFeature.codeSnippet}
                                    </pre>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </section>

            {/* ── 3. Deployment Workflow ────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Deployment Flow</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Repository to running service in four steps.
                        </p>
                    </div>

                    {/* Step Cards Grid */}
                    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {PIPELINE_STEPS.map((s) => (
                            <div key={s.number} className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                                <div className="flex items-center justify-between font-mono">
                                    <span className="text-xs font-bold text-white">{s.number}</span>
                                    <span className="text-[10px] text-[#666666]">{s.sub}</span>
                                </div>
                                <h3 className="mt-3 text-sm font-semibold text-white">{s.title}</h3>
                                <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">{s.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* Technical Interface Preview Box */}
                    <div className="mt-8 overflow-hidden rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                        {/* Status Header Bar */}
                        <div className="flex flex-wrap items-center justify-between border-b border-[#1F1F1F] bg-[#111111] px-4 py-2.5 font-mono text-xs text-[#A1A1A1]">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1.5 font-semibold text-white">
                                    <GitCommit size={14} className="text-emerald-400" />
                                    deployforge-api / main
                                </span>
                                <span className="text-[#666666]">commit 9d42e1a</span>
                            </div>
                            <div className="flex items-center gap-4 text-[11px]">
                                <span className="text-[#666666]">ENV: production</span>
                                <span className="rounded bg-[#000000] px-2 py-0.5 text-emerald-400 border border-[#1F1F1F]">STATUS: SUCCESS</span>
                            </div>
                        </div>

                        {/* Pipeline Details & Log Output */}
                        <div className="grid gap-6 p-5 lg:grid-cols-3">
                            <div className="space-y-3 font-mono text-xs lg:col-span-1">
                                <div className="rounded-md border border-[#1F1F1F] bg-[#000000] p-3">
                                    <p className="text-[11px] text-[#666666]">PIPELINE METADATA</p>
                                    <div className="mt-2 space-y-1.5 text-[11px]">
                                        <div className="flex justify-between">
                                            <span className="text-[#A1A1A1]">Target VPS</span>
                                            <span className="text-white">vps-prod-01 (192.168.1.100)</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#A1A1A1]">Build Duration</span>
                                            <span className="text-white">34.2 seconds</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#A1A1A1]">Container Image</span>
                                            <span className="text-white">deployforge-api:v1.4.2</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#A1A1A1]">Strategy</span>
                                            <span className="text-emerald-400">Blue-Green Zero-Downtime</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-md border border-[#1F1F1F] bg-[#000000] p-3 font-mono text-[11px] leading-relaxed text-[#A1A1A1] lg:col-span-2">
                                <p className="text-[#666666]">[18:10:01] Fetching webhook commit 9d42e1a from github.com/akramhossain-dev/DeployForge</p>
                                <p className="text-[#666666]">[18:10:04] Establishing SSH session with root@192.168.1.100:22 ... OK</p>
                                <p className="text-white">[18:10:18] Docker build complete: tagged deployforge-api:v1.4.2</p>
                                <p className="text-white">[18:10:22] Container deployforge-api-v1.4.2 started on port 3002</p>
                                <p className="text-[#666666]">[18:10:25] Executing health check probe: GET http://127.0.0.1:3002/live ... 200 OK</p>
                                <p className="text-emerald-400">[18:10:26] Reloaded Nginx reverse proxy. Traffic routed to v1.4.2. Drained v1.4.1.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 4. Projects & Environment Secrets ─────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
                        <div className="space-y-4 lg:col-span-5">
                            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Secret Management</h2>
                            <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                                Multi-environment secrets encrypted with AES-256-GCM.
                            </h3>
                            <p className="text-sm leading-relaxed text-[#A1A1A1]">
                                Store API keys, tokens, and database URIs safely. Environment values are stored with AES-256-GCM authenticated encryption at rest and injected directly into container runtimes at deploy time.
                            </p>
                            <div className="space-y-2 font-mono text-xs text-[#A1A1A1]">
                                <div className="flex items-center gap-2">
                                    <Lock size={13} className="text-white" />
                                    <span>Argon2id auth & master key derivation</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <KeyRound size={13} className="text-white" />
                                    <span>Environment separation (.env.production / .env.staging)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={13} className="text-white" />
                                    <span>Masked UI display with role-gated reveals</span>
                                </div>
                            </div>
                        </div>

                        {/* Interactive UI Mockup for Secrets */}
                        <div className="lg:col-span-7">
                            <div className="overflow-hidden rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                                <div className="flex items-center justify-between border-b border-[#1F1F1F] bg-[#111111] px-4 py-2.5 font-mono text-xs">
                                    <div className="flex items-center gap-2 text-white">
                                        <Sliders size={13} />
                                        <span>Environment Variables — deployforge-api</span>
                                    </div>
                                    <span className="text-[11px] text-emerald-400">ENCRYPTION: AES-256-GCM</span>
                                </div>

                                <div className="p-4 font-mono text-xs space-y-2">
                                    <div className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-2.5">
                                        <div>
                                            <p className="font-semibold text-white">DATABASE_URL</p>
                                            <p className="text-[11px] text-[#666666]">postgresql://postgres:***@127.0.0.1:5432/deployforge</p>
                                        </div>
                                        <span className="rounded bg-[#111111] px-2 py-0.5 text-[10px] text-[#A1A1A1] border border-[#1F1F1F]">ENCRYPTED</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-2.5">
                                        <div>
                                            <p className="font-semibold text-white">JWT_SECRET</p>
                                            <p className="text-[11px] text-[#666666]">195f9a4ddfbb1a3ba50065560eab1bc34730dbdfc6c5d21...</p>
                                        </div>
                                        <span className="rounded bg-[#111111] px-2 py-0.5 text-[10px] text-[#A1A1A1] border border-[#1F1F1F]">ENCRYPTED</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-2.5">
                                        <div>
                                            <p className="font-semibold text-white">REDIS_URL</p>
                                            <p className="text-[11px] text-[#666666]">redis://:deployforge_redis_pass_123@127.0.0.1:6380</p>
                                        </div>
                                        <span className="rounded bg-[#111111] px-2 py-0.5 text-[10px] text-[#A1A1A1] border border-[#1F1F1F]">ENCRYPTED</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 5. Build, Logs & Monitoring ─────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Runtime Control</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Real-time monitoring, web terminal, and file inspection.
                        </p>
                    </div>

                    <div className="mt-8 grid gap-6 md:grid-cols-3">
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                            <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white">
                                <Terminal size={14} />
                            </div>
                            <h3 className="mt-3 text-sm font-semibold text-white">Web SSH Terminal</h3>
                            <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">
                                Full browser-based SSH terminal powered by xterm.js and WebSockets. Inspect processes, debug containers, and manage system packages securely.
                            </p>
                        </div>

                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                            <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white">
                                <FolderKanban size={14} />
                            </div>
                            <h3 className="mt-3 text-sm font-semibold text-white">VPS File Explorer</h3>
                            <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">
                                Browse server file trees, edit configuration files inline with syntax highlighting, search paths, and transfer files via integrated SFTP protocol.
                            </p>
                        </div>

                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                            <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white">
                                <Activity size={14} />
                            </div>
                            <h3 className="mt-3 text-sm font-semibold text-white">Alerts & Database Backups</h3>
                            <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">
                                Track CPU, RAM, and Disk metrics. Set threshold alerts and execute scheduled PostgreSQL backups with one-click restoration triggers.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 6. Technical Architecture Layers ───────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-2xl">
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">Internal Architecture</h2>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Decoupled control plane & runtime primitives.
                        </p>
                    </div>

                    <div className="mt-8 overflow-hidden rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left font-mono text-xs">
                                <thead className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">COMPONENT</th>
                                        <th className="px-4 py-3 font-semibold">TECHNOLOGY STACK</th>
                                        <th className="px-4 py-3 font-semibold">ROLE & FUNCTION</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                                    {ARCHITECTURE_LAYERS.map((row) => (
                                        <tr key={row.component} className="transition-colors hover:bg-[#111111]/50">
                                            <td className="px-4 py-3 font-semibold text-white">{row.component}</td>
                                            <td className="px-4 py-3 text-emerald-400">{row.tech}</td>
                                            <td className="px-4 py-3 text-[#A1A1A1]">{row.role}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 7. Final Product CTA ──────────────────────────────────── */}
            <section className="px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 sm:p-10">
                    <div className="max-w-xl">
                        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Operate self-hosted infrastructure with DeployForge.
                        </h2>
                        <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">
                            Connect your GitHub repositories to Virtual Private Servers over SSH. Automate builds, TLS certificates, and zero-downtime releases today.
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
