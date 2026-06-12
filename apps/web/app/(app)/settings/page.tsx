'use client';

import { CheckCircle2, Chrome, Github, MailCheck, Unlink, XCircle, Save, ShieldAlert } from 'lucide-react';
import { ReactNode, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, Panel, SkeletonBlock } from '@/components/ui';
import { useAuthSession, useDisconnectGitHub, useGitHubProfile, queryKeys } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

export default function SettingsPage() {
    const auth = useAuthSession();
    const profile = useGitHubProfile();
    const disconnect = useDisconnectGitHub();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const addToast = useToastStore((state) => state.addToast);
    
    const [connectError, setConnectError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSendingVerification, setIsSendingVerification] = useState(false);

    // Profile fields
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    const githubStatus = searchParams.get('github');
    const repoStatus = searchParams.get('repos');
    const errorType = searchParams.get('error_type');
    const errorMessageParam = searchParams.get('message');

    useEffect(() => {
        if (auth.user) {
            setName(auth.user.name || '');
            setUsername(auth.user.username || '');
            setEmail(auth.user.email || '');
        }
    }, [auth.user]);

    // Automatically refresh user state after successful connect
    useEffect(() => {
        if (githubStatus === 'connected') {
            queryClient.invalidateQueries({ queryKey: queryKeys.githubProfile });
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
            queryClient.invalidateQueries({ queryKey: queryKeys.me });
        }
    }, [githubStatus, queryClient]);

    async function connectGitHub() {
        setConnectError(null);
        setIsConnecting(true);
        try {
            const response = await api.get<{ url: string }>('/github/connect');
            window.location.href = response.url;
        } catch (err: any) {
            setConnectError(err.message || 'Unable to start GitHub OAuth.');
        } finally {
            setIsConnecting(false);
        }
    }

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            addToast({ title: 'Validation Error', description: 'Full name is required', severity: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            await api.patch('/profile', { name });
            addToast({ title: 'Success', description: 'Profile updated successfully', severity: 'success' });
            await auth.refetch();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to update profile', severity: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSendVerification = async () => {
        setIsSendingVerification(true);
        try {
            await api.post('/auth/send-verification');
            addToast({ title: 'Verification Sent', description: 'Verification email sent successfully', severity: 'success' });
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to send verification email', severity: 'error' });
        } finally {
            setIsSendingVerification(false);
        }
    };

    // Map the error type to a detailed human-readable explanation
    let errorTitle = 'GitHub OAuth failed';
    let errorMessage = 'GitHub returned to DeployForge, but the OAuth callback could not complete. Check the API logs for the exact GitHub error.';

    if (githubStatus === 'error') {
        if (errorType === 'invalid_client') {
            errorTitle = 'Invalid OAuth Client Config (invalid_client)';
            errorMessage = 'The GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET configured on the backend is invalid. Please verify your environment settings.';
        } else if (errorType === 'bad_verification_code') {
            errorTitle = 'Invalid Verification Code (bad_verification_code)';
            errorMessage = 'The temporary verification code provided by GitHub has expired or is invalid. Please try connecting again.';
        } else if (errorType === 'callback_mismatch') {
            errorTitle = 'Callback URL Mismatch (callback_mismatch)';
            errorMessage = 'The GITHUB_CALLBACK_URL configured in the .env file does not match the Authorization callback URL registered in the GitHub Developer settings.';
        } else if (errorType === 'missing_state') {
            errorTitle = 'Missing State Parameter (missing_state)';
            errorMessage = 'The security state parameter is missing from the callback, which is required to prevent CSRF attacks.';
        } else if (errorType === 'session_error') {
            errorTitle = 'Session Verification Failed (session_error)';
            errorMessage = errorMessageParam || 'DeployForge was unable to verify your logged-in session during the callback. Please log in again.';
        } else if (errorType === 'database_error') {
            errorTitle = 'Database Storage Error (database_error)';
            errorMessage = errorMessageParam || 'A database error occurred while saving your GitHub account information. Please check backend logs.';
        } else if (errorType === 'github_api_error') {
            errorTitle = 'GitHub API Error (github_api_error)';
            errorMessage = errorMessageParam || 'An error occurred while communicating with the GitHub API.';
        } else if (errorMessageParam) {
            errorMessage = errorMessageParam;
        }
    }

    return (
        <div className="space-y-6">
            {/* Email Verification banner */}
            {auth.user && !auth.user.isVerified && (
                <div className="flex flex-col gap-4 p-4 rounded-lg border border-amber-500/30 bg-amber-950/20 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-amber-400 shrink-0"><ShieldAlert size={20} /></span>
                        <div>
                            <p className="font-bold text-white text-sm">Verify your email address</p>
                            <p className="text-xs text-slate-400">
                                Verify your account to secure it and enable email notifications.
                            </p>
                        </div>
                    </div>
                    <Button 
                        variant="secondary" 
                        className="text-xs whitespace-nowrap bg-amber-500/10 border-amber-500/20 text-amber-200 hover:bg-amber-500/20"
                        onClick={handleSendVerification}
                        loading={isSendingVerification}
                    >
                        Send Verification Email
                    </Button>
                </div>
            )}

            {/* Profile details form */}
            <Panel>
                <h3 className="mb-4 font-bold text-white">General Settings</h3>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                placeholder="Full Name"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Username (Read-Only)</label>
                            <input
                                type="text"
                                value={username}
                                readOnly
                                disabled
                                className="w-full bg-slate-950/50 border border-white/5 rounded-md py-2 px-3 text-slate-500 cursor-not-allowed text-sm select-none"
                                placeholder="username"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Email Address (Read-Only)</label>
                        <input
                            type="email"
                            value={email}
                            readOnly
                            disabled
                            className="w-full bg-slate-950/50 border border-white/5 rounded-md py-2 px-3 text-slate-500 cursor-not-allowed text-sm select-none"
                            placeholder="email@example.com"
                        />
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button type="submit" loading={isSaving}>
                            <Save size={16} /> Save Changes
                        </Button>
                    </div>
                </form>
            </Panel>

            <Panel>
                <h3 className="mb-4 font-bold text-white">Connected Providers</h3>
                <div className="grid gap-3 md:grid-cols-3">
                    <ProviderStatus
                        icon={<Chrome size={18} />}
                        label="Google"
                        connected={Boolean(auth.user?.connectedProviders?.google || auth.user?.googleId)}
                        detail={auth.user?.googleEmail || auth.user?.email || 'Not connected'}
                    />
                    <ProviderStatus
                        icon={<Github size={18} />}
                        label="GitHub"
                        connected={Boolean(auth.user?.connectedProviders?.github || auth.user?.githubId || profile.data)}
                        detail={auth.user?.githubUsername ? `@${auth.user.githubUsername}` : profile.data?.username ? `@${profile.data.username}` : 'Not connected'}
                    />
                    <ProviderStatus
                        icon={<MailCheck size={18} />}
                        label="Email/Password"
                        connected={Boolean(auth.user?.connectedProviders?.local)}
                        detail={auth.user?.email || 'Not connected'}
                    />
                </div>
            </Panel>

            <Panel>
                <h3 className="mb-4 font-bold text-white">GitHub Connection</h3>
                {profile.isLoading ? (
                    <SkeletonBlock className="h-24" />
                ) : profile.isError || !profile.data ? (
                    <EmptyState 
                        title="GitHub disconnected" 
                        description="Connect GitHub to sync repositories and install deployment webhooks." 
                        action={
                            <Button onClick={connectGitHub} loading={isConnecting}>
                                <Github size={16} /> Connect GitHub
                            </Button>
                        } 
                    />
                ) : (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-bold text-white">@{profile.data.username}</p>
                            <p className="text-sm text-slate-400">{profile.data.email || 'No public email'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={connectGitHub} loading={isConnecting}>
                                <Github size={16} /> Reconnect
                            </Button>
                            <Button variant="danger" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
                                <Unlink size={16} /> Disconnect
                            </Button>
                        </div>
                    </div>
                )}
                {githubStatus === 'connected' ? (
                    <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-100">
                        GitHub connected successfully{repoStatus === 'sync_failed' ? `, but repository sync failed: ${errorMessageParam || 'Retry from the Repositories page.'}` : '.'}
                    </div>
                ) : null}
                {githubStatus === 'error' ? (
                    <div className="mt-4">
                        <ErrorState 
                            title={errorTitle} 
                            message={errorMessage} 
                            onRetry={connectGitHub}
                        />
                    </div>
                ) : null}
                {connectError ? <div className="mt-4"><ErrorState title="GitHub connect failed" message={connectError} /></div> : null}
                {profile.isError ? <div className="mt-4"><ErrorState title="Connection check failed" message={(profile.error as Error)?.message} onRetry={() => profile.refetch()} /></div> : null}
                {disconnect.isError ? <div className="mt-4"><ErrorState title="Disconnect failed" message={(disconnect.error as Error)?.message} onRetry={() => disconnect.mutate()} /></div> : null}
            </Panel>
        </div>
    );
}

function ProviderStatus({ icon, label, connected, detail }: { icon: ReactNode; label: string; connected: boolean; detail: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">{icon}</span>
                    <span className="font-bold">{label}</span>
                </div>
                {connected ? <CheckCircle2 className="text-emerald-300" size={18} /> : <XCircle className="text-slate-600" size={18} />}
            </div>
            <p className="mt-3 truncate text-sm text-slate-400">{connected ? detail : 'Not connected'}</p>
        </div>
    );
}
