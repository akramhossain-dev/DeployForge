'use client';

import { useToastStore, Toast } from '@/lib/store/useToastStore';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-5 right-5 z-[9999] flex w-full max-w-sm flex-col gap-2.5 pointer-events-none">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

const ICONS: Record<string, React.ReactNode> = {
    info:    <Info     size={16} className="text-cyan-300"    />,
    success: <CheckCircle2 size={16} className="text-emerald-300" />,
    warning: <AlertTriangle size={16} className="text-amber-300" />,
    error:   <AlertCircle size={16} className="text-rose-300" />,
};

const STRIPES: Record<string, string> = {
    info:    'from-cyan-400/50',
    success: 'from-emerald-400/50',
    warning: 'from-amber-400/50',
    error:   'from-rose-400/50',
};

const BORDERS: Record<string, string> = {
    info:    'border-cyan-400/20',
    success: 'border-emerald-400/20',
    warning: 'border-amber-400/15',
    error:   'border-rose-400/25',
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const { severity, title, description, action } = toast;

    return (
        <div
            className={clsx(
                'pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-slate-900/95 shadow-2xl shadow-slate-950/60 backdrop-blur-xl',
                BORDERS[severity]
            )}
            style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        >
            {/* Accent top stripe */}
            <div className={clsx('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', STRIPES[severity])} />

            <div className="p-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{ICONS[severity]}</div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black leading-tight text-white">{title}</p>
                        {description && <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-white"
                        aria-label="Dismiss"
                    >
                        <X size={13} />
                    </button>
                </div>
                {action && (
                    <div className="mt-3 flex justify-end border-t border-white/[0.06] pt-3">
                        <button
                            type="button"
                            onClick={() => { action.onClick(); onClose(); }}
                            className="rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-1.5 text-xs font-black text-slate-200 transition-colors hover:bg-white/[0.10] hover:text-white"
                        >
                            {action.label}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
