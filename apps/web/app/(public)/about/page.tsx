import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export default function AboutPage() {
    return (
        <main className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-4xl">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-300">About</p>
                <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">A deployment console for people who still want the keys.</h1>
                <p className="mt-6 text-base leading-8 text-slate-400">
                    DeployForge is built around a simple premise: modern deployment ergonomics should not require giving up your own servers.
                    The product brings repository automation, VPS management, live terminals, and monitoring into one quiet interface.
                </p>
                <div className="mt-10 rounded-lg border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="text-emerald-300" size={24} />
                        <h2 className="text-xl font-black">Infrastructure ownership first</h2>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-400">
                        The app is designed for teams that want control over hosting, credentials, and operational visibility without losing a polished deployment workflow.
                    </p>
                </div>
                <Link href="/docs" className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950">
                    Read Docs <ArrowRight size={16} />
                </Link>
            </section>
        </main>
    );
}
