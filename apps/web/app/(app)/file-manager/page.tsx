'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/client';
import { Server, FolderOpen, Search, Wifi, WifiOff, AlertCircle, ArrowRight, Loader2, HardDrive } from 'lucide-react';
import type { Vps } from '@/lib/api/types';

function StatusDot({ status }: { status: string }) {
    const map: Record<string, string> = {
        active: 'bg-emerald-400 shadow-emerald-400/50',
        inactive: 'bg-slate-600',
        failed: 'bg-rose-400 shadow-rose-400/50',
    };
    return (
        <span className={`inline-block h-1.5 w-1.5 rounded-full shadow-sm ${map[status] || map.inactive}`} />
    );
}

function StatusBadge({ status }: { status: string }) {
    const classes: Record<string, string> = {
        active: 'bg-emerald-500/10 text-emerald-400 border-emerald-400/20',
        inactive: 'bg-slate-500/10 text-slate-500 border-slate-600/20',
        failed: 'bg-rose-500/10 text-rose-400 border-rose-400/20',
    };
    const icons: Record<string, React.ReactNode> = {
        active: <Wifi size={9} />,
        inactive: <WifiOff size={9} />,
        failed: <AlertCircle size={9} />,
    };
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${classes[status] || classes.inactive}`}>
            {icons[status]} {status}
        </span>
    );
}

export default function FileManagerIndexPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');

    const { data: vpsList, isLoading } = useQuery({
        queryKey: ['vps-list'],
        queryFn: () => api.get<Vps[]>('/vps/list'),
        retry: false,
    });

    const filtered = (vpsList || []).filter((v) =>
        [v.name, v.ipAddress, v.username].some((s) => s?.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="flex h-full flex-col overflow-y-auto terminal-scrollbar bg-slate-950 text-slate-200">
            {/* ── Top header bar ── */}
            <div className="border-b border-white/10 px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
                        <HardDrive size={16} className="text-cyan-300" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white">File Manager</h1>
                        <p className="font-mono text-[10px] text-slate-600">Select a VPS to browse its filesystem</p>
                    </div>
                    <div className="ml-auto font-mono text-[10px] text-slate-700">
                        {!isLoading && <span>{filtered.length} server{filtered.length !== 1 ? 's' : ''}</span>}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-5 p-6">
                {/* Search */}
                <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-cyan-300/40 select-none">~/</span>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="grep server…"
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 py-1.5 pl-8 pr-3 font-mono text-xs text-slate-300 outline-none placeholder:text-slate-600 focus:border-cyan-300/30 transition-colors"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                            <Search size={11} />
                        </button>
                    )}
                </div>

                {/* VPS grid */}
                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 size={20} className="animate-spin text-cyan-400/50" />
                            <span className="font-mono text-[10px] text-slate-700">connecting…</span>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
                            <Server size={20} className="text-slate-700" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-slate-500">{search ? 'No matching servers' : 'No VPS configured'}</p>
                            {!search && <p className="mt-1 font-mono text-[10px] text-slate-700">Add a VPS from the VPS page first</p>}
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filtered.map((vps) => (
                            <button
                                key={vps.id}
                                onClick={() => router.push(`/file-manager/${vps.id}`)}
                                className="group relative flex flex-col gap-4 rounded-xl border border-white/10 bg-slate-900/40 p-4 text-left transition-all duration-200 hover:border-cyan-300/30 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-cyan-950/20"
                            >
                                {/* Top row */}
                                <div className="flex items-start justify-between">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-600 transition-colors group-hover:border-cyan-300/25 group-hover:text-cyan-300">
                                        <Server size={14} />
                                    </div>
                                    <ArrowRight size={13} className="mt-1 shrink-0 text-slate-700 transition-all group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                                </div>

                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <StatusDot status={vps.status} />
                                        <p className="truncate text-[13px] font-bold text-slate-300 group-hover:text-white transition-colors">{vps.name}</p>
                                    </div>
                                    <p className="truncate font-mono text-[10px] text-slate-700">
                                        {vps.username}@{vps.ipAddress}:{vps.port}
                                    </p>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between">
                                    <StatusBadge status={vps.status} />
                                    <span className="flex items-center gap-1 font-mono text-[9px] text-slate-800">
                                        <FolderOpen size={9} /> browse
                                    </span>
                                </div>

                                {/* Active glow */}
                                {vps.status === 'active' && (
                                    <div className="absolute inset-x-0 bottom-0 h-px rounded-b-xl bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
