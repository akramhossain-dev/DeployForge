'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/client';
import { INPUT_STYLE } from '@/components/ui';

type Policy = {
    resourceTier?: 'STATIC' | 'SERVER' | 'FULLSTACK' | null;
    cpuLimitMillis?: number | null;
    memoryLimitMiB?: number | null;
    pidsLimit?: number | null;
    storageLimitMiB?: number | null;
};

export function AdminResourcePolicyEditor({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
    const queryClient = useQueryClient();
    const policy = useQuery({ queryKey: ['admin', 'project-resource-policy', projectId], queryFn: () => api.get<Policy | null>(`/admin/projects/${projectId}/resource-policy`) });
    const [form, setForm] = useState({ resourceTier: 'SERVER', cpuLimitMillis: '1000', memoryLimitMiB: '1024', pidsLimit: '256', storageLimitMiB: '5120' });

    useEffect(() => {
        if (!policy.data) return;
        setForm({
            resourceTier: policy.data.resourceTier || 'SERVER',
            cpuLimitMillis: String(policy.data.cpuLimitMillis || 1000),
            memoryLimitMiB: String(policy.data.memoryLimitMiB || 1024),
            pidsLimit: String(policy.data.pidsLimit || 256),
            storageLimitMiB: String(policy.data.storageLimitMiB || 5120),
        });
    }, [policy.data]);

    const update = useMutation({
        mutationFn: () => api.put<Policy>(`/admin/projects/${projectId}/resource-policy`, {
            resourceTier: form.resourceTier,
            cpuLimitMillis: Number(form.cpuLimitMillis),
            memoryLimitMiB: Number(form.memoryLimitMiB),
            pidsLimit: Number(form.pidsLimit),
            storageLimitMiB: Number(form.storageLimitMiB),
        }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['admin'] });
            onClose();
        },
    });

    const field = (key: keyof typeof form, label: string, min: number, max: number) => (
        <label>
            <span className="mb-1 block text-[10px] uppercase text-[#666666]">{label}</span>
            <input type="number" min={min} max={max} value={form[key]} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} className={INPUT_STYLE} />
        </label>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
            <div className="w-full max-w-lg space-y-4 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                <div>
                    <h3 className="font-bold text-white">Resource policy — {projectName}</h3>
                    <p className="mt-1 text-[11px] text-amber-300">Changes apply to future deployments only. Running containers are not mutated.</p>
                </div>
                {policy.isError || update.isError ? <p className="text-rose-400">{((policy.error || update.error) as Error)?.message}</p> : null}
                <label>
                    <span className="mb-1 block text-[10px] uppercase text-[#666666]">Tier</span>
                    <select value={form.resourceTier} onChange={(event) => setForm((value) => ({ ...value, resourceTier: event.target.value }))} className={INPUT_STYLE}>
                        <option value="STATIC">STATIC</option><option value="SERVER">SERVER</option><option value="FULLSTACK">FULLSTACK</option>
                    </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                    {field('cpuLimitMillis', 'CPU (millicores)', 100, 64000)}
                    {field('memoryLimitMiB', 'Memory (MiB)', 128, 262144)}
                    {field('pidsLimit', 'PID limit', 32, 4096)}
                    {field('storageLimitMiB', 'Storage (MiB)', 1024, 51200)}
                </div>
                <div className="flex justify-end gap-2 border-t border-[#1F1F1F] pt-3">
                    <button onClick={onClose} className="h-8 rounded border border-[#1F1F1F] px-3 text-white">Cancel</button>
                    <button onClick={() => update.mutate()} disabled={update.isPending || policy.isLoading} className="h-8 rounded bg-white px-3 font-semibold text-black disabled:opacity-50">Save future policy</button>
                </div>
            </div>
        </div>
    );
}
