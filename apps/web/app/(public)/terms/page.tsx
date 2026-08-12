'use client';

import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';

const SECTIONS = [
    {
        number: '1',
        title: 'Platform Usage Rules',
        slug: 'platform-usage',
        body: 'DeployForge is intended for legitimate deployment, server management, monitoring, and administrative workflows.',
        points: [
            'You are responsible for the applications, repositories, servers, credentials, and domains you connect to DeployForge.',
            'You must keep account credentials secure and immediately revoke access if a session or token is suspected to be compromised.',
            'You must only connect infrastructure and GitHub resources you own or are authorized to manage.'
        ]
    },
    {
        number: '2',
        title: 'Acceptable Usage Policy',
        slug: 'acceptable-usage',
        body: 'The platform must not be used to harm systems, evade policy, or abuse connected infrastructure.',
        points: [
            'Do not deploy malware, phishing infrastructure, credential harvesters, spam systems, or intentionally harmful workloads.',
            'Do not use DeployForge to attack, scan, overload, or exploit networks without explicit authorization.',
            'Do not interfere with the availability, integrity, or security of DeployForge or connected third-party services.'
        ]
    },
    {
        number: '3',
        title: 'GitHub Integration Terms',
        slug: 'github-terms',
        body: 'GitHub integration is provided to support repository-based deployment workflows.',
        points: [
            'You authorize DeployForge to access GitHub data required for OAuth identity, repository sync, branch selection, and webhook automation.',
            'You are responsible for respecting GitHub organization policies and repository access boundaries.',
            'Disconnecting GitHub may disable repository sync, webhook-triggered deployments, and GitHub-backed release workflows.'
        ]
    },
    {
        number: '4',
        title: 'VPS Usage Restrictions',
        slug: 'vps-restrictions',
        body: 'VPS features are designed for servers you control and can lawfully administer.',
        points: [
            'Do not add servers without authorization from the owner or responsible operator.',
            'Do not use terminal access to bypass security controls, exfiltrate data, or perform unauthorized administrative actions.',
            'You are responsible for operating system updates, provider billing, firewall rules, network exposure, and application runtime security.'
        ]
    },
    {
        number: '5',
        title: 'Abuse Prevention',
        slug: 'abuse-prevention',
        body: 'DeployForge may limit or block activity that creates operational, legal, or security risk.',
        points: [
            'Rate limits, validation, audit logs, and administrative review may be used to protect the service.',
            'Suspicious contact submissions, repeated failed authentication, or abusive deployment patterns may be blocked or reviewed.',
            'Security-sensitive actions may be logged for investigation and platform integrity.'
        ]
    },
    {
        number: '6',
        title: 'Account Termination',
        slug: 'account-termination',
        body: 'Access may be suspended or terminated when account activity violates these terms or threatens the platform.',
        points: [
            'DeployForge administrators may suspend or remove accounts involved in abuse, unauthorized access, or policy violations.',
            'Users may lose access to dashboard workflows when required credentials, integrations, or permissions are revoked.',
            'Termination may not remove all historical logs immediately where retention is needed for security, debugging, or legal obligations.'
        ]
    },
    {
        number: '7',
        title: 'Liability Limitations',
        slug: 'liability-limitations',
        body: 'DeployForge provides deployment tooling, but you remain responsible for your infrastructure and workloads.',
        points: [
            'DeployForge is not responsible for outages, data loss, provider failures, misconfigured servers, unsafe application code, or credential misuse.',
            'You should maintain backups, rollback plans, monitoring, and access controls appropriate for production infrastructure.',
            'The platform is provided without guarantees that every deployment, integration, or monitoring workflow will be uninterrupted or error-free.'
        ]
    }
];

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Page Header ────────────────────────────────────────── */}
            <header className="border-b border-[#1F1F1F] px-4 pb-12 pt-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                        <FileText size={13} className="text-white" />
                        <span>DEPLOYFORGE — LEGAL TERMS</span>
                    </div>

                    <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Terms of Service
                    </h1>

                    <p className="mt-3 text-sm leading-relaxed text-[#A1A1A1] sm:text-base">
                        These terms define acceptable platform use, connected infrastructure responsibilities, GitHub integration boundaries, and operational limitations.
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
                            <h3 className="text-base font-bold text-white">Need clarification?</h3>
                            <p className="mt-1 text-xs leading-relaxed text-[#A1A1A1]">
                                Contact DeployForge before connecting sensitive infrastructure or running production workloads with unclear ownership.
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
