import { create } from 'zustand';
import type { ParsedError } from '@/lib/utils/errorParser';

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface Toast {
    id: string;
    title: string;
    description: string;
    severity: ToastSeverity;
    action?: ToastAction;
    duration?: number;
    errorDetails?: ParsedError & { timestamp: string; deploymentId: string };
}

interface ToastState {
    toasts: Toast[];
    drawerOpen: boolean;
    activeErrorDetails: (ParsedError & { timestamp: string; deploymentId: string }) | null;
    addToast: (toast: Omit<Toast, 'id'>) => string;
    removeToast: (id: string) => void;
    openErrorDrawer: (details: ParsedError & { timestamp: string; deploymentId: string }) => void;
    closeErrorDrawer: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    drawerOpen: false,
    activeErrorDetails: null,
    addToast: (toast) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast = { ...toast, id };
        set((state) => ({ toasts: [...state.toasts, newToast] }));
        
        // Auto-remove toast
        const duration = toast.duration !== undefined ? toast.duration : 6000;
        if (duration > 0) {
            setTimeout(() => {
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                }));
            }, duration);
        }
        
        return id;
    },
    removeToast: (id) =>
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        })),
    openErrorDrawer: (details) =>
        set({
            drawerOpen: true,
            activeErrorDetails: details,
        }),
    closeErrorDrawer: () =>
        set({
            drawerOpen: false,
            activeErrorDetails: null,
        }),
}));
