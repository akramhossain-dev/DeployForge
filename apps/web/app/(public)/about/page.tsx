import Link from 'next/link';
import { ArrowRight, Github, Server, ShieldCheck, Terminal } from 'lucide-react';
import { SystemCta, SystemHero } from '@/components/system/PublicSystem';

const principles = [
    {
        title: 'Infrastructure ownership',
        description: 'DeployForge is for teams that want modern deployment ergonomics while keeping control over VPS infrastructure and credentials.',
        icon: Server,
    },
    {
        title: 'Source-connected workflow',
        description: 'GitHub OAuth, repository sync, and webhooks keep deployments close to the code that triggered them.',
        icon: Github,
    },
    {
        title: 'Operational clarity',
        description: 'Live terminals, logs, metrics, and admin controls are organized as quiet production surfaces instead of noisy dashboards.',
        icon: Terminal,
    },
];

export default function AboutPage() {
    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <SystemHero
                eyebrow="About DeployForge"
                title="A deployment console for people who still want the keys."
                description="DeployForge brings repository automation, VPS management, live terminals, monitoring, and administrative control into one focused self-hosted delivery surface."
                action={
                    <Link href="/docs" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]">
                        Read Docs <ArrowRight size={17} />
                    </Link>
                }
            />

            <section className="border-y border-white/10 bg-white/[0.03] px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Principles</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Built for clear production ownership.</h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">
                            The product avoids hidden infrastructure assumptions. Every core workflow is designed to make source, server, deployment, and operator state visible.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 md:grid-cols-3">
                        {principles.map((principle) => {
                            const Icon = principle.icon;
                            return (
                                <article key={principle.title} className="rounded-lg border border-white/10 bg-slate-900/70 p-6">
                                    <Icon className="text-cyan-300" size={26} />
                                    <h3 className="mt-5 text-lg font-black text-white">{principle.title}</h3>
                                    <p className="mt-3 text-sm leading-6 text-slate-400">{principle.description}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl rounded-lg border border-white/10 bg-slate-900/70 p-6 sm:p-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight text-white">Why DeployForge exists</h2>
                            <p className="mt-3 max-w-4xl text-base leading-7 text-slate-400">
                                Many teams want the polish of hosted deployment platforms without surrendering runtime control. DeployForge is shaped for that middle ground: GitHub-driven deployment automation on infrastructure you own, with practical operational visibility built in.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <SystemCta title="Explore the system." description="Read the docs for the deployment path, security model, GitHub integration, VPS setup, and admin control flow." href="/docs" label="Open Docs" />
        </main>
    );
}
