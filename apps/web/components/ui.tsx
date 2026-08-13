'use client';

import clsx from 'clsx';
import { AlertCircle, Eye, EyeOff, Loader2, RefreshCw, X } from 'lucide-react';
import { ReactNode, useEffect, useState, forwardRef } from 'react';

export const INPUT_STYLE =
    'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333] disabled:cursor-not-allowed disabled:opacity-50';

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-[#1F1F1F] pb-5">
            <div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
                {description ? <p className="mt-1 text-xs text-[#A1A1A1]">{description}</p> : null}
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
                'inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 font-mono text-xs font-semibold transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                variant === 'primary' && 'border border-[#1F1F1F] bg-white text-black hover:bg-[#E5E5E5]',
                variant === 'secondary' && 'border border-[#1F1F1F] bg-[#0A0A0A] text-white hover:bg-[#111111]',
                variant === 'danger' && 'border border-rose-900/50 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60',
                className
            )}
        >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {children}
        </button>
    );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
    return <section className={clsx('rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 shadow-sm', className)}>{children}</section>;
}

export function SkeletonBlock({ className }: { className?: string }) {
    return <div className={clsx('animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]', className)} />;
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
        <Panel className="flex min-h-48 flex-col items-center justify-center text-center font-mono text-xs">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 max-w-md text-[#A1A1A1]">{description}</p>
            {action ? <div className="mt-4">{action}</div> : null}
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
        <div className="flex flex-col gap-3 rounded-md border border-rose-900/50 bg-rose-950/20 p-4 font-mono text-xs text-rose-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
                <AlertCircle className="shrink-0 text-rose-400" size={16} />
                <div>
                    <p className="font-semibold text-rose-200">{title}</p>
                    {message ? <p className="mt-0.5 text-[11px] text-rose-300/80">{message}</p> : null}
                </div>
            </div>
            {onRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-7 items-center gap-1 rounded border border-rose-900/40 bg-rose-950/40 px-2.5 text-xs text-rose-200 hover:bg-rose-900/50"
                >
                    <RefreshCw size={12} /> Retry
                </button>
            ) : null}
        </div>
    );
}

export function StatusBadge({ status }: { status?: string }) {
    const s = (status || 'UNKNOWN').toUpperCase();
    let style = 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';
    if (['RUNNING', 'SUCCESS', 'ACTIVE', 'COMPLETED', 'ROLLED_BACK'].includes(s)) {
        style = 'border-[#1F1F1F] bg-[#000000] text-emerald-400';
    } else if (['FAILED', 'ERROR', 'CRITICAL', 'BROKEN'].includes(s)) {
        style = 'border-rose-900/40 bg-rose-950/20 text-rose-400';
    } else if (['BUILDING', 'DEPLOYING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'PENDING', 'QUEUED'].includes(s)) {
        style = 'border-[#1F1F1F] bg-[#000000] text-cyan-400';
    }

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', style)}>
            {s}
        </span>
    );
}

export function formatDate(value?: string) {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        new Date(value)
    );
}

export const inputClassName = INPUT_STYLE;

export const PasswordInput = forwardRef<
    HTMLInputElement,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
        wrapperClassName?: string;
    }
>(({ className, wrapperClassName, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className={clsx('relative w-full', wrapperClassName)}>
            <input
                ref={ref}
                {...props}
                type={showPassword ? 'text' : 'password'}
                className={clsx(className || INPUT_STYLE, 'pr-9')}
            />
            <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666666] hover:text-white transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
        </div>
    );
});
PasswordInput.displayName = 'PasswordInput';

export function SectionHeading({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
    return (
        <div className="mb-4 flex items-start gap-3 font-mono text-xs">
            {icon ? (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-white">
                    {icon}
                </div>
            ) : null}
            <div>
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                {description ? <p className="mt-0.5 text-xs text-[#A1A1A1]">{description}</p> : null}
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
        return <div className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-12" />)}</div>;
    }
    if (!rows.length) {
        return <p className="rounded border border-[#1F1F1F] bg-[#000000] p-4 text-center font-mono text-xs text-[#666666]">{empty}</p>;
    }
    return (
        <div className="overflow-x-auto rounded border border-[#1F1F1F] bg-[#000000]">
            <table className="w-full text-left font-mono text-xs" style={{ minWidth }}>
                <thead className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                    <tr>
                        {columns.map((column) => (
                            <th key={column} className="px-3.5 py-2.5 font-semibold uppercase tracking-wider">
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                    {rows.map((row, index) => (
                        <tr key={index} className="hover:bg-[#111111]/50 transition-colors">
                            {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="px-3.5 py-3">
                                    {cell}
                                </td>
                            ))}
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
    size = 'md',
}: {
    title: string;
    children: ReactNode;
    open: boolean;
    onClose: () => void;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}) {
    useEffect(() => {
        if (!open) return;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onClose]);

    const maxWidthMap = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-[95vw]',
    };

    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-[5vh] backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className={clsx('relative w-full my-auto', maxWidthMap[size])}>
                <div className="glass-modal flex flex-col rounded-md p-5 text-white font-mono text-xs">
                    {/* Modal header */}
                    <div className="mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-[#1F1F1F] pb-3">
                        <h2 className="text-sm font-bold text-white sm:text-base">{title}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] transition-colors hover:bg-[#1F1F1F] hover:text-white"
                            aria-label="Close modal"
                        >
                            <X size={13} />
                        </button>
                    </div>
                    {/* Modal body */}
                    <div className="min-h-0">{children}</div>
                </div>
            </div>
        </div>
    );
}
