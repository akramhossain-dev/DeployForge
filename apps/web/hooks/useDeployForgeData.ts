'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/useAuthStore';
import type {
    AdminDeployment,
    AdminGitHubAccount,
    AdminLog,
    AdminMonitoring,
    AdminOverview,
    AdminUser,
    AdminVps,
    Deployment,
    DeploymentLog,
    GitHubProfile,
    PublicStats,
    Repository,
    Vps,
    VpsConnectionPayload,
    VpsConnectionResult,
} from '@/lib/api/types';

export const queryKeys = {
    me: ['auth', 'me'] as const,
    publicStats: ['public', 'stats'] as const,
    githubProfile: ['github', 'profile'] as const,
    repositories: ['github', 'repositories'] as const,
    deployments: ['deployments'] as const,
    vps: ['vps'] as const,
    deploymentLogs: (id: string) => ['deployments', id, 'logs'] as const,
    adminOverview: ['admin', 'overview'] as const,
    adminMe: ['admin', 'me'] as const,
    adminAccounts: ['admin', 'accounts'] as const,
    adminUsers: (params?: Record<string, string>) => ['admin', 'platform-users', params || {}] as const,
    adminDeployments: (params?: Record<string, string>) => ['admin', 'deployments', params || {}] as const,
    adminVps: ['admin', 'vps'] as const,
    adminGithub: ['admin', 'github'] as const,
    adminMonitoring: ['admin', 'monitoring'] as const,
    adminLogs: (params?: Record<string, string>) => ['admin', 'logs', params || {}] as const,
    adminSettings: ['admin', 'settings'] as const,
};

function withQuery(path: string, params?: Record<string, string>) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value) search.set(key, value);
    });
    const query = search.toString();
    return query ? `${path}?${query}` : path;
}

export function useMe(enabled = true) {
    return useQuery({
        queryKey: queryKeys.me,
        queryFn: () => api.get<{ user: any }>('/auth/me').then((res) => res.user),
        enabled,
        retry: false,
    });
}

export function useAuthSession() {
    const { hasHydrated, token, setUser, logout } = useAuthStore();
    const me = useMe(hasHydrated && !!token);

    useEffect(() => {
        if (me.data) setUser(me.data);
    }, [me.data, setUser]);

    useEffect(() => {
        if (!me.isError) return;
        logout();
    }, [logout, me.isError]);

    return {
        user: me.data ?? null,
        isAuthenticated: Boolean(me.data),
        isLoading: !hasHydrated || (Boolean(token) && me.isLoading),
        isFetching: me.isFetching,
        isError: me.isError,
        refetch: me.refetch,
    };
}

export function usePublicStats() {
    return useQuery({
        queryKey: queryKeys.publicStats,
        queryFn: () => api.get<PublicStats>('/public/stats'),
        retry: false,
        refetchInterval: 60000,
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

export function useDeployments(enabled = true) {
    return useQuery({
        queryKey: queryKeys.deployments,
        queryFn: () => api.get<Deployment[]>('/deploy/list'),
        enabled,
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

export function useVpsList(enabled = true) {
    return useQuery({
        queryKey: queryKeys.vps,
        queryFn: () => api.get<Vps[]>('/vps/list'),
        enabled,
        refetchInterval: 30000,
    });
}

export function useTestVpsConnection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: VpsConnectionPayload | { id: string }) => api.post<VpsConnectionResult>('/vps/test-connection', payload),
        onSuccess: (_data, payload) => {
            if ('id' in payload) queryClient.invalidateQueries({ queryKey: queryKeys.vps });
        },
    });
}

export function useAddVps() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: VpsConnectionPayload & { name: string }) => api.post<Vps>('/vps/add', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.vps });
        },
    });
}

export function useDeleteVps() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.delete<{ message: string }>(`/vps/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.vps });
        },
    });
}

export function useAdminOverview() {
    return useQuery({
        queryKey: queryKeys.adminOverview,
        queryFn: () => api.get<AdminOverview>('/admin/overview'),
        refetchInterval: 30000,
    });
}

export function useAdminMe(enabled = true) {
    return useQuery({
        queryKey: queryKeys.adminMe,
        queryFn: () => api.get<any>('/admin/me'),
        enabled,
        retry: false,
    });
}

export function useAdminAccounts(enabled = true) {
    return useQuery({
        queryKey: queryKeys.adminAccounts,
        queryFn: () => api.get<any[]>('/admin/users'),
        enabled,
    });
}

export function useAdminUsers(params?: Record<string, string>) {
    return useQuery({
        queryKey: queryKeys.adminUsers(params),
        queryFn: () => api.get<AdminUser[]>(withQuery('/admin/platform-users', params)),
    });
}

export function useAdminDeployments(params?: Record<string, string>) {
    return useQuery({
        queryKey: queryKeys.adminDeployments(params),
        queryFn: () => api.get<AdminDeployment[]>(withQuery('/admin/deployments', params)),
        refetchInterval: 15000,
    });
}

export function useAdminVps() {
    return useQuery({
        queryKey: queryKeys.adminVps,
        queryFn: () => api.get<AdminVps[]>('/admin/vps'),
        refetchInterval: 30000,
    });
}

export function useAdminGithubAccounts() {
    return useQuery({
        queryKey: queryKeys.adminGithub,
        queryFn: () => api.get<AdminGitHubAccount[]>('/admin/github/accounts'),
    });
}

export function useAdminMonitoring() {
    return useQuery({
        queryKey: queryKeys.adminMonitoring,
        queryFn: () => api.get<AdminMonitoring>('/admin/monitoring'),
        refetchInterval: 15000,
    });
}

export function useAdminLogs(params?: Record<string, string>) {
    return useQuery({
        queryKey: queryKeys.adminLogs(params),
        queryFn: () => api.get<AdminLog[]>(withQuery('/admin/logs', params)),
        refetchInterval: 20000,
    });
}

export function useAdminSettings() {
    return useQuery({
        queryKey: queryKeys.adminSettings,
        queryFn: () => api.get<any>('/admin/settings'),
    });
}

export function useAdminAction() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'delete'; path: string; body?: unknown }) => {
            if (method === 'delete') return api.delete(path);
            if (method === 'patch') return api.patch(path, body);
            return api.post(path, body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin'] });
        },
    });
}
