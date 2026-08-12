'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';
import { AppButton, AppCard, AppTable, SectionHeading, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';

export function AdminStat({
    title, value, detail, icon,
}: { title: string; value: string | number; detail?: string; icon?: ReactNode }) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-[#666666]">{title}</span>
                {icon && <div className="text-[#A1A1A1]">{icon}</div>}
            </div>
            <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
            {detail && <p className="text-[11px] text-[#A1A1A1]">{detail}</p>}
        </div>
    );
}

export function ResourceBars({ cpu, ram, disk }: { cpu?: number; ram?: number; disk?: number }) {
    const bars = [
        { label: 'CPU Usage', value: cpu || 0 },
        { label: 'RAM Memory', value: ram || 0 },
        { label: 'Disk Storage', value: disk || 0 },
    ];

    return (
        <div className="space-y-3 font-mono text-xs">
            {bars.map(({ label, value }) => {
                const pct = Math.min(Math.round(value), 100);
                const color = pct > 85 ? 'bg-rose-400' : pct > 65 ? 'bg-amber-400' : 'bg-white';
                return (
                    <div key={label} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                            <span className="text-[#666666] font-semibold uppercase">{label}</span>
                            <span className="font-bold text-white">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded bg-[#000000] border border-[#1F1F1F] overflow-hidden">
                            <div className={clsx('h-full transition-all duration-300', color)} style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function SmallMeta({ label, value }: { label: string; value?: ReactNode }) {
    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-3 font-mono text-xs">
            <p className="text-[10px] font-semibold uppercase text-[#666666]">{label}</p>
            <div className="mt-1 font-bold text-white truncate">{value || '—'}</div>
        </div>
    );
}

export function AdminSeverityBadge({ severity }: { severity?: string }) {
    const s = (severity || 'info').toUpperCase();
    const style = s === 'ERROR'
        ? 'border-rose-900/40 bg-rose-950/20 text-rose-400 font-bold'
        : s === 'WARN'
        ? 'border-amber-900/40 bg-amber-950/20 text-amber-400 font-bold'
        : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';

    return <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider', style)}>{s}</span>;
}

export function LoadingGrid({ count = 4, className = 'h-24' }: { count?: number; className?: string }) {
    return <>{Array.from({ length: count }).map((_, i) => <SkeletonBlock key={i} className={className} />)}</>;
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-[#1F1F1F] py-2 last:border-0 font-mono text-xs">
            <span className="text-[#666666] font-semibold uppercase text-[10px]">{label}</span>
            <span className="font-bold text-white text-right truncate">{value}</span>
        </div>
    );
}

export {
    AppButton as Button,
    AppCard as Panel,
    AppTable as AdminTable,
    SectionHeading,
    StatusBadge,
    formatDate,
};
