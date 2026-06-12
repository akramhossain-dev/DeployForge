'use client';

import { useToastStore, Toast } from '@/lib/store/useToastStore';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-sm w-full flex-col gap-3 pointer-events-none">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const { severity, title, description, action } = toast;

    const icons = {
        info: <Info className="h-5 w-5 text-cyan-400" />,
        success: <CheckCircle className="h-5 w-5 text-emerald-400" />,
        warning: <AlertTriangle className="h-5 w-5 text-amber-400" />,
        error: <AlertCircle className="h-5 w-5 text-rose-400" />,
    };

    const themes = {
        info: 'border-cyan-500/30 bg-slate-900/95 text-slate-100 shadow-cyan-950/20',
        success: 'border-emerald-500/30 bg-slate-900/95 text-slate-100 shadow-emerald-950/20',
        warning: 'border-amber-500/30 bg-slate-900/95 text-slate-100 shadow-amber-950/20',
        error: 'border-rose-500/30 bg-slate-900/95 text-slate-100 shadow-rose-950/20',
    };

    return (
        <div
            className={clsx(
                'pointer-events-auto flex w-full flex-col rounded-lg border p-4 shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-0 scale-100 animate-slide-up',
                themes[severity]
            )}
            style={{
                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                    <div className="shrink-0 mt-0.5">{icons[severity]}</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold leading-tight">{title}</p>
                        <p className="mt-1 text-xs text-slate-400 leading-normal">{description}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
            {action ? (
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            action.onClick();
                            onClose();
                        }}
                        className="rounded bg-white/10 px-2.5 py-1 text-xs font-bold text-slate-200 hover:bg-white/15 hover:text-white transition-colors"
                    >
                        {action.label}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
