'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { webConfig } from '@/lib/config/env';
import { useToastStore } from '@/lib/store/useToastStore';
import { parseError } from '@/lib/utils/errorParser';
import type {
    AdminDeployment,
    AdminGitHubAccount,
    AdminLog,
    AdminMonitoring,
    AdminOverview,
    AdminUser,
    AdminVps,
    Deployment,
    Domain,
    DeploymentLog,
    GitHubProfile,
    PublicStats,
    Repository,
    Vps,
    VpsConnectionPayload,
    VpsConnectionResult,
} from '@/lib/api/types';

function handleMutationError(title: string, error: any, deploymentId?: string) {
    const rawMsg = error?.message || error?.response?.data?.message || String(error || '');
    const parsed = parseError(rawMsg);
    
    useToastStore.getState().addToast({
        title,
        description: parsed.explanation.split('\n')[0] || 'An unexpected error occurred.',
        severity: 'error',
        action: {
            label: 'View Details',
            onClick: () => {
                useToastStore.getState().openErrorDrawer({
                    ...parsed,
                    timestamp: new Date().toISOString(),
                    deploymentId: deploymentId || 'system-action',
                });
            },
        },
    });
}

function handleMutationSuccess(title: string, description: string) {
    useToastStore.getState().addToast({
        title,
        description,
        severity: 'success',
    });
}

export const queryKeys = {
    me: ['auth', 'me'] as const,
    publicStats: ['public', 'stats'] as const,
    githubProfile: ['github', 'profile'] as const,
    repositories: ['github', 'repositories'] as const,
    deployments: ['deployments'] as const,
    deployment: (id: string) => ['deployments', id] as const,
    domains: ['domains'] as const,
    domainSubdomains: (deploymentId: string) => ['domains', 'subdomains', deploymentId] as const,
    domainDns: (domainName: string) => ['domains', 'dns', domainName] as const,
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
    const { user, isAuthenticated, hasHydrated, setUser, logout } = useAuthStore();
    const me = useMe(hasHydrated && !user);

    useEffect(() => {
        if (me.data) setUser(me.data);
    }, [me.data, setUser]);

    useEffect(() => {
        if (!me.isError) return;
        logout();
    }, [logout, me.isError]);

    return {
        user,
        isAuthenticated,
        isLoading: !hasHydrated || (me.isLoading && !user),
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
            handleMutationSuccess('Repositories Synced', 'Successfully synchronized your GitHub repositories.');
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
            queryClient.invalidateQueries({ queryKey: queryKeys.githubProfile });
        },
        onError: (err) => handleMutationError('Sync Failed', err),
    });
}

export function useDisconnectGitHub() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.delete<{ message: string }>('/github/disconnect'),
        onSuccess: () => {
            handleMutationSuccess('GitHub Disconnected', 'Successfully disconnected your GitHub account.');
            queryClient.setQueryData(queryKeys.githubProfile, null);
            queryClient.setQueryData(queryKeys.repositories, []);
            queryClient.invalidateQueries({ queryKey: queryKeys.githubProfile });
            queryClient.invalidateQueries({ queryKey: queryKeys.repositories });
        },
        onError: (err) => handleMutationError('Disconnect Failed', err),
    });
}

export function useDeployments(enabled = true) {
    return useQuery({
        queryKey: queryKeys.deployments,
        queryFn: () => api.get<Deployment[]>('/deployments'),
        enabled,
        refetchInterval: (query) => {
            const deployments = query.state.data || [];
            return deployments.some((deployment) => ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'DELETING'].includes(deployment.status)) ? 4000 : 20000;
        },
    });
}

export function useDeployment(deploymentId?: string) {
    return useQuery({
        queryKey: queryKeys.deployment(deploymentId || 'none'),
        queryFn: () => api.get<Deployment>(`/deployments/${deploymentId}`),
        enabled: !!deploymentId,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status && ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING', 'DELETING'].includes(status) ? 3000 : 15000;
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

export function useDomains(enabled = true) {
    return useQuery({
        queryKey: queryKeys.domains,
        queryFn: () => api.get<Domain[]>('/domain/list'),
        enabled,
        refetchInterval: 30000,
    });
}

export function useDeploymentSubdomains(deploymentId?: string) {
    return useQuery({
        queryKey: queryKeys.domainSubdomains(deploymentId || 'none'),
        queryFn: () => api.get<Domain[]>(`/domain/subdomains/${deploymentId}`),
        enabled: !!deploymentId,
    });
}

export function useVerifyDns(domainName?: string, vpsIp?: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.domainDns(domainName || ''),
        queryFn: () => api.get<{
            isValid: boolean;
            resolvedIps: string[];
            cname: string | null;
            expectedIp: string;
            propagated: boolean;
            checkedAt: string;
        }>(`/domain/verify-dns/${encodeURIComponent(domainName!)}?vpsIp=${encodeURIComponent(vpsIp!)}`),
        enabled: !!domainName && !!vpsIp && enabled,
        retry: false,
        staleTime: 10000,
    });
}

export function useAttachDomain() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { deploymentId: string; domainName: string }) =>
            api.post<Domain>('/domain/attach', payload),
        onSuccess: () => {
            handleMutationSuccess('Domain Attached', 'Domain has been successfully bound to the deployment.');
            queryClient.invalidateQueries({ queryKey: queryKeys.domains });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
        },
        onError: (err) => handleMutationError('Domain Attach Failed', err),
    });
}

export function useRemoveDomain() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (domainId: string) => api.delete<{ message: string }>(`/domain/remove/${domainId}`),
        onSuccess: () => {
            handleMutationSuccess('Domain Removed', 'Domain has been successfully detached and removed.');
            queryClient.invalidateQueries({ queryKey: queryKeys.domains });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
        },
        onError: (err) => handleMutationError('Domain Removal Failed', err),
    });
}

export function useIssueSSL() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (domainId: string) => api.post<{ message: string }>(`/domain/ssl/issue/${domainId}`),
        onSuccess: () => {
            handleMutationSuccess('SSL Issued', 'SSL certificate has been successfully issued via Certbot.');
            queryClient.invalidateQueries({ queryKey: queryKeys.domains });
        },
        onError: (err) => handleMutationError('SSL Issuance Failed', err),
    });
}

export function useToggleAutoHttps() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ domainId, enabled }: { domainId: string; enabled: boolean }) =>
            api.post<Domain>(`/domain/auto-https/${domainId}`, { enabled }),
        onSuccess: (_data, { enabled }) => {
            handleMutationSuccess(
                enabled ? 'Auto-HTTPS Enabled' : 'Auto-HTTPS Disabled',
                enabled ? 'HTTP traffic will now automatically redirect to HTTPS.' : 'Auto-HTTPS redirect has been disabled.'
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.domains });
        },
        onError: (err) => handleMutationError('Auto-HTTPS Toggle Failed', err),
    });
}

export function useCreateGithubDeployment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { repositoryId: string; vpsId: string; branch: string; environment: 'production' | 'development'; autoDeploy: boolean; domainName?: string; env?: Record<string, string>; mode?: 'production' | 'sandbox' }) =>
            api.post<Deployment>('/deploy/github', payload),
        onSuccess: (deployment) => {
            handleMutationSuccess('Deployment Triggered', 'GitHub deployment has been successfully queued.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.setQueryData(queryKeys.deployment(deployment.id), deployment);
        },
        onError: (err) => handleMutationError('Deployment Trigger Failed', err),
    });
}

export function useCreateUploadDeployment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { file: File; vpsId: string; projectId?: string; name: string; environment: 'production' | 'development'; domainName?: string; env?: Record<string, string>; mode?: 'production' | 'sandbox' }) => {
            const form = new FormData();
            form.set('vpsId', payload.vpsId);
            form.set('name', payload.name);
            form.set('environment', payload.environment);
            form.set('mode', payload.mode || 'production');
            if (payload.projectId) form.set('projectId', payload.projectId);
            if (payload.domainName) form.set('domainName', payload.domainName);
            if (payload.env && Object.keys(payload.env).length > 0) form.set('env', JSON.stringify(payload.env));
            form.set('file', payload.file);
            return api.post<Deployment>('/deploy/upload', form);
        },
        onSuccess: (deployment) => {
            handleMutationSuccess('Upload Completed', 'Deployment archive uploaded successfully.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.setQueryData(queryKeys.deployment(deployment.id), deployment);
        },
        onError: (err) => handleMutationError('Upload Deployment Failed', err),
    });
}

export function useDeleteDeployment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete<{ success: boolean }>(`/deployments/${id}`),
        onSuccess: (_data, id) => {
            handleMutationSuccess('Deployment Deleted', 'Successfully stopped and removed the deployment.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.domains });
        },
        onError: (err, id) => handleMutationError('Deletion Failed', err, id),
    });
}

export function useRestartDeployment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.post<{ message: string }>(`/deployments/${id}/restart`),
        onSuccess: (_data, id) => {
            handleMutationSuccess('Restart Initiated', 'Restart command sent to deployment container.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
        },
        onError: (err, id) => handleMutationError('Restart Failed', err, id),
    });
}

function useLifecycleMutation(action: 'start' | 'stop' | 'pause' | 'resume') {
    const queryClient = useQueryClient();
    const actionLabels = {
        start: 'Started',
        stop: 'Stopped',
        pause: 'Paused',
        resume: 'Resumed',
    };
    return useMutation({
        mutationFn: (id: string) => api.post<{ message: string }>(`/deployments/${id}/${action}`),
        onSuccess: (_data, id) => {
            handleMutationSuccess(`Deployment ${actionLabels[action]}`, `Successfully executed ${action} action.`);
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.deploymentLogs(id) });
        },
        onError: (err, id) => handleMutationError(`Action '${action}' Failed`, err, id),
    });
}

export function useStartDeployment() {
    return useLifecycleMutation('start');
}

export function useStopDeployment() {
    return useLifecycleMutation('stop');
}

export function usePauseDeployment() {
    return useLifecycleMutation('pause');
}

export function useResumeDeployment() {
    return useLifecycleMutation('resume');
}

export function useRollbackDeployment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, historyId }: { id: string; historyId?: string }) => api.post<{ success: boolean; version: string }>(`/deployments/${id}/rollback`, historyId ? { historyId } : undefined),
        onSuccess: (_data, payload) => {
            handleMutationSuccess('Rollback Succeeded', 'Successfully reverted to the selected deployment version.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployment(payload.id) });
        },
        onError: (err, payload) => handleMutationError('Rollback Failed', err, payload.id),
    });
}

function wsUrl(path: string) {
    const base = webConfig.apiUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    return `${base}${path}`;
}

export function useDeploymentLogStream(deploymentId?: string, enabled = true) {
    const [logs, setLogs] = useState<DeploymentLog[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!deploymentId || !enabled) return;
        const socket = new WebSocket(wsUrl(`/ws/deployments/${deploymentId}/logs`));
        socket.onopen = () => setIsConnected(true);
        socket.onclose = () => setIsConnected(false);
        socket.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.event === 'deployment:log' && payload.data) {
                setLogs((current) => current.some((log) => log.id === payload.data.id) ? current : [...current, payload.data]);
            }
        };
        return () => socket.close();
    }, [deploymentId, enabled]);

    useEffect(() => setLogs([]), [deploymentId]);
    return { logs, isConnected };
}

export function useDeploymentStatusStream(deploymentId?: string) {
    const [status, setStatus] = useState<Partial<Deployment> | null>(null);

    useEffect(() => {
        if (!deploymentId) return;
        const socket = new WebSocket(wsUrl(`/ws/deployments/${deploymentId}/status`));
        socket.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.event === 'deployment:status') setStatus(payload.data);
        };
        return () => socket.close();
    }, [deploymentId]);

    return useMemo(() => status, [status]);
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
        onSuccess: (data, payload) => {
            if (data.success) {
                handleMutationSuccess('Connection Succeeded', 'VPS connection test completed successfully.');
            } else {
                handleMutationError('Connection Failed', data.message);
            }
            if ('id' in payload) queryClient.invalidateQueries({ queryKey: queryKeys.vps });
        },
        onError: (err) => handleMutationError('Connection Check Failed', err),
    });
}

export function useAddVps() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: VpsConnectionPayload & { name: string }) => api.post<Vps>('/vps/add', payload),
        onSuccess: () => {
            handleMutationSuccess('VPS Added', 'Successfully registered and provisioned the VPS.');
            queryClient.invalidateQueries({ queryKey: queryKeys.vps });
        },
        onError: (err) => handleMutationError('VPS Addition Failed', err),
    });
}

export function useDeleteVps() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.delete<{ message: string }>(`/vps/${id}`),
        onSuccess: () => {
            handleMutationSuccess('VPS Deleted', 'Successfully removed VPS registration.');
            queryClient.invalidateQueries({ queryKey: queryKeys.vps });
        },
        onError: (err) => handleMutationError('VPS Deletion Failed', err),
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
            handleMutationSuccess('Admin Action Executed', 'Action completed successfully.');
            queryClient.invalidateQueries({ queryKey: ['admin'] });
        },
        onError: (err) => handleMutationError('Admin Action Failed', err),
    });
}
