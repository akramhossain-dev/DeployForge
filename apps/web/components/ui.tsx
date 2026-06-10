'use client';

import clsx from 'clsx';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { ReactNode } from 'react';

export function PageHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
                {description ? <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p> : null}
            </div>
            {action}
        </div>
    );
}

export function Button({
    children,
    className,
    variant = 'primary',
    loading,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    loading?: boolean;
}) {
    return (
        <button
            {...props}
            disabled={props.disabled || loading}
            className={clsx(
                'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-55',
                variant === 'primary' && 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
                variant === 'secondary' && 'border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800',
                variant === 'danger' && 'bg-red-500 text-white hover:bg-red-400',
                variant === 'ghost' && 'text-slate-300 hover:bg-slate-800 hover:text-white',
                className
            )}
        >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {children}
        </button>
    );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
    return <section className={clsx('rounded-lg border border-slate-800 bg-slate-900/70 p-5', className)}>{children}</section>;
}

export function SkeletonBlock({ className }: { className?: string }) {
    return <div className={clsx('animate-pulse rounded-lg bg-slate-800/70', className)} />;
}

export function EmptyState({
    title,
    description,
    action,
}: {
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return (
        <Panel className="flex min-h-56 flex-col items-center justify-center text-center">
            <p className="text-base font-bold text-white">{title}</p>
            <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
            {action ? <div className="mt-5">{action}</div> : null}
        </Panel>
    );
}

export function ErrorState({
    title = 'Unable to load this view',
    message,
    onRetry,
}: {
    title?: string;
    message?: string;
    onRetry?: () => void;
}) {
    return (
        <Panel className="border-red-500/30 bg-red-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 shrink-0 text-red-300" size={20} />
                    <div>
                        <p className="font-bold text-red-100">{title}</p>
                        <p className="mt-1 text-sm text-red-200/80">{message || 'Please try again in a moment.'}</p>
                    </div>
                </div>
                {onRetry ? (
                    <Button variant="secondary" onClick={onRetry}>
                        <RefreshCw size={16} /> Retry
                    </Button>
                ) : null}
            </div>
        </Panel>
    );
}

export function StatusBadge({ status }: { status?: string }) {
    const normalized = (status || 'UNKNOWN').toUpperCase();
    const color =
        normalized === 'RUNNING' || normalized === 'ACTIVE' || normalized === 'SUCCESS'
            ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20'
            : normalized === 'BUILDING' || normalized === 'PENDING' || normalized === 'QUEUED'
              ? 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/20'
              : normalized === 'FAILED' || normalized === 'ERROR'
                ? 'bg-red-400/10 text-red-300 ring-red-400/20'
                : 'bg-slate-700/40 text-slate-300 ring-slate-600';

    return <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-black uppercase ring-1', color)}>{normalized}</span>;
}

export function formatDate(value?: string) {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        new Date(value)
    );
}
