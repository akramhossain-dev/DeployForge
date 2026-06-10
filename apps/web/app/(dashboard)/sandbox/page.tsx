'use client';

import { ShieldCheck } from 'lucide-react';
import { EmptyState, PageHeader, Panel } from '@/components/ui';

export default function SandboxPage() {
    return (
        <div className="space-y-6">
            <PageHeader title="Sandbox" description="Pre-deployment review surface for security and resource checks." />
            <Panel>
                <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-cyan-300" />
                    <h3 className="font-bold text-white">Latest Checks</h3>
                </div>
                <EmptyState title="No sandbox checks yet" description="Sandbox results will appear after a deployment analysis has been run." />
            </Panel>
        </div>
    );
}
