import Link from 'next/link';
import { Github, Rocket } from 'lucide-react';

export function Footer() {
    return (
        <footer className="border-t border-white/10 bg-slate-950">
            <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
                            <Rocket size={20} />
                        </span>
                        <span className="text-lg font-black text-white">DeployForge</span>
                    </div>
                    <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
                        Self-hosted deployment workflows for teams that want GitHub automation, VPS control, and live operations in one focused console.
                    </p>
                </div>

                <FooterGroup title="Product" links={[['Home', '/'], ['About', '/about'], ['Features', '/features'], ['Dashboard', '/dashboard']]} />
                <FooterGroup title="Resources" links={[['Docs', '/docs'], ['Contact', '/contact'], ['Security', '/docs#security']]} />

                <div>
                    <h2 className="text-sm font-black uppercase tracking-wide text-white">Company</h2>
                    <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
                        <Link href="/privacy-policy" className="transition-colors hover:text-white">Privacy Policy</Link>
                        <Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link>
                        <Link href="https://github.com/akramhossain-dev/DeployForge" className="inline-flex items-center gap-2 transition-colors hover:text-white">
                            <Github size={16} /> GitHub
                        </Link>
                    </div>
                </div>
            </div>
            <div className="border-t border-white/10 px-4 py-4">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>Legal and system pages for self-hosted infrastructure.</span>
                    <div className="flex flex-wrap gap-4">
                        <Link href="/about" className="transition-colors hover:text-white">About</Link>
                        <Link href="/features" className="transition-colors hover:text-white">Features</Link>
                        <Link href="/docs" className="transition-colors hover:text-white">Docs</Link>
                        <Link href="/contact" className="transition-colors hover:text-white">Contact</Link>
                        <Link href="/privacy-policy" className="transition-colors hover:text-white">Privacy Policy</Link>
                        <Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link>
                    </div>
                </div>
            </div>
            <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-slate-500">
                DeployForge. Built for self-hosted infrastructure.
            </div>
        </footer>
    );
}

function FooterGroup({ title, links }: { title: string; links: Array<[string, string]> }) {
    return (
        <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-white">{title}</h2>
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
                {links.map(([label, href]) => (
                    <Link key={`${title}-${href}-${label}`} href={href} className="transition-colors hover:text-white">
                        {label}
                    </Link>
                ))}
            </div>
        </div>
    );
}
