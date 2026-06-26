'use client';

import { CheckCircle2, Chrome, Github, MailCheck, Save, Settings, ShieldAlert, ShieldCheck, Unlink, XCircle } from 'lucide-react';
import { ReactNode, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, inputClassName } from '@/components/ui';
import { useAuthSession, useDisconnectGitHub, useGitHubProfile, queryKeys } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
    return (
        <div className="mb-5 flex items-center gap-3 border-b border-white/[0.07] pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/8 text-cyan-200 shrink-0">{icon}</div>
            <div>
                <h2 className="font-black text-white">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
            </div>
        </div>
    );
}

function FieldLabel({ children, readOnly }: { children: React.ReactNode; readOnly?: boolean }) {
    return (
        <span className={clsx('block text-[11px] font-black uppercase tracking-wider mb-1.5', readOnly ? 'text-slate-600' : 'text-slate-400')}>
            {children}{readOnly && <span className="ml-1.5 rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-slate-600">read-only</span>}
        </span>
    );
}

function ProviderCard({ icon, label, connected, detail }: { icon: ReactNode; label: string; connected: boolean; detail: string }) {
    return (
        <div className={clsx('relative rounded-xl border p-4 transition-all', connected ? 'border-emerald-400/20 bg-emerald-400/[0.04]' : 'border-white/[0.07] bg-white/[0.02]')}>
            {connected && <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-emerald-400/50 to-transparent" />}
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                    <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg border text-sm',
                        connected ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-white/[0.07] bg-white/[0.04] text-slate-500')}>
                        {icon}
                    </span>
                    <span className="font-black text-white text-sm">{label}</span>
                </div>
                {connected
                    ? <CheckCircle2 className="text-emerald-300 shrink-0" size={16} />
                    : <XCircle className="text-slate-600 shrink-0" size={16} />}
            </div>
            <p className="truncate text-[11px] text-slate-500">{connected ? detail : 'Not connected'}</p>
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

    const [connectError, setConnectError]           = useState<string | null>(null);
    const [isConnecting, setIsConnecting]           = useState(false);
    const [isSendingVerification, setIsSending]     = useState(false);
    const [name, setName]       = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail]     = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const githubStatus     = searchParams.get('github');
    const repoStatus       = searchParams.get('repos');
    const errorType        = searchParams.get('error_type');
    const errorMessageParam = searchParams.get('message');

    useEffect(() => { if (auth.user) { setName(auth.user.name || ''); setUsername(auth.user.username || ''); setEmail(auth.user.email || ''); } }, [auth.user]);
    useEffect(() => {
        if (githubStatus === 'connected') {
            queryClient.invalidateQueries({ queryKey: queryKeys.githubProfile });
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
            queryClient.invalidateQueries({ queryKey: queryKeys.me });
        }
    }, [githubStatus, queryClient]);

    async function connectGitHub() {
        setConnectError(null); setIsConnecting(true);
        try { const r = await api.get<{ url: string }>('/github/connect'); window.location.href = r.url; }
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

    async function handleSendVerification() {
        setIsSending(true);
        try { await api.post('/auth/send-verification'); addToast({ title: 'Sent', description: 'Verification email sent.', severity: 'success' }); }
        catch (err: any) { addToast({ title: 'Error', description: err.message || 'Failed to send verification email', severity: 'error' }); }
        finally { setIsSending(false); }
    }

    // Build a readable GitHub error message
    const githubErrorMap: Record<string, [string, string]> = {
        invalid_client:       ['Invalid OAuth Client (invalid_client)', 'GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is invalid.'],
        bad_verification_code:['Invalid Verification Code', 'The code from GitHub has expired. Try connecting again.'],
        callback_mismatch:    ['Callback URL Mismatch', 'GITHUB_CALLBACK_URL does not match the registered URL in GitHub Developer settings.'],
        missing_state:        ['Missing State Parameter', 'The security state parameter is missing from the OAuth callback.'],
        session_error:        ['Session Verification Failed', errorMessageParam || 'Please log in again.'],
        database_error:       ['Database Error', errorMessageParam || 'Check backend logs.'],
        github_api_error:     ['GitHub API Error', errorMessageParam || 'Error communicating with GitHub API.'],
    };
    const [errorTitle, errorMessage] = (errorType && githubErrorMap[errorType]) || ['GitHub OAuth Failed', errorMessageParam || 'The OAuth callback could not complete.'];

    return (
        <div className="space-y-6">
            <PageHeader title="Settings" description="Manage your profile, connected accounts, and authentication providers." />

            {/* Email verification banner */}
            {auth.user && !auth.user.isVerified && (
                <div className="flex flex-col gap-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={18} />
                        <div>
                            <p className="text-sm font-black text-white">Verify your email address</p>
                            <p className="mt-0.5 text-xs text-slate-400">Secure your account and enable email notifications.</p>
                        </div>
                    </div>
                    <Button variant="secondary" className="shrink-0 border-amber-400/20 bg-amber-400/8 text-amber-200 hover:bg-amber-400/15 text-xs"
                        onClick={handleSendVerification} loading={isSendingVerification}>
                        Send Verification Email
                    </Button>
                </div>
            )}

            {/* Profile */}
            <Panel>
                <SectionHeader icon={<Settings size={16} />} title="Profile" description="Your display name and account credentials." />
                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label>
                            <FieldLabel>Full Name</FieldLabel>
                            <input type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="Full Name" className={inputClassName} />
                        </label>
                        <label>
                            <FieldLabel readOnly>Username</FieldLabel>
                            <input type="text" value={username} readOnly disabled
                                className={clsx(inputClassName, 'cursor-not-allowed opacity-40')} />
                        </label>
                    </div>
                    <label>
                        <FieldLabel readOnly>Email Address</FieldLabel>
                        <input type="email" value={email} readOnly disabled
                            className={clsx(inputClassName, 'cursor-not-allowed opacity-40')} />
                    </label>
                    <div className="flex items-center justify-between border-t border-white/[0.07] pt-4">
                        <p className="text-xs text-slate-500">Username and email can only be changed by an admin.</p>
                        <Button type="submit" loading={isSaving}><Save size={15} /> Save Changes</Button>
                    </div>
                </form>
            </Panel>

            {/* Connected Providers */}
            <Panel>
                <SectionHeader icon={<ShieldCheck size={16} />} title="Connected Providers" description="Authentication methods linked to your account." />
                <div className="grid gap-3 sm:grid-cols-3">
                    <ProviderCard icon={<Chrome size={16} />} label="Google"
                        connected={Boolean(auth.user?.connectedProviders?.google || auth.user?.googleId)}
                        detail={auth.user?.googleEmail || auth.user?.email || 'Not connected'} />
                    <ProviderCard icon={<Github size={16} />} label="GitHub"
                        connected={Boolean(auth.user?.connectedProviders?.github || auth.user?.githubId || profile.data)}
                        detail={auth.user?.githubUsername ? `@${auth.user.githubUsername}` : profile.data?.username ? `@${profile.data.username}` : 'Not connected'} />
                    <ProviderCard icon={<MailCheck size={16} />} label="Email / Password"
                        connected={Boolean(auth.user?.connectedProviders?.local)}
                        detail={auth.user?.email || 'Not connected'} />
                </div>
            </Panel>

            {/* GitHub Connection */}
            <Panel>
                <SectionHeader icon={<Github size={16} />} title="GitHub Connection" description="Connect GitHub to sync repositories and install deployment webhooks." />
                {profile.isLoading ? <SkeletonBlock className="h-20" /> :
                 profile.isError || !profile.data ? (
                    <EmptyState title="GitHub disconnected" description="Connect GitHub to sync repositories and install deployment webhooks."
                        action={<Button onClick={connectGitHub} loading={isConnecting}><Github size={15} /> Connect GitHub</Button>} />
                ) : (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                        <div className="flex items-center gap-3">
                            {profile.data.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={profile.data.avatarUrl} alt="" className="h-10 w-10 rounded-full border border-white/10" />
                            ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/20 bg-violet-400/10 text-violet-300"><Github size={18} /></div>
                            )}
                            <div>
                                <p className="font-black text-white">@{profile.data.username}</p>
                                <p className="text-xs text-slate-500">{profile.data.email || 'No public email'}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={connectGitHub} loading={isConnecting}><Github size={15} /> Reconnect</Button>
                            <Button variant="danger" onClick={() => disconnect.mutate()} loading={disconnect.isPending}><Unlink size={15} /> Disconnect</Button>
                        </div>
                    </div>
                )}

                {/* Status notifications */}
                {githubStatus === 'connected' && (
                    <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">
                        ✓ GitHub connected{repoStatus === 'sync_failed' ? `, but repository sync failed: ${errorMessageParam || 'Retry from the Repositories page.'}` : ' successfully.'}
                    </div>
                )}
                {githubStatus === 'error' && <div className="mt-4"><ErrorState title={errorTitle} message={errorMessage} onRetry={connectGitHub} /></div>}
                {connectError && <div className="mt-4"><ErrorState title="GitHub connect failed" message={connectError} /></div>}
                {profile.isError && <div className="mt-4"><ErrorState title="Connection check failed" message={(profile.error as Error)?.message} onRetry={() => profile.refetch()} /></div>}
                {disconnect.isError && <div className="mt-4"><ErrorState title="Disconnect failed" message={(disconnect.error as Error)?.message} onRetry={() => disconnect.mutate()} /></div>}
            </Panel>
        </div>
    );
}
