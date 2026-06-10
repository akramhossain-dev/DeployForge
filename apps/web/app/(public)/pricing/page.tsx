import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export default function PricingPage() {
    return (
        <main className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-5xl">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Pricing</p>
                <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Self-hosted by design.</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
                    DeployForge runs against your own infrastructure. Product packaging can evolve without changing that core ownership model.
                </p>
                <div className="mt-10 rounded-lg border border-white/10 bg-white/[0.04] p-6">
                    <h2 className="text-2xl font-black">Community</h2>
                    <p className="mt-3 text-slate-400">Use DeployForge with your own VPS fleet and GitHub repositories.</p>
                    <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                        {['GitHub repository sync', 'VPS deployment workflows', 'Browser terminal access', 'Monitoring views'].map((item) => (
                            <p key={item} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /> {item}</p>
                        ))}
                    </div>
                    <Link href="/register" className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-slate-950">
                        Get Started <ArrowRight size={16} />
                    </Link>
                </div>
            </section>
        </main>
    );
}
