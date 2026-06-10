'use client';

import { ReactNode } from 'react';
import { Button, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';

export function AdminStat({ title, value, detail, icon }: { title: string; value: string | number; detail?: string; icon?: ReactNode }) {
    return (
        <Panel className="border-slate-800/80 bg-slate-900/70">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
                    <p className="mt-3 text-3xl font-black text-white">{value}</p>
                    {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
                </div>
                {icon ? <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/20">{icon}</div> : null}
            </div>
        </Panel>
    );
}

export function AdminTable({
    columns,
    rows,
    empty,
}: {
    columns: string[];
    rows?: ReactNode[][];
    empty: string;
}) {
    if (!rows) {
        return <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-16" />)}</div>;
    }
    if (!rows.length) {
        return <p className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">{empty}</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                    <tr>{columns.map((column) => <th key={column} className="border-b border-slate-800 px-3 py-3">{column}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {rows.map((row, index) => (
                        <tr key={index} className="align-top">
                            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-4">{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                            <span>{label}</span>
                            <span>{percent}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full bg-cyan-300" style={{ width: `${percent}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function SmallMeta({ label, value }: { label: string; value?: ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <div className="mt-1 text-sm text-slate-200">{value || 'None'}</div>
        </div>
    );
}

export { Button, Panel, StatusBadge, formatDate };
