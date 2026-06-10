'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Rocket, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import api from '@/lib/api/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { hasHydrated, isAuthenticated, setSession } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (hasHydrated && isAuthenticated) router.replace('/dashboard');
    }, [hasHydrated, isAuthenticated, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await api.post<{ user: any; accessToken: string; refreshToken?: string }>('/auth/login', { email, password });
            setSession(response);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-10">
                    <Link href="/" className="inline-flex items-center gap-2 mb-8 group">
                        <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Rocket size={24} />
                        </div>
                        <span className="text-2xl font-black tracking-tighter">DeployForge</span>
                    </Link>
                    <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
                    <p className="text-slate-400">Sign in to manage your infrastructure.</p>
                </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
                            <input
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-12 bg-slate-950 border border-slate-800 rounded-xl px-4 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                placeholder="name@company.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
                            <input
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-12 bg-slate-950 border border-slate-800 rounded-xl px-4 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                placeholder="Password"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 rounded-lg bg-cyan-400 text-slate-950 font-bold flex items-center justify-center gap-2 hover:bg-cyan-300 disabled:opacity-50 transition-colors"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <>Sign In <ArrowRight size={18} /></>}
                        </button>
                    </form>
                </div>

                <p className="text-center mt-8 text-slate-400">
                    Don&apos;t have an account?{' '}
                    <Link href="/register" className="text-cyan-400 font-bold hover:underline">Sign up for free</Link>
                </p>
            </div>
        </div>
    );
}
