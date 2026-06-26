import Link from 'next/link';
import { Github, Rocket } from 'lucide-react';

const FOOTER_LINKS = {
    Product:   [['Home', '/'], ['About', '/about'], ['Features', '/features'], ['Dashboard', '/dashboard']] as const,
    Resources: [['Docs', '/docs'], ['Contact', '/contact'], ['Security', '/docs#security']] as const,
    Legal:     [['Privacy Policy', '/privacy-policy'], ['Terms of Service', '/terms']] as const,
};

export function Footer() {
    return (
        <footer className="border-t border-white/[0.07] bg-slate-950">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Main grid */}
                <div className="grid gap-10 py-14 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
                    {/* Brand col */}
                    <div>
                        <Link href="/" className="flex items-center gap-2.5 group w-fit">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/20 to-cyan-300/5 text-cyan-200 shadow-lg shadow-cyan-500/10">
                                <Rocket size={16} />
                            </span>
                            <span className="text-base font-black tracking-tight text-white">DeployForge</span>
                        </Link>
                        <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
                            Self-hosted deployment workflows for teams that want GitHub automation, VPS control, and live operations in one focused console.
                        </p>
                        {/* GitHub link */}
                        <a
                            href="https://github.com/akramhossain-dev/DeployForge"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-400 transition-colors hover:border-white/15 hover:text-white"
                        >
                            <Github size={13} /> View on GitHub
                        </a>
                    </div>

                    {/* Link groups */}
                    {Object.entries(FOOTER_LINKS).map(([group, links]) => (
                        <div key={group}>
                            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">{group}</h2>
                            <div className="mt-4 flex flex-col gap-3">
                                {links.map(([label, href]) => (
                                    <Link
                                        key={`${group}-${href}`}
                                        href={href}
                                        className="text-sm text-slate-400 transition-colors hover:text-white"
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom bar */}
                <div className="border-t border-white/[0.06] py-5">
                    <div className="flex flex-col gap-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                        <span>© {new Date().getFullYear()} DeployForge. Built for self-hosted infrastructure.</span>
                        <div className="flex flex-wrap gap-5">
                            {([['About', '/about'], ['Features', '/features'], ['Docs', '/docs'], ['Privacy', '/privacy-policy'], ['Terms', '/terms']] as [string, string][]).map(([label, href]) => (
                                <Link key={href} href={href} className="transition-colors hover:text-slate-300">{label}</Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
