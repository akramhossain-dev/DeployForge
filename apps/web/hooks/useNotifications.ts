'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api/client';
import { webConfig } from '@/lib/config/env';
import { useToastStore } from '@/lib/store/useToastStore';
import type { AppNotification, NotificationListResponse, AlertSettings } from '@/lib/api/types';

const queryKeys = {
    notifications: (params?: Record<string, string>) => ['notifications', params || {}] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    recent: ['notifications', 'recent'] as const,
    alertSettings: ['alert-settings'] as const,
};

function withQuery(path: string, params?: Record<string, string>) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value) search.set(key, value);
    });
    const query = search.toString();
    return query ? `${path}?${query}` : path;
}

// ─── Notification List ──────────────────────────────────────────────
export function useNotifications(params?: Record<string, string>) {
    return useQuery({
        queryKey: queryKeys.notifications(params),
        queryFn: () => api.get<NotificationListResponse>(withQuery('/notifications', params)),
        refetchInterval: 30000,
    });
}

// ─── Unread Count ───────────────────────────────────────────────────
export function useUnreadCount() {
    return useQuery({
        queryKey: queryKeys.unreadCount,
        queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
        refetchInterval: 15000,
    });
}

// ─── Recent Notifications (dropdown) ────────────────────────────────
export function useRecentNotifications() {
    return useQuery({
        queryKey: queryKeys.recent,
        queryFn: () => api.get<AppNotification[]>('/notifications/recent'),
        refetchInterval: 15000,
    });
}

// ─── Mark As Read ───────────────────────────────────────────────────
export function useMarkAsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

// ─── Mark All Read ──────────────────────────────────────────────────
export function useMarkAllAsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.patch('/notifications/read-all'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

// ─── Delete Notification ────────────────────────────────────────────
export function useDeleteNotification() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/notifications/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

// ─── Delete All Notifications ───────────────────────────────────────
export function useDeleteAllNotifications() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.delete('/notifications/all'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

// ─── Alert Settings ─────────────────────────────────────────────────
export function useAlertSettings() {
    return useQuery({
        queryKey: queryKeys.alertSettings,
        queryFn: () => api.get<AlertSettings>('/alert-settings'),
    });
}

export function useUpdateAlertSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<Omit<AlertSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) =>
            api.patch<AlertSettings>('/alert-settings', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.alertSettings });
            useToastStore.getState().addToast({
                title: 'Settings Saved',
                description: 'Alert settings updated successfully.',
                severity: 'success',
            });
        },
        onError: (err: any) => {
            useToastStore.getState().addToast({
                title: 'Save Failed',
                description: err.message || 'Failed to update alert settings.',
                severity: 'error',
            });
        },
    });
}

// ─── Real-time Notification Stream (WebSocket) ──────────────────────
export function useNotificationStream(enabled = true) {
    const queryClient = useQueryClient();
    const addToast = useToastStore.getState().addToast;
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const base = webConfig.apiUrl.replace(/^http/, 'ws').replace(/\/$/, '');
        const wsUrl = `${base}/ws/notifications`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => setIsConnected(true);
        socket.onclose = () => setIsConnected(false);

        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);

                if (payload.event === 'notification:new') {
                    const notification = payload.data as AppNotification;

                    // Show toast
                    const severityMap: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
                        INFO: 'info',
                        SUCCESS: 'success',
                        WARNING: 'warning',
                        CRITICAL: 'error',
                    };

                    addToast({
                        title: notification.title,
                        description: notification.message,
                        severity: severityMap[notification.level] || 'info',
                        duration: 8000,
                    });

                    // Invalidate queries to refresh UI
                    queryClient.invalidateQueries({ queryKey: ['notifications'] });
                }

                if (payload.event === 'notification:unread_count') {
                    queryClient.setQueryData(queryKeys.unreadCount, payload.data);
                }
            } catch {
                // Ignore parse errors
            }
        };

        return () => {
            socket.close();
            socketRef.current = null;
        };
    }, [enabled, queryClient, addToast]);

    return { isConnected };
}
