'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import api from '@/lib/api/client';
import { Button, ErrorState, Panel } from '@/components/ui';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';

export default function AdminLoginPage() {
    const router = useRouter();
    const { setAdminSession } = useAdminAuthStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await api.post<{ admin: any; adminAccessToken: string }>('/admin/login', { email, password });
            setAdminSession(result);
            router.replace('/admin');
        } catch (err: any) {
            setError(err.message || 'Admin login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_28%)]" />
            <Panel className="relative w-full max-w-md">
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white">Admin Login</h1>
                        <p className="text-sm text-slate-400">Separate control-plane authentication</p>
                    </div>
                </div>
                {error ? <div className="mb-4"><ErrorState title="Login failed" message={error} /></div> : null}
                <form onSubmit={submit} className="space-y-4">
                    <input
                        required
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        placeholder="admin@example.com"
                        className="h-12 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 outline-none focus:border-cyan-400"
                    />
                    <input
                        required
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="Admin password"
                        className="h-12 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 outline-none focus:border-cyan-400"
                    />
                    <Button type="submit" loading={loading} className="w-full">Sign In</Button>
                </form>
            </Panel>
        </div>
    );
}
