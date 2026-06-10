'use client';

import { Github, Unlink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock } from '@/components/ui';
import { useDisconnectGitHub, useGitHubProfile, queryKeys } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';

export default function SettingsPage() {
    const profile = useGitHubProfile();
    const disconnect = useDisconnectGitHub();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const [connectError, setConnectError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    
    const githubStatus = searchParams.get('github');
    const repoStatus = searchParams.get('repos');
    const errorType = searchParams.get('error_type');
    const errorMessageParam = searchParams.get('message');

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
            errorMessage = 'The GITHUB_REDIRECT_URI configured in the .env file does not match the Authorization callback URL registered in the GitHub Developer settings.';
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
            <PageHeader title="Settings" description="Account integrations and deployment defaults." />
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
