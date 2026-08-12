'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    BookOpen,
    CheckCircle2,
    Search,
    ChevronRight
} from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import clsx from 'clsx';

interface DocSection {
    id: string;
    title: string;
    category: string;
    tag?: string;
    description: string;
    items: string[];
    codeBlock?: {
        title: string;
        language: string;
        code: string;
    };
}

const DOC_SECTIONS: DocSection[] = [
    {
        id: 'overview',
        title: 'Platform Architecture & Overview',
        category: 'FOUNDATION',
        description: 'DeployForge is an open-source, self-hosted PaaS orchestrator designed for GitHub-connected projects running on VPS infrastructure you control.',
        items: [
            'Bridges the gap between modern cloud platform developer experience and full server ownership.',
            'Decouples the control plane (Fastify API, Prisma PostgreSQL, BullMQ Redis queues) from runtime execution on target servers.',
            'Communicates with target servers strictly over secure agentless SSH2 — zero proprietary daemons or agents required on target VPS nodes.'
        ],
        codeBlock: {
            title: 'deployforge.config.json',
            language: 'json',
            code: `{
  "platform": "deployforge",
  "version": "1.0.0",
  "controlPlane": {
    "apiEngine": "fastify-prisma",
    "queueDriver": "bullmq-redis",
    "vaultEncryption": "aes-256-gcm"
  },
  "runtime": {
    "protocol": "ssh2",
    "isolation": "docker-sandbox",
    "strategy": "blue-green",
    "proxy": "nginx-certbot"
  }
}`
        }
    },
    {
        id: 'getting-started',
        title: 'Getting Started Quickstart',
        category: 'GETTING STARTED',
        description: 'Follow this 4-step path to connect your identity, source code, VPS server target, and launch your first release.',
        items: [
            '1. Account Setup & GitHub OAuth: Sign in to DeployForge console and authorize GitHub OAuth to grant repository read access.',
            '2. Provision Target VPS: Attach your Ubuntu 22.04 LTS server credentials over SSH and verify host key connectivity.',
            '3. Configure Project: Select a synchronized GitHub repository, branch, build command, and environment secret values.',
            '4. Trigger First Deployment: Launch build job to compile Docker container, run health check, and route Nginx traffic.'
        ],
        codeBlock: {
            title: 'local-setup.sh',
            language: 'bash',
            code: `# 1. Clone repository & install dependencies
git clone https://github.com/akramhossain-dev/DeployForge.git
cd DeployForge && pnpm install

# 2. Sync database schema & generate Prisma Client
pnpm db:push && pnpm db:generate

# 3. Launch development servers (API: 3001, Web: 3000)
pnpm dev`
        }
    },
    {
        id: 'github-integration',
        title: 'GitHub OAuth & Webhook Automation',
        category: 'SOURCE CONTROL',
        description: 'GitHub serves as the source control provider for repository synchronization and automated continuous deployment triggers.',
        items: [
            'OAuth authorization stores scoped access tokens in the AES-256 vault for repository tree listing and branch detection.',
            'Automatic webhook receivers listen for branch push events and validate HMAC SHA-256 signatures before queueing build jobs.',
            'Multi-branch deployment mapping supports separate environments (.env.production for main branch, .env.staging for dev branch).'
        ],
        codeBlock: {
            title: 'webhook-signature.ts',
            language: 'typescript',
            code: `// Validate GitHub Webhook HMAC Signature
import crypto from 'node:crypto';

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}`
        }
    },
    {
        id: 'vps-management',
        title: 'VPS Provisioning & SSH Driver',
        category: 'INFRASTRUCTURE',
        description: 'Servers are managed as first-class deployment targets with automated SSH key validation and connection pooling.',
        items: [
            'Connect any standard Ubuntu server (20.04/22.04/24.04 LTS) by supplying IP, port, username, and SSH private key credentials.',
            'Agentless driver executes remote commands (\`docker build\`, \`docker run\`, \`nginx -s reload\`) without installing background daemons.',
            'Connection pool maintains persistent SSH sessions with automatic health checks and reconnect backoff logic.'
        ],
        codeBlock: {
            title: 'ssh-probe.sh',
            language: 'bash',
            code: `# Verification command executed during VPS connection test:
ssh -i ~/.ssh/deployforge_key -p 22 root@192.168.1.100 \\
  "docker --version && nginx -v && ufw status"

# Expected Output:
# Docker version 26.0.0, build 2ae908d
# nginx version: nginx/1.24.0
# Status: active`
        }
    },
    {
        id: 'deployment-engine',
        title: 'Docker Build Engine & Blue-Green Releases',
        category: 'DEPLOYMENT',
        description: 'The release engine builds isolated Docker images and switches traffic with zero downtime using Blue-Green routing.',
        items: [
            'Build detection parses project configuration and generates runtime Dockerfiles for Next.js, Node.js, Fastify, Vite, and Python.',
            'Parallel release container is spawned on an ephemeral host port while the active container continues serving production traffic.',
            'Automated HTTP health check probes confirm 200 OK responses before Nginx updates upstream pointers and drains old containers.'
        ],
        codeBlock: {
            title: 'nginx-upstream-switch.conf',
            language: 'nginx',
            code: `# Dynamic Nginx Blue-Green Upstream Target
upstream deployforge_app_service {
    # Blue  (Previous container): 127.0.0.1:3001 [DRAINING]
    # Green (New release container): 127.0.0.1:3002 [ACTIVE]
    server 127.0.0.1:3002 max_fails=3 fail_timeout=5s;
}`
        }
    },
    {
        id: 'nginx-ssl',
        title: 'Nginx Reverse Proxy & Certbot TLS',
        tag: 'NETWORKING',
        category: 'NETWORKING',
        description: 'Dynamic Nginx reverse proxy generation with automated Let\'s Encrypt SSL/TLS certificate issuance and background renewal.',
        items: [
            'Generates hardened Nginx server blocks per domain with HTTP/2, TLS 1.3, and security headers enabled.',
            'Certbot ACME HTTP-01 challenge handler automatically issues valid TLS certificates for custom domains.',
            'Background cron job checks certificate expiration and triggers zero-downtime renewals every 60 days.'
        ],
        codeBlock: {
            title: 'nginx-vhost.conf',
            language: 'nginx',
            code: `server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://deployforge_app_service;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`
        }
    },
    {
        id: 'secrets-env',
        title: 'Secrets Vault & Environment Variables',
        category: 'SECURITY',
        description: 'Multi-environment secret storage protected with AES-256-GCM encryption at rest and deployment-time injection.',
        items: [
            'Environment values are encrypted using AES-256-GCM before database insertion and decrypted only in worker memory.',
            'Supports multi-file tabbed management (.env.production, .env.staging, .env.preview) per project.',
            'Secrets are injected securely into Docker container environment files during build execution without touching disk in plaintext.'
        ],
        codeBlock: {
            title: 'encryption-vault.ts',
            language: 'typescript',
            code: `// AES-256-GCM Encrypted Secret Vault
import crypto from 'node:crypto';

export function encryptSecret(text: string, masterKey: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { ciphertext: encrypted, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}`
        }
    },
    {
        id: 'terminal-logs',
        title: 'Web Terminal, Logs & VPS File Explorer',
        category: 'OPERATIONS',
        description: 'In-browser operational tools for SSH terminal access, container log streaming, and remote file management.',
        items: [
            'Web SSH Terminal: Built with xterm.js and WebSockets, enabling full interactive shell access to registered servers.',
            'Live Log Streamer: Real-time container log output streaming with regex search and level filtering.',
            'VPS File Explorer: Web file manager supporting directory tree browsing, inline code editing, path search, and SFTP transfers.'
        ],
        codeBlock: {
            title: 'terminal-stream.sh',
            language: 'bash',
            code: `# WebSocket Terminal Session Stream
$ ssh root@192.168.1.100
root@vps-prod-01:~# docker logs -f --tail 50 deployforge-api-v1.4.2
[22:45:12] INFO: Fastify server listening on http://0.0.0.0:3001
[22:45:15] INFO: PostgreSQL connection pool active (20 connections)
[22:45:18] INFO: BullMQ Redis worker listening for deployment jobs`
        }
    },
    {
        id: 'admin-security',
        title: 'Admin Control Panel & Security Hardening',
        category: 'ADMINISTRATION',
        description: 'Enterprise access controls, admin management surfaces, rate limiting, and brute-force protection.',
        items: [
            'Role-Based Access Control (RBAC): Differentiates regular developers from super admins with protected routes.',
            'Authentication Security: Argon2id password hashing, double-submit CSRF tokens, and JWT session handling.',
            'Brute-Force Lockout & Rate Limiting: Fastify rate limit plugin blocks ip addresses after repeated failed login attempts.'
        ],
        codeBlock: {
            title: 'security-headers.ts',
            language: 'typescript',
            code: `// Fastify Security & Helmet Configuration
await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"]
    }
  }
});`
        }
    }
];

export default function DocsPage() {
    const auth = useAuthSession();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [activeSectionId, setActiveSectionId] = useState<string>('overview');

    const primaryHref = auth.isAuthenticated ? '/dashboard' : '/register';
    const primaryLabel = auth.isAuthenticated ? 'Open Console' : 'Get Started';

    // Filter documentation sections based on search query and category tab
    const filteredSections = DOC_SECTIONS.filter(sec => {
        const matchesQuery = searchQuery === '' ||
            sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            sec.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            sec.items.some(i => i.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesCategory = activeCategory === 'all' || sec.category.toLowerCase() === activeCategory.toLowerCase();

        return matchesQuery && matchesCategory;
    });

    const categories = ['all', ...Array.from(new Set(DOC_SECTIONS.map(s => s.category)))];

    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Header Section ────────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 pb-12 pt-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        {/* Eyebrow */}
                        <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                            <BookOpen size={13} className="text-white" />
                            <span>DEPLOYFORGE — DOCUMENTATION</span>
                        </div>

                        {/* Title */}
                        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                            DeployForge Documentation
                        </h1>

                        {/* Description */}
                        <p className="mt-4 text-base leading-relaxed text-[#A1A1A1] sm:text-lg">
                            Technical reference guide for connecting source repositories, provisioning VPS servers, configuring zero-downtime Blue-Green releases, and managing encrypted secrets.
                        </p>

                        {/* Search Input Box */}
                        <div className="relative mt-6 max-w-md">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search documentation (e.g. SSH, Nginx, Blue-Green, Vault)..."
                                className="w-full rounded-md border border-[#1F1F1F] bg-[#0A0A0A] py-2 pl-9 pr-4 text-xs font-mono text-white outline-none placeholder:text-[#666666] focus:border-[#333333] focus:ring-1 focus:ring-[#333333]"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 2. Documentation Main Grid (Sidebar + Content) ────────── */}
            <section className="border-b border-[#1F1F1F] px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-12">

                    {/* Left Sticky Sidebar Navigation (3 cols) */}
                    <aside className="lg:col-span-3 lg:sticky lg:top-20 lg:self-start">
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 font-mono text-xs space-y-4">
                            <div>
                                <p className="border-b border-[#1F1F1F] pb-2 font-semibold uppercase tracking-wider text-[#666666]">
                                    CATEGORIES
                                </p>
                                <div className="mt-2.5 flex flex-wrap gap-1">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setActiveCategory(cat)}
                                            className={clsx(
                                                'rounded px-2 py-1 text-[10px] uppercase transition-colors',
                                                activeCategory === cat
                                                    ? 'bg-[#111111] text-white border border-[#1F1F1F]'
                                                    : 'text-[#A1A1A1] hover:text-white'
                                            )}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="border-b border-[#1F1F1F] pb-2 font-semibold uppercase tracking-wider text-[#666666]">
                                    NAVIGATION
                                </p>
                                <nav className="mt-2.5 space-y-1">
                                    {DOC_SECTIONS.map((sec) => {
                                        const isActive = activeSectionId === sec.id;
                                        return (
                                            <a
                                                key={sec.id}
                                                href={`#${sec.id}`}
                                                onClick={() => setActiveSectionId(sec.id)}
                                                className={clsx(
                                                    'flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors',
                                                    isActive
                                                        ? 'bg-[#111111] font-semibold text-white border-l-2 border-white'
                                                        : 'text-[#A1A1A1] hover:bg-[#111111]/60 hover:text-white'
                                                )}
                                            >
                                                <span className="truncate">{sec.title}</span>
                                                <ChevronRight size={12} className={clsx('shrink-0', isActive ? 'text-white' : 'text-[#666666]')} />
                                            </a>
                                        );
                                    })}
                                </nav>
                            </div>
                        </div>
                    </aside>

                    {/* Right Documentation Content Column (9 cols) */}
                    <div className="space-y-8 lg:col-span-9">
                        {filteredSections.length === 0 ? (
                            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center font-mono text-xs text-[#A1A1A1]">
                                <p>No documentation topics matched &quot;{searchQuery}&quot;.</p>
                                <button
                                    onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
                                    className="mt-3 text-white underline hover:text-[#A1A1A1]"
                                >
                                    Clear search filters
                                </button>
                            </div>
                        ) : (
                            filteredSections.map((section) => (
                                <article
                                    key={section.id}
                                    id={section.id}
                                    className="scroll-mt-20 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 lg:p-8"
                                >
                                    {/* Section Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F1F] pb-4 font-mono text-xs">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#666666]">
                                            {section.category}
                                        </span>
                                        <a href={`#${section.id}`} className="text-[11px] text-[#666666] hover:text-white">
                                            #{section.id}
                                        </a>
                                    </div>

                                    <h2 className="mt-4 text-xl font-bold tracking-tight text-white sm:text-2xl">
                                        {section.title}
                                    </h2>

                                    <p className="mt-2 text-sm leading-relaxed text-[#A1A1A1]">
                                        {section.description}
                                    </p>

                                    {/* Bullet Items */}
                                    <div className="mt-5 space-y-2 font-mono text-xs text-[#A1A1A1]">
                                        {section.items.map((item, idx) => (
                                            <div key={idx} className="flex items-start gap-2.5 rounded border border-[#1F1F1F] bg-[#000000] p-3">
                                                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                                                <span className="leading-relaxed">{item}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Code Example Block */}
                                    {section.codeBlock && (
                                        <div className="mt-6 overflow-hidden rounded-md border border-[#1F1F1F] bg-[#000000]">
                                            <div className="flex items-center justify-between border-b border-[#1F1F1F] bg-[#111111] px-4 py-2 font-mono text-[11px] text-[#666666]">
                                                <span className="text-white">{section.codeBlock.title}</span>
                                                <span className="uppercase">{section.codeBlock.language}</span>
                                            </div>
                                            <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-[#A1A1A1]">
                                                {section.codeBlock.code}
                                            </pre>
                                        </div>
                                    )}
                                </article>
                            ))
                        )}
                    </div>

                </div>
            </section>

            {/* ── 3. Final Product CTA ──────────────────────────────────── */}
            <section className="px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 sm:p-10">
                    <div className="max-w-xl">
                        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Ready to launch on your infrastructure?
                        </h2>
                        <p className="mt-2 text-xs leading-relaxed text-[#A1A1A1]">
                            Open the console, register your Virtual Private Server, and deploy your first application with zero downtime.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <Link
                                href={primaryHref}
                                className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-4 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                            >
                                <span>{primaryLabel}</span>
                                <ArrowRight size={13} />
                            </Link>
                            <Link
                                href="/features"
                                className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-[#111111] px-4 text-xs font-medium text-white transition-colors hover:bg-[#1F1F1F]"
                            >
                                <span>Platform Features</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

        </main>
    );
}
