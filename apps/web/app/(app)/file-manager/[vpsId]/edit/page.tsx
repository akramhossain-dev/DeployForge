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
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading remote file editor...
            </div>
        );
    }

    if (!vps) {
        return (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-6 font-mono text-xs text-rose-300 space-y-3">
                <p className="font-bold text-white">VPS Server Node Not Found</p>
                <Link href="/file-manager" className="inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A]">
                    <ArrowLeft size={13} />
                    <span>Return to Server List</span>
                </Link>
            </div>
        );
    }

    if (!filePath) {
        return (
            <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-6 font-mono text-xs text-amber-300 space-y-3">
                <p className="font-bold text-white">No File Path Provided</p>
                <button onClick={handleClose} className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]">
                    Return to File Manager
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
        <div className="space-y-4 font-mono text-xs h-[calc(100vh-140px)] flex flex-col">
            <div className="flex-1 min-h-0 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] overflow-hidden">
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
