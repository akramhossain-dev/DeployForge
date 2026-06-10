'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/client';
import type { Deployment, DeploymentLog, GitHubProfile, Repository, Vps } from '@/lib/api/types';

export const queryKeys = {
    me: ['auth', 'me'] as const,
    githubProfile: ['github', 'profile'] as const,
    repositories: ['github', 'repositories'] as const,
    deployments: ['deployments'] as const,
    vps: ['vps'] as const,
    deploymentLogs: (id: string) => ['deployments', id, 'logs'] as const,
};

export function useMe(enabled = true) {
    return useQuery({
        queryKey: queryKeys.me,
        queryFn: () => api.get<{ user: any }>('/auth/me').then((res) => res.user),
        enabled,
        retry: false,
    });
}

export function useGitHubProfile() {
    return useQuery({
        queryKey: queryKeys.githubProfile,
        queryFn: () => api.get<GitHubProfile | null>('/github/profile'),
        retry: false,
    });
}

export function useRepositories(enabled = true) {
    return useQuery({
        queryKey: queryKeys.repositories,
        queryFn: () => api.get<Repository[]>('/github/repos'),
        enabled,
        retry: false,
    });
}

export function useSyncRepositories() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.post<{ count: number }>('/github/repos/sync'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
            queryClient.invalidateQueries({ queryKey: queryKeys.githubProfile });
        },
    });
}

export function useDisconnectGitHub() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.delete<{ message: string }>('/github/disconnect'),
        onSuccess: () => {
            queryClient.setQueryData(queryKeys.githubProfile, null);
            queryClient.setQueryData(queryKeys.repositories, []);
            queryClient.invalidateQueries({ queryKey: queryKeys.githubProfile });
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
        },
    });
}

export function useDeployments() {
    return useQuery({
        queryKey: queryKeys.deployments,
        queryFn: () => api.get<Deployment[]>('/deploy/list'),
        refetchInterval: (query) => {
            const deployments = query.state.data || [];
            return deployments.some((deployment) => ['PENDING', 'BUILDING'].includes(deployment.status)) ? 4000 : 20000;
        },
    });
}

export function useDeploymentLogs(deploymentId?: string) {
    return useQuery({
        queryKey: queryKeys.deploymentLogs(deploymentId || 'none'),
        queryFn: () => api.get<DeploymentLog[]>(`/deploy/${deploymentId}/logs`),
        enabled: !!deploymentId,
        refetchInterval: 5000,
    });
}

export function useVpsList() {
    return useQuery({
        queryKey: queryKeys.vps,
        queryFn: () => api.get<Vps[]>('/vps/list'),
        refetchInterval: 30000,
    });
}
