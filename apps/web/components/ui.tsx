'use client';

import clsx from 'clsx';
import { AlertCircle, Eye, EyeOff, Loader2, RefreshCw, X } from 'lucide-react';
import { ReactNode, useEffect, useState, forwardRef } from 'react';

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">{title}</h1>
                {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p> : null}
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
    variant?: 'primary' | 'secondary' | 'danger';
    loading?: boolean;
}) {
    return (
        <button
            {...props}
            disabled={props.disabled || loading}
            className={clsx(
                'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-black transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-55',
                variant === 'primary' && 'bg-white text-slate-950 shadow-lg shadow-cyan-950/20 hover:scale-[1.01] hover:bg-cyan-50',
                variant === 'secondary' && 'border border-white/10 bg-white/[0.07] text-slate-100 backdrop-blur-md hover:border-white/20 hover:bg-white/[0.11]',
                variant === 'danger' && 'border border-rose-400/30 bg-rose-500/90 text-white shadow-lg shadow-rose-950/20 hover:bg-rose-400',
                className
            )}
        >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {children}
        </button>
    );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
    return <section className={clsx('rounded-lg border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl', className)}>{children}</section>;
}

export function SkeletonBlock({ className }: { className?: string }) {
    return <div className={clsx('animate-pulse rounded-lg border border-white/10 bg-white/[0.07]', className)} />;
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
            <p className="text-base font-black text-white">{title}</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>
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
        <Panel className="border-rose-400/30 bg-rose-500/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 shrink-0 text-rose-300" size={20} />
                    <div>
                        <p className="font-black text-rose-100">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-rose-100/75">{message || 'Please try again in a moment.'}</p>
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
        normalized === 'RUNNING' || normalized === 'ROLLED_BACK' || normalized === 'ACTIVE' || normalized === 'SUCCESS'
            ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20'
            : normalized === 'BUILDING' || normalized === 'PENDING' || normalized === 'QUEUED' || normalized === 'CLONING' || normalized === 'UPLOADING' || normalized === 'EXTRACTING' || normalized === 'DEPLOYING'
                ? 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/20'
                : normalized === 'FAILED' || normalized === 'ERROR' || normalized === 'BROKEN'
                    ? 'bg-rose-400/10 text-rose-300 ring-rose-400/20'
                    : normalized === 'DELETED'
                        ? 'bg-slate-800 text-slate-400 ring-slate-700'
                        : 'bg-slate-700/40 text-slate-300 ring-slate-600';

    return <span className={clsx('inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase ring-1', color)}>{normalized}</span>;
}

export function formatDate(value?: string) {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        new Date(value)
    );
}

export const inputClassName = 'w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50';

export const PasswordInput = forwardRef<
    HTMLInputElement,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
        wrapperClassName?: string;
    }
>(({ className, wrapperClassName, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className={clsx('relative', wrapperClassName)}>
            <input
                ref={ref}
                {...props}
                type={showPassword ? 'text' : 'password'}
                className={clsx(className || inputClassName, 'pr-12')}
            />
            <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.07] hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
});
PasswordInput.displayName = 'PasswordInput';

export function SectionHeading({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
    return (
        <div className="mb-5 flex items-start gap-3">
            {icon ? <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">{icon}</div> : null}
            <div>
                <h2 className="text-base font-black text-white">{title}</h2>
                {description ? <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p> : null}
            </div>
        </div>
    );
}

export const AppButton = Button;
export const AppCard = Panel;
export const AppInput = inputClassName;

export function AppTable({
    columns,
    rows,
    empty,
    minWidth = 760,
}: {
    columns: string[];
    rows?: ReactNode[][];
    empty: string;
    minWidth?: number;
}) {
    if (!rows) {
        return <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-16" />)}</div>;
    }
    if (!rows.length) {
        return <p className="rounded-lg border border-white/10 bg-slate-950/45 p-5 text-sm leading-6 text-slate-400">{empty}</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ minWidth }}>
                <thead className="text-xs uppercase text-slate-500">
                    <tr>{columns.map((column) => <th key={column} className="border-b border-white/10 px-3 py-3 font-black">{column}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                    {rows.map((row, index) => (
                        <tr key={index} className="align-top transition-colors hover:bg-white/[0.03]">
                            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-4">{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function AppModal({
    title,
    children,
    open,
    onClose,
}: {
    title: string;
    children: ReactNode;
    open: boolean;
    onClose: () => void;
}) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <Panel className="w-full max-w-lg">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 className="text-lg font-black text-white">{title}</h2>
                    <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-slate-300 hover:text-white" aria-label="Close modal">
                        <X size={16} />
                    </button>
                </div>
                {children}
            </Panel>
        </div>
    );
}
