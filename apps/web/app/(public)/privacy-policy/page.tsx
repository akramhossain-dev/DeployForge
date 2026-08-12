'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck, FileText } from 'lucide-react';

const SECTIONS = [
    {
        number: '1',
        title: 'Data Collection Policy',
        slug: 'data-collection',
        body: 'DeployForge collects only the data needed to operate a self-hosted deployment workflow.',
        points: [
            'GitHub OAuth data can include account identity, username, email, avatar, repository metadata, branch data, and webhook configuration details.',
            'VPS data can include hostnames, IP addresses, ports, usernames, encrypted credentials, health checks, and deployment target metadata.',
            'Operational data can include deployment logs, terminal session metadata, system metrics, queue activity, errors, and audit-style administrative activity.'
        ]
    },
    {
        number: '2',
        title: 'Encryption & Storage',
        slug: 'encryption-storage',
        body: 'Sensitive infrastructure material is handled as security-critical data.',
        points: [
            'GitHub tokens, SSH private keys, SSH passwords, deployment environment values, and other secrets are intended to be encrypted before storage.',
            'Database records are retained in PostgreSQL and accessed through server-side APIs with authenticated route protection where required.',
            'DeployForge does not expose raw secrets in public pages or unauthenticated UI surfaces.'
        ]
    },
    {
        number: '3',
        title: 'Third-Party Services',
        slug: 'third-party-services',
        body: 'DeployForge integrates with external systems required for deployment and messaging workflows.',
        points: [
            'GitHub is used for OAuth, repository synchronization, and webhook automation.',
            'VPS providers host the servers you connect to DeployForge; their own infrastructure and network policies also apply.',
            'SMTP providers may be used for account verification and system email delivery.'
        ]
    },
    {
        number: '4',
        title: 'Cookies Policy',
        slug: 'cookies-policy',
        body: 'DeployForge uses local browser storage and session-related mechanisms to keep authenticated workflows available.',
        points: [
            'Authentication sessions are maintained with HttpOnly cookies rather than browser-readable token storage.',
            'DeployForge does not require marketing cookies for the core deployment console.',
            'Signing out clears DeployForge session cookies.'
        ]
    },
    {
        number: '5',
        title: 'Data Retention',
        slug: 'data-retention',
        body: 'Retention is designed around operational traceability and user control.',
        points: [
            'Deployment records, logs, server metadata, repository records, and contact submissions may be retained for support, security, and audit purposes.',
            'Disconnected integrations should stop future sync activity while historical records may remain until removed by an authorized user or administrator.',
            'Administrators can remove users, GitHub accounts, repositories, and related operational records where the product workflow permits.'
        ]
    },
    {
        number: '6',
        title: 'User Rights & Control',
        slug: 'user-rights',
        body: 'Users should remain in control of connected accounts and infrastructure data.',
        points: [
            'Users can disconnect GitHub from the authenticated settings area.',
            'Users can remove VPS records and stop using deployment targets from the dashboard.',
            'For privacy or support requests, contact DeployForge through the contact page with the email connected to the account.'
        ]
    }
];

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Page Header ────────────────────────────────────────── */}
            <header className="border-b border-[#1F1F1F] px-4 pb-12 pt-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                        <ShieldCheck size={13} className="text-white" />
                        <span>DEPLOYFORGE — LEGAL DOCUMENTATION</span>
                    </div>

                    <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Privacy Policy
                    </h1>

                    <p className="mt-3 text-sm leading-relaxed text-[#A1A1A1] sm:text-base">
                        This policy explains the operational data DeployForge collects, how sensitive values are protected, and how users control connected services.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-mono text-[#666666]">
                        <span>LAST UPDATED: AUGUST 12, 2026</span>
                        <span>•</span>
                        <span>VERSION: 1.0</span>
                        <span>•</span>
                        <span>SCOPE: PLATFORM & DASHBOARD</span>
                    </div>
                </div>
            </header>

            {/* ── 2. Table of Contents Jump Links ───────────────────────── */}
            <nav className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                        <span className="py-1 text-[#666666] uppercase">SECTIONS:</span>
                        {SECTIONS.map((sec) => (
                            <a
                                key={sec.slug}
                                href={`#${sec.slug}`}
                                className="rounded border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-[#A1A1A1] transition-colors hover:border-[#333333] hover:text-white"
                            >
                                {sec.number}. {sec.title}
                            </a>
                        ))}
                    </div>
                </div>
            </nav>

            {/* ── 3. Document Sections ──────────────────────────────────── */}
            <article className="px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl space-y-12">
                    {SECTIONS.map((sec) => (
                        <section key={sec.slug} id={sec.slug} className="scroll-mt-20 border-b border-[#1F1F1F] pb-10 last:border-b-0">
                            <div className="flex items-center gap-2 font-mono text-xs text-[#666666]">
                                <span>SECTION {sec.number}</span>
                            </div>

                            <h2 className="mt-2 text-xl font-bold tracking-tight text-white">
                                {sec.number}. {sec.title}
                            </h2>

                            <p className="mt-3 text-sm leading-relaxed text-[#A1A1A1]">
                                {sec.body}
                            </p>

                            <div className="mt-5 space-y-3">
                                {sec.points.map((point, idx) => (
                                    <div key={idx} className="border-l-2 border-[#1F1F1F] pl-4 py-1 text-xs leading-relaxed text-[#A1A1A1]">
                                        <p>{point}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </article>

            {/* ── 4. Contact Footer ────────────────────────────────────── */}
            <section className="border-t border-[#1F1F1F] bg-[#000000] px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 sm:p-8">
                        <div className="max-w-xl">
                            <h3 className="text-base font-bold text-white">Questions about privacy?</h3>
                            <p className="mt-1 text-xs leading-relaxed text-[#A1A1A1]">
                                Send a focused message to the team and include the account email tied to your request.
                            </p>
                            <div className="mt-4">
                                <Link
                                    href="/contact"
                                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-3.5 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5]"
                                >
                                    <span>Contact Us</span>
                                    <ArrowRight size={12} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

        </main>
    );
}
