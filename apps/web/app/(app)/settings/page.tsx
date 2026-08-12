'use client';

import { CheckCircle2, Chrome, Github, MailCheck, Save, Settings, ShieldAlert, ShieldCheck, Unlink, XCircle, Loader2 } from 'lucide-react';
import { ReactNode, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuthSession, useDisconnectGitHub, useGitHubProfile, queryKeys } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function ProviderCard({ icon, label, connected, detail }: { icon: ReactNode; label: string; connected: boolean; detail: string }) {
    return (
        <div className="rounded border border-[#1F1F1F] bg-[#000000] p-4 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-[#111111] text-white">
                    {icon}
                </div>
                <div>
                    <p className="font-bold text-white">{label}</p>
                    <p className="text-[11px] text-[#A1A1A1]">{connected ? detail : 'Not connected'}</p>
                </div>
            </div>
            <span className={clsx(
                'inline-flex items-center rounded border px-2 py-0.5 text-[10px] uppercase font-bold',
                connected ? 'border-[#1F1F1F] bg-[#0A0A0A] text-emerald-400' : 'border-[#1F1F1F] bg-[#111111] text-[#666666]'
            )}>
                {connected ? 'Connected' : 'Unlinked'}
            </span>
        </div>
    );
}

export default function SettingsPage() {
    const auth = useAuthSession();
    const profile = useGitHubProfile();
    const disconnect = useDisconnectGitHub();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const addToast = useToastStore(s => s.addToast);

    const [connectError, setConnectError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSendingVerification, setIsSending] = useState(false);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const githubStatus = searchParams.get('github');

    useEffect(() => { if (auth.user) { setName(auth.user.name || ''); setUsername(auth.user.username || ''); setEmail(auth.user.email || ''); } }, [auth.user]);

    async function connectGitHub() {
        setConnectError(null); setIsConnecting(true);
        try { const r = await api.get<{ url: string }>('/auth/github/connect'); window.location.href = r.url; }
        catch (err: any) { setConnectError(err.message || 'Unable to start GitHub OAuth.'); }
        finally { setIsConnecting(false); }
    }

    async function handleSaveProfile(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) { addToast({ title: 'Validation Error', description: 'Full name is required', severity: 'error' }); return; }
        setIsSaving(true);
        try { await api.patch('/profile', { name }); addToast({ title: 'Saved', description: 'Profile updated successfully', severity: 'success' }); await auth.refetch(); }
        catch (err: any) { addToast({ title: 'Error', description: err.message || 'Failed to update profile', severity: 'error' }); }
        finally { setIsSaving(false); }
    }

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* General Profile Section */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                <div className="border-b border-[#1F1F1F] pb-3">
                    <h2 className="font-bold text-white text-sm">General Profile</h2>
                    <p className="mt-0.5 text-xs text-[#A1A1A1]">Update account display name and view account details.</p>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Full Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} className={INPUT_STYLE} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Username</label>
                            <input type="text" value={username} readOnly disabled className={clsx(INPUT_STYLE, 'cursor-not-allowed opacity-50')} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Email Address</label>
                        <input type="email" value={email} readOnly disabled className={clsx(INPUT_STYLE, 'cursor-not-allowed opacity-50')} />
                    </div>

                    <div className="flex items-center justify-between border-t border-[#1F1F1F] pt-4">
                        <p className="text-[11px] text-[#666666]">Username & Email are read-only.</p>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            <span>Save Changes</span>
                        </button>
                    </div>
                </form>
            </div>

            {/* Connected Providers */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                <div className="border-b border-[#1F1F1F] pb-3">
                    <h2 className="font-bold text-white text-sm">Connected Providers</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <ProviderCard icon={<Chrome size={14} />} label="Google"
                        connected={Boolean(auth.user?.connectedProviders?.google || auth.user?.googleId)}
                        detail={auth.user?.googleEmail || auth.user?.email || 'Not connected'} />
                    <ProviderCard icon={<Github size={14} />} label="GitHub"
                        connected={Boolean(auth.user?.connectedProviders?.github || auth.user?.githubId || profile.data)}
                        detail={auth.user?.githubUsername ? `@${auth.user.githubUsername}` : profile.data?.username ? `@${profile.data.username}` : 'Not connected'} />
                    <ProviderCard icon={<MailCheck size={14} />} label="Email Credentials"
                        connected={Boolean(auth.user?.connectedProviders?.local)}
                        detail={auth.user?.email || 'Not connected'} />
                </div>
            </div>

            {/* GitHub Connection Manager */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                <div className="border-b border-[#1F1F1F] pb-3 flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-white text-sm">GitHub Connection</h2>
                        <p className="mt-0.5 text-xs text-[#A1A1A1]">OAuth integration for repository sync and release triggers.</p>
                    </div>
                    {profile.data && (
                        <div className="flex items-center gap-2">
                            <button onClick={connectGitHub} disabled={isConnecting} className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">
                                Reconnect
                            </button>
                            <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="h-8 px-3 rounded border border-rose-900/40 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30">
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>

                {!profile.data ? (
                    <div className="py-4 text-center space-y-3">
                        <p className="text-[#A1A1A1]">GitHub account is not connected.</p>
                        <button onClick={connectGitHub} disabled={isConnecting} className="inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-4 font-semibold text-black hover:bg-[#E5E5E5]">
                            <Github size={13} /> Connect GitHub
                        </button>
                    </div>
                ) : (
                    <div className="rounded border border-[#1F1F1F] bg-[#000000] p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Github size={16} className="text-white" />
                            <div>
                                <p className="font-bold text-white">@{profile.data.username}</p>
                                <p className="text-[11px] text-[#A1A1A1]">{profile.data.email || 'Connected'}</p>
                            </div>
                        </div>
                        <span className="text-emerald-400 font-bold">Connected</span>
                    </div>
                )}
            </div>
        </div>
    );
}
