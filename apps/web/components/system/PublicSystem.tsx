import Link from 'next/link';
import { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

export type LegalSection = {
    title: string;
    body: string;
    points: string[];
};

export function PublicAurora() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-[-8rem] top-8 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="absolute right-[-8rem] top-40 h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-[22rem] w-[22rem] rounded-full bg-rose-400/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}

export function SystemHero({
    eyebrow,
    title,
    description,
    action,
}: {
    eyebrow: string;
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return (
        <section className="relative isolate px-4 pb-12 pt-20 sm:px-6 lg:px-8">
            <PublicAurora />
            <div className="mx-auto max-w-7xl">
                <div className="max-w-4xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100 shadow-lg shadow-cyan-500/10">
                        {eyebrow}
                    </div>
                    <h1 className="mt-8 text-5xl font-black leading-[1.02] tracking-tight text-white sm:text-6xl">
                        {title}
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">{description}</p>
                    {action ? <div className="mt-8">{action}</div> : null}
                </div>
            </div>
        </section>
    );
}

export function LegalDocument({ sections }: { sections: LegalSection[] }) {
    return (
        <section className="border-y border-white/10 bg-white/[0.03] px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[18rem_1fr]">
                <aside className="lg:sticky lg:top-24 lg:self-start">
                    <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                        <p className="text-sm font-black text-white">Contents</p>
                        <nav className="mt-4 flex flex-col gap-1">
                            {sections.map((section) => (
                                <a
                                    key={section.title}
                                    href={`#${slug(section.title)}`}
                                    className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                                >
                                    {section.title}
                                </a>
                            ))}
                        </nav>
                    </div>
                </aside>

                <div className="space-y-5">
                    {sections.map((section) => (
                        <article key={section.title} id={slug(section.title)} className="scroll-mt-24 rounded-lg border border-white/10 bg-slate-900/70 p-6 sm:p-7">
                            <h2 className="text-2xl font-black tracking-tight text-white">{section.title}</h2>
                            <p className="mt-3 text-base leading-7 text-slate-400">{section.body}</p>
                            <div className="mt-6 grid gap-3">
                                {section.points.map((point) => (
                                    <p key={point} className="rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm leading-6 text-slate-300">
                                        {point}
                                    </p>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function SystemCta({ title, description, href, label }: { title: string; description: string; href: string; label: string }) {
    return (
        <section className="px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-8 shadow-2xl shadow-cyan-950/30 sm:p-10 lg:flex lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-3xl font-black tracking-tight text-white">{title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/75">{description}</p>
                </div>
                <Link
                    href={href}
                    className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02] lg:mt-0"
                >
                    {label} <ArrowRight size={17} />
                </Link>
            </div>
        </section>
    );
}

function slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
