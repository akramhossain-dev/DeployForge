'use client';

import React from 'react';
import { CodeEditor } from '@/components/file-manager/CodeEditor';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/client';
import type { Vps, FileEntry } from '@/lib/api/types';
import { Server, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface EditPageProps {
    params: { vpsId: string };
}

export default function FileEditPage({ params }: EditPageProps) {
    const { vpsId } = params;
    const router = useRouter();
    const searchParams = useSearchParams();
    const filePath = searchParams.get('path');

    const { data: vps, isLoading: vpsLoading } = useQuery({
        queryKey: ['vps', vpsId],
        queryFn: () => api.get<Vps>(`/vps/${vpsId}`),
        retry: false,
    });

    const fileName = filePath ? filePath.split('/').pop() || '' : '';

    const handleClose = () => {
        
        if (filePath) {
            const parentDir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
            router.push(`/file-manager/${vpsId}?path=${encodeURIComponent(parentDir)}`);
        } else {
            router.push(`/file-manager/${vpsId}`);
        }
    };

    if (vpsLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-slate-950">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
            </div>
        );
    }

    if (!vps) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
                    <Server size={20} className="text-slate-600" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">VPS not found</p>
                </div>
                <Link href="/file-manager" className="h-7 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
                    Back to VPS list
                </Link>
            </div>
        );
    }

    if (!filePath) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
                    <AlertTriangle size={20} className="text-rose-400" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">No file path provided</p>
                </div>
                <button onClick={handleClose} className="h-7 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
                    Back to File Manager
                </button>
            </div>
        );
    }

    const mockFileEntry: FileEntry = {
        name: fileName,
        path: filePath,
        type: 'file',
        size: 0,
        modified: '',
        permissions: '',
        extension: fileName.split('.').pop() || '',
        mimeType: 'text/plain',
    };

    return (
        <div className="flex h-full flex-col gap-0 overflow-hidden bg-slate-950">
            {}
            <div className="flex min-h-0 flex-1">
                <CodeEditor
                    vpsId={vpsId}
                    vpsName={vps.name}
                    vpsUser={vps.username}
                    vpsIp={vps.ipAddress}
                    file={mockFileEntry}
                    onClose={handleClose}
                />
            </div>
        </div>
    );
}
