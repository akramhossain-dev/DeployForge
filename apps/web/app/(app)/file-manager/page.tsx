'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/client';
import { Server, FolderOpen, Search, Wifi, WifiOff, AlertCircle, ArrowRight, Loader2, HardDrive } from 'lucide-react';
import type { Vps } from '@/lib/api/types';
import clsx from 'clsx';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function StatusTag({ status }: { status: string }) {
    const s = String(status || 'active').toLowerCase();
    const style = s === 'active'
        ? 'border-[#1F1F1F] bg-[#000000] text-emerald-400'
        : s === 'failed'
        ? 'border-rose-900/40 bg-rose-950/20 text-rose-400'
        : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', style)}>
            {status}
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
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        File Manager
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Select a VPS server node to browse its filesystem, edit configuration files, and manage directories over SFTP/SSH.
                    </p>
                </div>
            </div>

            {/* Search Input */}
            <div className="relative max-w-sm">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search server node by name or IP..."
                    className={INPUT_STYLE}
                />
            </div>

            {/* Server Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-36 animate-pulse rounded-md border border-[#1F1F1F] bg-[#0A0A0A]" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center text-[#666666]">
                    <HardDrive size={24} className="mx-auto mb-2 text-[#666666]" />
                    <p className="text-white font-semibold">
                        {search ? 'No matching VPS nodes found' : 'No VPS server nodes available'}
                    </p>
                    <p className="mt-1 text-xs">
                        {search ? 'Try adjusting your search query.' : 'Register a VPS server node from the VPS Manager tab.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filtered.map((vps) => (
                        <button
                            key={vps.id}
                            onClick={() => router.push(`/file-manager/${vps.id}`)}
                            className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 text-left space-y-4 hover:border-[#333333] transition-colors group flex flex-col justify-between"
                        >
                            <div className="space-y-2">
                                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Server size={14} className="text-white shrink-0" />
                                        <p className="font-bold text-white text-sm truncate">{vps.name}</p>
                                    </div>
                                    <StatusTag status={vps.status} />
                                </div>
                                <p className="text-xs text-[#A1A1A1] truncate font-mono">
                                    {vps.username}@{vps.ipAddress}:{vps.port}
                                </p>
                            </div>

                            <div className="flex items-center justify-between border-t border-[#1F1F1F] pt-3 text-[11px] text-[#A1A1A1] group-hover:text-white transition-colors">
                                <span className="flex items-center gap-1">
                                    <FolderOpen size={12} />
                                    <span>Browse Filesystem</span>
                                </span>
                                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
