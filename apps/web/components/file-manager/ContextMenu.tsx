'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    items: {
        label: string;
        icon?: React.ReactNode;
        onClick: () => void;
        danger?: boolean;
        divider?: boolean;
        disabled?: boolean;
    }[];
}

export function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        }
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const style: React.CSSProperties = {
        position: 'fixed',
        top: Math.min(y, window.innerHeight - 320),
        left: Math.min(x, window.innerWidth - 200),
        zIndex: 9999,
    };

    return (
        <div
            ref={ref}
            style={style}
            className="w-52 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl shadow-slate-950 backdrop-blur-xl"
            role="menu"
        >
            {items.map((item, idx) => (
                <React.Fragment key={idx}>
                    {item.divider && idx > 0 && (
                        <div className="my-1 border-t border-white/[0.08] mx-1" />
                    )}
                    <button
                        onClick={() => { item.onClick(); onClose(); }}
                        disabled={item.disabled}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                            item.danger
                                ? 'text-rose-300 hover:bg-rose-500/10 hover:text-rose-200'
                                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                        }`}
                        role="menuitem"
                    >
                        {item.icon && <span className={`shrink-0 ${item.danger ? 'text-rose-400' : 'text-slate-500'}`}>{item.icon}</span>}
                        {item.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}
