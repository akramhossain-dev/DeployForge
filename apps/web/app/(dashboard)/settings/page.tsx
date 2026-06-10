'use client';

import { Github } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock } from '@/components/ui';
import { useGitHubProfile } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';

export default function SettingsPage() {
    const profile = useGitHubProfile();

    async function connectGitHub() {
        const response = await api.get<{ url: string }>('/github/connect');
        window.location.href = response.url;
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Settings" description="Account integrations and deployment defaults." />
            <Panel>
                <h3 className="mb-4 font-bold text-white">GitHub Connection</h3>
                {profile.isLoading ? (
                    <SkeletonBlock className="h-24" />
                ) : profile.isError || !profile.data ? (
                    <EmptyState title="GitHub disconnected" description="Connect GitHub to sync repositories and install deployment webhooks." action={<Button onClick={connectGitHub}><Github size={16} /> Connect GitHub</Button>} />
                ) : (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-bold text-white">@{profile.data.username}</p>
                            <p className="text-sm text-slate-400">{profile.data.email || 'No public email'}</p>
                        </div>
                        <Button variant="secondary" onClick={connectGitHub}><Github size={16} /> Reconnect</Button>
                    </div>
                )}
                {profile.isError ? <div className="mt-4"><ErrorState title="Connection check failed" message={(profile.error as Error)?.message} onRetry={() => profile.refetch()} /></div> : null}
            </Panel>
        </div>
    );
}
