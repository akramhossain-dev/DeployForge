'use client';

import { FileManager } from '@/components/file-manager/FileManager';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/client';
import type { Vps } from '@/lib/api/types';
import { Server, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
    params: { vpsId: string };
}

export default function FileManagerPage({ params }: PageProps) {
    const { vpsId } = params;

    const { data: vps, isLoading } = useQuery({
        queryKey: ['vps', vpsId],
        queryFn: () => api.get<Vps>(`/vps/${vpsId}`),
        retry: false,
    });

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
            </div>
        );
    }

    if (!vps) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
                    <Server size={20} className="text-slate-600" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">VPS not found</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-600">The requested server could not be loaded</p>
                </div>
                <Link href="/file-manager" className="h-7 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5">
                    <ArrowLeft size={11} /> Back to VPS list
                </Link>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-0 overflow-hidden">
            {}
            <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-slate-900/60 px-4 py-2">
                <Link href="/file-manager" className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 hover:text-cyan-300 transition-colors">
                    <ArrowLeft size={11} />
                    servers
                </Link>
                <span className="text-slate-800 font-mono text-xs">/</span>
                <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded border border-cyan-300/20 bg-cyan-300/10">
                        <Server size={10} className="text-cyan-300" />
                    </div>
                    <span className="text-xs font-bold text-white">{vps.name}</span>
                    <span className="font-mono text-[10px] text-slate-600">{vps.username}@{vps.ipAddress}</span>
                </div>
            </div>

            {}
            <div className="flex min-h-0 flex-1 p-3">
                <FileManager vpsId={vpsId} vpsName={vps.name} />
            </div>
        </div>
    );
}
