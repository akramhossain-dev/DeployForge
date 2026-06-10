import Link from 'next/link';
import { Rocket, Shield, Zap, Github, Terminal, Server } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#020617] text-white selection:bg-cyan-500/30">
            {/* Aurora Background Effect */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
            </div>

            <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                        <Rocket size={22} className="text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">DeployForge</span>
                </div>
                <div className="flex items-center gap-8 text-sm font-medium text-slate-400">
                    <Link href="#features" className="hover:text-white transition-colors">Features</Link>
                    <Link href="#docs" className="hover:text-white transition-colors">Docs</Link>
                    <Link href="/login" className="bg-slate-800/50 hover:bg-slate-700/50 px-5 py-2.5 rounded-full border border-slate-700/50 transition-all">Sign In</Link>
                    <Link href="/register" className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-6 py-2.5 rounded-full font-bold transition-all shadow-lg shadow-cyan-500/20">Get Started</Link>
                </div>
            </nav>

            <main className="relative z-10 pt-20 pb-32">
                <div className="max-w-7xl mx-auto px-8 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold mb-8 animate-bounce">
                        <Zap size={14} /> NEW: Auto SSL & Reverse Proxy Automation
                    </div>

                    <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">
                        Self-Hosted <br />
                        <span className="text-cyan-400">Deployment</span> Forge.
                    </h1>

                    <p className="max-w-2xl mx-auto text-lg text-slate-400 mb-12 leading-relaxed">
                        Take full control of your infrastructure. Deploy Next.js, Go, Python, and more on your own VPS with zero configuration. It's like Vercel, but you own the hardware.
                    </p>

                    <div className="flex items-center justify-center gap-4">
                        <Link href="/register" className="h-14 px-10 bg-white text-black font-black rounded-2xl flex items-center gap-2 hover:scale-105 transition-transform">
                            Deploy Your First App <Zap size={18} fill="currentColor" />
                        </Link>
                        <Link href="https://github.com/akramhossain-dev/DeployForge" className="h-14 px-10 bg-slate-900 border border-slate-800 font-bold rounded-2xl flex items-center gap-2 hover:bg-slate-800 transition-colors">
                            <Github size={20} /> View on GitHub
                        </Link>
                    </div>
                </div>

                {/* Feature Grid */}
                <div id="features" className="max-w-7xl mx-auto px-8 mt-40 grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        { icon: <Server className="text-cyan-400" />, title: "Auto-Scale VPS", desc: "Easily manage and deploy across multiple VPS instances with local Docker orchestration." },
                        { icon: <Shield className="text-purple-400" />, title: "Sandbox Security", desc: "Pre-deployment analysis scans your code for vulnerabilities before it goes live." },
                        { icon: <Terminal className="text-green-400" />, title: "Web SSH Terminal", desc: "Access your servers directly from the browser with a high-performance web terminal." }
                    ].map((feature, i) => (
                        <div key={i} className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800/50 hover:border-cyan-500/30 transition-all group">
                            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                            <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
