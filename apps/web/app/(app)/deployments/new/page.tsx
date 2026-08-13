'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
    Github, UploadCloud, ArrowLeft, Loader2
} from 'lucide-react';
import { GithubDeployForm } from '@/components/deployments/new/GithubDeployForm';
import { UploadDeployForm } from '@/components/deployments/new/UploadDeployForm';

export default function NewDeploymentPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                    <Loader2 size={16} className="animate-spin mr-2" /> Loading deployment setup wizard...
                </div>
            }
        >
            <NewDeploymentPageContent />
        </Suspense>
    );
}

function NewDeploymentPageContent() {
    const [tab, setTab] = useState<'github' | 'upload'>('github');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div className="flex items-center gap-3">
                    <Link href="/deployments">
                        <button className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white transition-colors">
                            <ArrowLeft size={14} />
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                            Create Deployment
                        </h1>
                        <p className="mt-1 text-xs text-[#A1A1A1]">
                            Select a release source, choose your VPS host node, and configure execution parameters.
                        </p>
                    </div>
                </div>
            </div>

            {/* Source Tab Selector */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3 font-mono text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                    Step 1: Select Release Source
                </p>
                <div className="grid grid-cols-2 gap-2 rounded border border-[#1F1F1F] bg-[#000000] p-1">
                    <button
                        type="button"
                        onClick={() => setTab('github')}
                        className={clsx(
                            'flex h-9 items-center justify-center gap-2 rounded font-semibold transition-colors',
                            tab === 'github' ? 'bg-[#111111] text-white' : 'text-[#A1A1A1] hover:text-white'
                        )}
                    >
                        <Github size={14} />
                        <span>GitHub Repository</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('upload')}
                        className={clsx(
                            'flex h-9 items-center justify-center gap-2 rounded font-semibold transition-colors',
                            tab === 'upload' ? 'bg-[#111111] text-white' : 'text-[#A1A1A1] hover:text-white'
                        )}
                    >
                        <UploadCloud size={14} />
                        <span>File Archive Upload</span>
                    </button>
                </div>
            </div>

            {tab === 'github' ? <GithubDeployForm /> : <UploadDeployForm />}
        </div>
    );
}
