'use client';

import React from 'react';
import { ChevronRight, HardDrive } from 'lucide-react';

interface BreadcrumbProps {
    path: string;
    onNavigate: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
    const parts = path.replace(/\/+/g, '/').split('/').filter(Boolean);

    const segments = [
        { label: '/', path: '/' },
        ...parts.map((part, idx) => ({
            label: part,
            path: '/' + parts.slice(0, idx + 1).join('/'),
        })),
    ];

    const visible = segments.length > 5
        ? [segments[0], { label: '…', path: '' }, ...segments.slice(-3)]
        : segments;

    return (
        <nav className="flex min-w-0 items-center gap-0.5 text-xs font-mono" aria-label="Breadcrumb">
            {visible.map((seg, idx) => {
                const isFirst = seg.path === '/';
                const isEllipsis = seg.label === '…';
                const isLast = idx === visible.length - 1;

                if (isEllipsis) {
                    return (
                        <React.Fragment key="ellipsis">
                            <ChevronRight size={10} className="shrink-0 text-slate-700" />
                            <span className="text-slate-600 px-1">…</span>
                        </React.Fragment>
                    );
                }

                return (
                    <React.Fragment key={seg.path}>
                        {idx > 0 && <ChevronRight size={10} className="shrink-0 text-slate-700" />}
                        {isLast ? (
                            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${isFirst ? 'text-cyan-300' : 'text-white'}`}>
                                {isFirst && <HardDrive size={11} className="text-cyan-400" />}
                                {isFirst ? 'root' : seg.label}
                            </span>
                        ) : (
                            <button
                                onClick={() => onNavigate(seg.path)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all hover:bg-white/[0.06] hover:text-cyan-300 ${isFirst ? 'text-cyan-400/70' : 'text-slate-500 hover:text-cyan-300'}`}
                            >
                                {isFirst && <HardDrive size={11} />}
                                {isFirst ? 'root' : seg.label}
                            </button>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
}
