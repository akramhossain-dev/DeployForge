'use client';

import { useToastStore, Toast } from '@/lib/store/useToastStore';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 pointer-events-none">
            <style>{`
                @keyframes toastSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(4px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

const ICONS: Record<string, React.ReactNode> = {
    info:    <Info size={14} className="text-[#A1A1A1]" />,
    success: <CheckCircle2 size={14} className="text-emerald-400" />,
    warning: <AlertTriangle size={14} className="text-amber-400" />,
    error:   <AlertCircle size={14} className="text-rose-400" />,
    loading: <Loader2 size={14} className="animate-spin text-[#A1A1A1]" />,
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const { severity, title, description, action } = toast;

    return (
        <div
            className="glass-toast pointer-events-auto relative w-full rounded-md p-3 transition-all duration-150 ease-out"
            style={{ animation: 'toastSlideIn 0.15s ease-out forwards' }}
        >
            <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0">{ICONS[severity] || ICONS.info}</div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-tight text-white">{title}</p>
                    {description && (
                        <p className="mt-1 text-xs leading-normal text-[#A1A1A1]">{description}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#666666] transition-colors hover:bg-[#111111] hover:text-white"
                    aria-label="Dismiss"
                >
                    <X size={12} />
                </button>
            </div>
            {action && (
                <div className="mt-2.5 flex justify-end border-t border-[#1F1F1F] pt-2">
                    <button
                        type="button"
                        onClick={() => {
                            action.onClick();
                            onClose();
                        }}
                        className="rounded border border-[#1F1F1F] bg-[#111111] px-2.5 py-1 text-[11px] font-mono font-medium text-white transition-colors hover:bg-[#1F1F1F]"
                    >
                        {action.label}
                    </button>
                </div>
            )}
        </div>
    );
}
