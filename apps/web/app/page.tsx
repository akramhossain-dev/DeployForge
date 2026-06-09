export default function LandingPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-950 text-white">
            <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex flex-col text-center">
                <h1 className="text-6xl font-bold mb-8 bg-gradient-to-r from-sky-400 to-blue-600 bg-clip-text text-transparent">
                    DeployForge
                </h1>
                <p className="text-xl mb-12 text-slate-400 max-w-2xl mx-auto line-clamp-3">
                    The next-gen self-hosted deployment platform.
                    Deploy, monitor, and scale your applications on your own infrastructure.
                </p>
                <div className="flex gap-4">
                    <a href="/login" className="px-8 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-all">
                        Get Started
                    </a>
                    <a href="https://github.com/akramhossain-dev/DeployForge" className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition-all">
                        View on GitHub
                    </a>
                </div>
            </div>

            {/* Background aurora effect */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
            </div>
        </main>
    );
}
