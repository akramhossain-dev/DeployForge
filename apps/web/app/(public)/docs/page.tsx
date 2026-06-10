import Link from 'next/link';
import { ArrowRight, BookOpen, Github, Server } from 'lucide-react';

const docs = [
    ['Connect GitHub', 'Authorize access and sync repositories for deployment.', Github],
    ['Add VPS', 'Register servers, credentials, and deployment targets.', Server],
    ['Deploy', 'Create deployments and review logs from the dashboard.', BookOpen],
];

export default function DocsPage() {
    return (
        <main className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-6xl">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Docs</p>
                <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">DeployForge documentation</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
                    Start with the deployment flow, then move into VPS configuration and monitoring.
                </p>
                <div className="mt-10 grid gap-4 md:grid-cols-3">
                    {docs.map(([title, description, Icon]) => (
                        <article key={title as string} className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
                            <Icon className="text-cyan-300" size={24} />
                            <h2 className="mt-5 text-lg font-black">{title as string}</h2>
                            <p className="mt-3 text-sm leading-6 text-slate-400">{description as string}</p>
                        </article>
                    ))}
                </div>
                <Link href="/dashboard" className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950">
                    Open Dashboard <ArrowRight size={16} />
                </Link>
            </section>
        </main>
    );
}
