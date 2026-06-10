'use client';

import { ReactNode } from 'react';
import { AppButton, AppCard, AppTable, SectionHeading, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';

export function AdminStat({ title, value, detail, icon }: { title: string; value: string | number; detail?: string; icon?: ReactNode }) {
    return (
        <AppCard>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
                    <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
                    {detail ? <p className="mt-1 text-xs font-bold text-slate-400">{detail}</p> : null}
                </div>
                {icon ? <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">{icon}</div> : null}
            </div>
        </AppCard>
    );
}

export function ResourceBars({ cpu, ram, disk }: { cpu?: number; ram?: number; disk?: number }) {
    return (
        <div className="space-y-3">
            {[
                ['CPU', cpu || 0],
                ['RAM', ram || 0],
                ['Disk', disk || 0],
            ].map(([label, value]) => {
                const percent = Math.min(Math.round(Number(value)), 100);
                return (
                    <div key={label}>
                        <div className="mb-1 flex justify-between text-xs font-bold text-slate-400">
                            <span>{label}</span>
                            <span>{percent}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                            <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${percent}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function SmallMeta({ label, value }: { label: string; value?: ReactNode }) {
    return (
        <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <div className="mt-1 text-sm font-bold text-slate-200">{value || 'None'}</div>
        </div>
    );
}

export function AdminSeverityBadge({ severity }: { severity?: string }) {
    const normalized = (severity || 'info').toUpperCase();
    const color =
        normalized === 'ERROR'
            ? 'bg-rose-400/10 text-rose-300 ring-rose-400/20'
            : normalized === 'WARN'
              ? 'bg-amber-400/10 text-amber-300 ring-amber-400/20'
              : 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/20';

    return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ring-1 ${color}`}>{normalized}</span>;
}

export function LoadingGrid({ count = 4, className = 'h-36' }: { count?: number; className?: string }) {
    return <>{Array.from({ length: count }).map((_, index) => <SkeletonBlock key={index} className={className} />)}</>;
}

export { AppButton as Button, AppCard as Panel, AppTable as AdminTable, SectionHeading, StatusBadge, formatDate };
