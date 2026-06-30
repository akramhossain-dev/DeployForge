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
    VpsServerInfo,
    VpsLiveMetrics,
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
    deploymentEnv: (id: string) => ['deployments', id, 'env'] as const,
    deploymentEnvHistory: (id: string) => ['deployments', id, 'env', 'history'] as const,
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
        queryFn: () => api.get<GitHubProfile | null>('/auth/github/profile'),
        retry: false,
    });
}

export function useRepositories(enabled = true) {
    return useQuery({
        queryKey: queryKeys.repositories,
        queryFn: () => api.get<Repository[]>('/auth/github/repos'),
        enabled,
        retry: false,
    });
}

export function useSyncRepositories() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.post<{ count: number }>('/auth/github/repos/sync'),
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
        mutationFn: () => api.delete<{ message: string }>('/auth/github/disconnect'),
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
        // MEDIUM FIX #12: Raise staleTime to 60s (was 10s) and disable refetch on
        // window focus so expanding multiple cards doesn't self-rate-limit at 30/min.
        staleTime: 60000,
        refetchOnWindowFocus: false,
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
        mutationFn: (payload: { repositoryId: string; vpsId: string; branch: string; environment: 'production' | 'development'; autoDeploy: boolean; domainName?: string; env?: any; mode?: 'production' | 'sandbox' }) =>
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
        mutationFn: (payload: { file: File; vpsId: string; projectId?: string; name: string; environment: 'production' | 'development'; domainName?: string; env?: any; mode?: 'production' | 'sandbox' }) => {
            const form = new FormData();
            form.set('vpsId', payload.vpsId);
            form.set('name', payload.name);
            form.set('environment', payload.environment);
            form.set('mode', payload.mode || 'production');
            if (payload.projectId) form.set('projectId', payload.projectId);
            if (payload.domainName) form.set('domainName', payload.domainName);
            if (payload.env) {
                form.set('env', typeof payload.env === 'string' ? payload.env : JSON.stringify(payload.env));
            }
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
            if ('id' in payload) {
                queryClient.invalidateQueries({ queryKey: queryKeys.vps });
                queryClient.invalidateQueries({ queryKey: queryKeys.adminVps });
            }
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

export function useVpsServerInfo(vpsId?: string) {
    return useQuery({
        queryKey: ['vps', vpsId, 'info'] as const,
        queryFn: () => api.get<VpsServerInfo>(`/vps/${vpsId}/info`).then((res: any) => res.data ?? res),
        enabled: !!vpsId,
        staleTime: 60000,
        retry: false,
    });
}

export function useVpsLiveMetrics(vpsId?: string, enabled = true) {
    return useQuery({
        queryKey: ['vps', vpsId, 'live-metrics'] as const,
        queryFn: () => api.get<VpsLiveMetrics>(`/vps/${vpsId}/live-metrics`).then((res: any) => res.data ?? res),
        enabled: !!vpsId && enabled,
        refetchInterval: 3000,
        staleTime: 0,
        retry: false,
    });
}

export function useVpsHealthHistory(vpsId?: string, range = '24h', from?: string, to?: string, enabled = true) {
    return useQuery({
        queryKey: ['vps', vpsId, 'health-history', range, from, to] as const,
        queryFn: () => {
            const queryParams = new URLSearchParams();
            queryParams.set('range', range);
            if (from) queryParams.set('from', from);
            if (to) queryParams.set('to', to);
            return api.get<any[]>(`/vps/${vpsId}/history?${queryParams.toString()}`).then((res: any) => res.data ?? res);
        },
        enabled: !!vpsId && enabled,
        staleTime: 10000,
        retry: false,
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

export function useAdminVpsLiveMetrics(vpsId?: string, enabled = true) {
    return useQuery({
        queryKey: ['admin', 'vps', vpsId, 'live-metrics'] as const,
        queryFn: () => api.get<VpsLiveMetrics>(`/admin/vps/${vpsId}/live-metrics`),
        enabled: !!vpsId && enabled,
        refetchInterval: 3000,
        staleTime: 0,
        retry: false,
    });
}

export function useAdminVpsServerInfo(vpsId?: string) {
    return useQuery({
        queryKey: ['admin', 'vps', vpsId, 'info'] as const,
        queryFn: () => api.get<VpsServerInfo>(`/admin/vps/${vpsId}/info`),
        enabled: !!vpsId,
        staleTime: 60000,
        retry: false,
    });
}

export function useAdminVpsHealthHistory(vpsId?: string, range = '24h', from?: string, to?: string, enabled = true) {
    return useQuery({
        queryKey: ['admin', 'vps', vpsId, 'health-history', range, from, to] as const,
        queryFn: () => {
            const queryParams = new URLSearchParams();
            queryParams.set('range', range);
            if (from) queryParams.set('from', from);
            if (to) queryParams.set('to', to);
            return api.get<any[]>(`/admin/vps/${vpsId}/history?${queryParams.toString()}`);
        },
        enabled: !!vpsId && enabled,
        staleTime: 10000,
        retry: false,
    });
}

export function useAdminTestVpsConnection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.post<VpsConnectionResult>(`/admin/vps/${id}/test-connection`, {}),
        onSuccess: (data) => {
            if (data.success) {
                handleMutationSuccess('Connection Succeeded', 'VPS connection test completed successfully.');
            } else {
                handleMutationError('Connection Failed', new Error(data.message));
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.adminVps });
        },
        onError: (err) => handleMutationError('Connection Check Failed', err),
    });
}

export type EnvFile = {
    path: string;
    variables: Record<string, string>;
};

export type DeploymentEnvResponse = {
    version: number;
    files: EnvFile[];
};

export type DeploymentEnvHistoryEntry = {
    id: string;
    version: string;
    status: string;
    createdAt: string;
    env: DeploymentEnvResponse;
    deploymentNumber: number;
};

export function useDeploymentEnv(deploymentId?: string) {
    return useQuery({
        queryKey: queryKeys.deploymentEnv(deploymentId || 'none'),
        queryFn: () => api.get<DeploymentEnvResponse>(`/deployments/${deploymentId}/env`),
        enabled: !!deploymentId,
    });
}

export function useUpdateDeploymentEnv() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ deploymentId, env }: { deploymentId: string; env: DeploymentEnvResponse }) =>
            api.put<{ message: string }>(`/deployments/${deploymentId}/env`, env),
        onSuccess: (_, { deploymentId }) => {
            handleMutationSuccess('Environment Saved', 'Environment variables updated successfully.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deploymentEnv(deploymentId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployment(deploymentId) });
        },
        onError: (err) => handleMutationError('Save Failed', err),
    });
}

export function useDeploymentEnvHistory(deploymentId?: string) {
    return useQuery({
        queryKey: queryKeys.deploymentEnvHistory(deploymentId || 'none'),
        queryFn: () => api.get<DeploymentEnvHistoryEntry[]>(`/deployments/${deploymentId}/env/history`),
        enabled: !!deploymentId,
    });
}

export function useRedeploy() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (deploymentId: string) =>
            api.post<Deployment>(`/deployments/${deploymentId}/redeploy`, {}),
        onSuccess: (newDeployment) => {
            handleMutationSuccess('Redeployment Triggered', 'Redeployment job successfully created.');
            queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
            queryClient.invalidateQueries({ queryKey: queryKeys.deployment(newDeployment.id) });
        },
        onError: (err) => handleMutationError('Redeploy Failed', err),
    });
}
