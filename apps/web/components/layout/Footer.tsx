import Link from 'next/link';
import { Github, Rocket } from 'lucide-react';

const FOOTER_LINKS = {
    Platform:  [['Overview', '/'], ['Features', '/features'], ['About', '/about'], ['Console', '/dashboard']] as const,
    Resources: [['Documentation', '/docs'], ['Contact Support', '/contact'], ['Security Controls', '/docs#security']] as const,
    Legal:     [['Privacy Policy', '/privacy-policy'], ['Terms of Service', '/terms']] as const,
};

export function Footer() {
    return (
        <footer className="border-t border-[#1F1F1F] bg-black text-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Main grid */}
                <div className="grid gap-8 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                    {/* Brand column */}
                    <div>
                        <Link href="/" className="flex items-center gap-2 group w-fit" aria-label="DeployForge home">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-white">
                                <Rocket size={14} />
                            </div>
                            <span className="text-sm font-semibold tracking-tight text-white">DeployForge</span>
                        </Link>
                        <p className="mt-3 max-w-xs text-xs leading-relaxed text-[#A1A1A1]">
                            Production-grade, self-hosted deployment orchestrator automating application builds, VPS deployments, and real-time monitoring.
                        </p>
                        <a
                            href="https://github.com/akramhossain-dev/DeployForge"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1.5 text-xs font-medium text-[#A1A1A1] transition-colors hover:border-[#333333] hover:text-white"
                        >
                            <Github size={13} /> View Repository
                        </a>
                    </div>

                    {/* Link groups */}
                    {Object.entries(FOOTER_LINKS).map(([group, links]) => (
                        <div key={group}>
                            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#666666]">{group}</h3>
                            <div className="mt-3 flex flex-col gap-2">
                                {links.map(([label, href]) => (
                                    <Link
                                        key={`${group}-${href}`}
                                        href={href}
                                        className="text-xs text-[#A1A1A1] transition-colors hover:text-white"
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom bar */}
                <div className="border-t border-[#1F1F1F] py-4">
                    <div className="flex flex-col gap-3 text-xs text-[#666666] sm:flex-row sm:items-center sm:justify-between">
                        <span>© {new Date().getFullYear()} DeployForge. Open source self-hosted orchestration.</span>
                        <div className="flex flex-wrap gap-4">
                            {([['About', '/about'], ['Features', '/features'], ['Docs', '/docs'], ['Privacy', '/privacy-policy'], ['Terms', '/terms']] as [string, string][]).map(([label, href]) => (
                                <Link key={href} href={href} className="transition-colors hover:text-[#A1A1A1]">{label}</Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}

