'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';
import { AppButton, AppCard, AppTable, SectionHeading, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';

// ── Stat card ─────────────────────────────────────────────────────────────────
export function AdminStat({
    title, value, detail, icon, accent,
}: { title: string; value: string | number; detail?: string; icon?: ReactNode; accent?: string }) {
    return (
        <AppCard className="relative overflow-hidden">
            <div className={clsx('absolute inset-x-0 top-0 h-0.5', accent || 'bg-gradient-to-r from-rose-300/30 to-transparent')} />
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
                    <p className="mt-3 text-4xl font-black tracking-tight text-white">{value}</p>
                    {detail ? <p className="mt-1.5 text-xs font-bold text-slate-500">{detail}</p> : null}
                </div>
                {icon ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/8 text-rose-200">
                        {icon}
                    </div>
                ) : null}
            </div>
        </AppCard>
    );
}

// ── Resource bars ─────────────────────────────────────────────────────────────
export function ResourceBars({ cpu, ram, disk }: { cpu?: number; ram?: number; disk?: number }) {
    const bars = [
        { label: 'CPU',  value: cpu  || 0 },
        { label: 'RAM',  value: ram  || 0 },
        { label: 'Disk', value: disk || 0 },
    ];
    return (
        <div className="space-y-4">
            {bars.map(({ label, value }) => {
                const pct   = Math.min(Math.round(value), 100);
                const color = pct > 85 ? 'bg-rose-400' : pct > 65 ? 'bg-amber-400' : 'bg-emerald-400';
                const text  = pct > 85 ? 'text-rose-300' : pct > 65 ? 'text-amber-300' : 'text-emerald-300';
                return (
                    <div key={label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-400">{label}</span>
                            <span className={clsx('font-black tabular-nums', text)}>{pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                            <div className={clsx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── Small meta chip ───────────────────────────────────────────────────────────
export function SmallMeta({ label, value }: { label: string; value?: ReactNode }) {
    return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <div className="mt-1.5 text-sm font-bold text-slate-200">{value || '—'}</div>
        </div>
    );
}

// ── Severity badge ────────────────────────────────────────────────────────────
export function AdminSeverityBadge({ severity }: { severity?: string }) {
    const s = (severity || 'info').toUpperCase();
    const color =
        s === 'ERROR' ? 'bg-rose-400/10 text-rose-300 ring-rose-400/20' :
        s === 'WARN'  ? 'bg-amber-400/10 text-amber-300 ring-amber-400/20' :
                       'bg-cyan-400/10 text-cyan-300 ring-cyan-400/20';
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ring-1 ${color}`}>{s}</span>;
}

// ── Loading skeleton grid ─────────────────────────────────────────────────────
export function LoadingGrid({ count = 4, className = 'h-36' }: { count?: number; className?: string }) {
    return <>{Array.from({ length: count }).map((_, i) => <SkeletonBlock key={i} className={className} />)}</>;
}

// ── Info row (label / value) ──────────────────────────────────────────────────
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0">
            <span className="text-xs text-slate-500 shrink-0">{label}</span>
            <span className="text-xs font-bold text-slate-200 text-right truncate">{value}</span>
        </div>
    );
}

// ── Re-exports ────────────────────────────────────────────────────────────────
export {
    AppButton as Button,
    AppCard as Panel,
    AppTable as AdminTable,
    SectionHeading,
    StatusBadge,
    formatDate,
};
