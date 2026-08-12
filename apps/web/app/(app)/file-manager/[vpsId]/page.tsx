'use client';

import { FileManager } from '@/components/file-manager/FileManager';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/client';
import type { Vps } from '@/lib/api/types';
import { Server, ArrowLeft, Loader2 } from 'lucide-react';
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
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Connecting to server filesystem...
            </div>
        );
    }

    if (!vps) {
        return (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-6 font-mono text-xs text-rose-300 space-y-3">
                <p className="font-bold text-white">VPS Server Node Not Found</p>
                <p>The requested server filesystem could not be loaded.</p>
                <Link href="/file-manager" className="inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A]">
                    <ArrowLeft size={13} />
                    <span>Return to Server List</span>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-mono text-xs h-[calc(100vh-140px)] flex flex-col">
            {/* Header Breadcrumbs */}
            <div className="flex items-center gap-3 border-b border-[#1F1F1F] pb-3 shrink-0">
                <Link href="/file-manager">
                    <button className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white transition-colors">
                        <ArrowLeft size={14} />
                    </button>
                </Link>
                <div className="flex items-center gap-2 text-xs">
                    <Server size={14} className="text-white" />
                    <span className="font-bold text-white">{vps.name}</span>
                    <span className="text-[#666666]">({vps.username}@{vps.ipAddress}:{vps.port})</span>
                </div>
            </div>

            {/* Main File Explorer Container */}
            <div className="flex-1 min-h-0 rounded-md border border-[#1F1F1F] bg-[#0A0A0A]">
                <FileManager vpsId={vpsId} vpsName={vps.name} />
            </div>
        </div>
    );
}
