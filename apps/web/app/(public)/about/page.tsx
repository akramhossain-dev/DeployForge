import Link from 'next/link';
import { ArrowRight, Github, Server, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { SystemCta, SystemHero } from '@/components/system/PublicSystem';

const principles = [
    {
        icon: Server,
        title: 'Infrastructure ownership',
        description: 'Modern deployment ergonomics while keeping full control over your VPS infrastructure and credentials.',
        accent: 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300',
    },
    {
        icon: Github,
        title: 'Source-connected workflow',
        description: 'GitHub OAuth, repository sync, and webhooks keep deployments tightly attached to the code that triggered them.',
        accent: 'border-violet-400/20 bg-violet-400/[0.06] text-violet-300',
    },
    {
        icon: Terminal,
        title: 'Operational clarity',
        description: 'Live terminals, logs, metrics, and admin controls — organized as quiet production surfaces, not noisy dashboards.',
        accent: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300',
    },
];

const stats = [
    { label: 'Self-hosted', value: '100%', accent: 'text-cyan-300' },
    { label: 'Open source', value: 'MIT',  accent: 'text-emerald-300' },
    { label: 'VPS support', value: '∞',    accent: 'text-violet-300' },
];

export default function AboutPage() {
    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <SystemHero
                eyebrow="About DeployForge"
                title="A deployment console for people who still want the keys."
                description="DeployForge brings repository automation, VPS management, live terminals, monitoring, and administrative control into one focused self-hosted delivery surface."
                action={
                    <Link href="/docs" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 shadow-lg transition-all hover:scale-[1.02] hover:shadow-white/10">
                        Read Docs <ArrowRight size={17} />
                    </Link>
                }
            />

            {/* ── Stats strip ── */}
            <section className="border-y border-white/[0.07] bg-white/[0.02] px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="grid grid-cols-3 gap-4 sm:gap-6">
                        {stats.map(s => (
                            <div key={s.label} className="text-center">
                                <p className={`text-3xl font-black sm:text-4xl ${s.accent}`}>{s.value}</p>
                                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Principles ── */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl mb-12">
                        <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Principles</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Built for clear production ownership.</h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">
                            Every core workflow is designed to make source, server, deployment, and operator state visible. No hidden infrastructure assumptions.
                        </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        {principles.map(p => {
                            const Icon = p.icon;
                            return (
                                <article key={p.title} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-6 transition-all hover:border-white/[0.15]">
                                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400/30 to-transparent" />
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${p.accent}`}>
                                        <Icon size={20} />
                                    </div>
                                    <h3 className="mt-5 text-lg font-black text-white">{p.title}</h3>
                                    <p className="mt-3 text-sm leading-6 text-slate-400">{p.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Why it exists ── */}
            <section className="border-y border-white/[0.07] bg-white/[0.02] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.06] to-transparent p-8 sm:p-10">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400/60 via-cyan-400/20 to-transparent" />
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Zap size={13} className="text-cyan-400" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Why DeployForge exists</span>
                                </div>
                                <h2 className="text-2xl font-black tracking-tight text-white">GitHub-driven deployment on infrastructure you own.</h2>
                                <p className="mt-3 max-w-4xl text-base leading-7 text-slate-400">
                                    Many teams want the polish of hosted deployment platforms without surrendering runtime control. DeployForge is shaped for that middle ground — GitHub-driven deployment automation on infrastructure you own, with practical operational visibility built in.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <SystemCta
                title="Explore the system."
                description="Read the docs for the deployment path, security model, GitHub integration, VPS setup, and admin control flow."
                href="/docs"
                label="Open Docs"
            />
        </main>
    );
}
