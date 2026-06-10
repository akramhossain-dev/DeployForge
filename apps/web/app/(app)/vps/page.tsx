'use client';

import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, RefreshCw, Server, Trash2, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, formatDate } from '@/components/ui';
import { useAddVps, useDeleteVps, useTestVpsConnection, useVpsList } from '@/hooks/useDeployForgeData';
import type { VpsConnectionPayload } from '@/lib/api/types';

const initialForm = {
    name: '',
    ipAddress: '',
    port: '22',
    username: 'root',
    authType: 'password' as 'password' | 'key',
    password: '',
    privateKey: '',
};

type TestState =
    | { status: 'idle'; message: string }
    | { status: 'success'; message: string }
    | { status: 'failed'; message: string };

export default function VpsPage() {
    const vps = useVpsList();
    const addVps = useAddVps();
    const testConnection = useTestVpsConnection();
    const deleteVps = useDeleteVps();
    const [form, setForm] = useState(initialForm);
    const [testState, setTestState] = useState<TestState>({ status: 'idle', message: '' });
    const [testingId, setTestingId] = useState<string | null>(null);

    const payload = useMemo(() => buildPayload(form), [form]);
    const isTestingForm = testConnection.isPending && !testingId;
    const canSubmit = Boolean(form.name && form.ipAddress && form.username && (form.authType === 'password' ? form.password : form.privateKey));

    async function handleTest() {
        setTestState({ status: 'idle', message: '' });
        try {
            const result = await testConnection.mutateAsync(payload);
            setTestState({ status: 'success', message: result.message || 'Connection successful' });
        } catch (error) {
            setTestState({ status: 'failed', message: errorMessage(error) });
        }
    }

    async function handleAdd(event: FormEvent) {
        event.preventDefault();
        setTestState({ status: 'idle', message: '' });
        try {
            await addVps.mutateAsync({ ...payload, name: form.name.trim() });
            setForm(initialForm);
            setTestState({ status: 'success', message: 'VPS added successfully' });
        } catch (error) {
            setTestState({ status: 'failed', message: errorMessage(error) });
        }
    }

    async function handleStoredTest(id: string) {
        setTestingId(id);
        try {
            await testConnection.mutateAsync({ id });
        } finally {
            setTestingId(null);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="VPS Manager"
                description="Add servers, validate SSH access, and keep deployment targets ready."
                action={<Button variant="secondary" onClick={() => vps.refetch()} loading={vps.isFetching}><RefreshCw size={16} /> Refresh</Button>}
            />

            <Panel>
                <form onSubmit={handleAdd} className="space-y-5">
                    <div className="flex items-center gap-2">
                        <Server size={18} className="text-cyan-300" />
                        <h2 className="text-base font-bold text-white">Add VPS</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Field label="VPS Name">
                            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Production API" />
                        </Field>
                        <Field label="IP Address / Hostname">
                            <input className={inputClass} value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} placeholder="203.0.113.10" />
                        </Field>
                        <Field label="Port">
                            <input className={inputClass} value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} inputMode="numeric" placeholder="22" />
                        </Field>
                        <Field label="SSH Username">
                            <input className={inputClass} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="root" />
                        </Field>
                    </div>

                    <div className="flex w-full rounded-lg border border-slate-800 bg-slate-950 p-1 sm:w-fit">
                        {(['password', 'key'] as const).map((authType) => (
                            <button
                                key={authType}
                                type="button"
                                onClick={() => {
                                    setForm({ ...form, authType });
                                    setTestState({ status: 'idle', message: '' });
                                }}
                                className={`h-9 rounded-md px-4 text-sm font-bold transition-colors ${form.authType === authType ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                            >
                                {authType === 'password' ? 'Password' : 'Private Key'}
                            </button>
                        ))}
                    </div>

                    {form.authType === 'password' ? (
                        <Field label="SSH Password">
                            <input className={inputClass} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" />
                        </Field>
                    ) : (
                        <Field label="SSH Private Key">
                            <textarea className={`${inputClass} min-h-40 py-3 font-mono text-xs`} value={form.privateKey} onChange={(event) => setForm({ ...form, privateKey: event.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                        </Field>
                    )}

                    {testState.status !== 'idle' ? (
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${testState.status === 'success' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-red-400/20 bg-red-400/10 text-red-200'}`}>
                            {testState.status === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            <span>{testState.message}</span>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button type="button" variant="secondary" onClick={handleTest} loading={isTestingForm} disabled={!canSubmit}>
                            <KeyRound size={16} /> Test Connection
                        </Button>
                        <Button type="submit" loading={addVps.isPending} disabled={!canSubmit}>
                            <Plus size={16} /> Add VPS
                        </Button>
                    </div>
                </form>
            </Panel>

            {vps.isError ? <ErrorState message={(vps.error as Error)?.message} onRetry={() => vps.refetch()} /> : null}

            {vps.isLoading ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-56" />)}
                </div>
            ) : vps.data?.length ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {vps.data.map((server) => {
                        const health = server.healthRecords?.[0];
                        const lastChecked = server.lastCheckedAt || health?.checkedAt || server.updatedAt;
                        return (
                            <Panel key={server.id}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Server size={18} className="text-cyan-300" />
                                            <p className="truncate font-bold text-white">{server.name}</p>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-400">{server.username}@{server.ipAddress}:{server.port}</p>
                                        <p className="mt-1 text-xs uppercase text-slate-500">{server.authType === 'password' ? 'Password auth' : 'Key auth'}</p>
                                    </div>
                                    <StatusBadge status={server.status} />
                                </div>

                                <div className="mt-6 space-y-4">
                                    {[
                                        ['CPU', health?.cpuUsage || 0],
                                        ['RAM', health?.memoryUsage || 0],
                                        ['Disk', health?.diskUsage || 0],
                                    ].map(([label, raw]) => {
                                        const value = Math.round(Number(raw));
                                        return (
                                            <div key={label}>
                                                <div className="mb-1 flex justify-between text-xs text-slate-400">
                                                    <span>{label}</span>
                                                    <span>{value}%</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                                    <div className="h-full bg-cyan-400" style={{ width: `${Math.min(value, 100)}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-500">
                                    <span>Last checked {formatDate(lastChecked)}</span>
                                    <span>{health?.dockerInstalled ? 'Docker ready' : 'Docker unknown'}</span>
                                </div>

                                <div className="mt-5 flex gap-2">
                                    <Button className="flex-1" variant="secondary" onClick={() => handleStoredTest(server.id)} loading={testingId === server.id}>
                                        <RefreshCw size={16} /> Test
                                    </Button>
                                    <Button
                                        variant="danger"
                                        onClick={() => {
                                            if (window.confirm(`Delete ${server.name}?`)) deleteVps.mutate(server.id);
                                        }}
                                        loading={deleteVps.isPending && deleteVps.variables === server.id}
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </Panel>
                        );
                    })}
                </div>
            ) : (
                <EmptyState title="No VPS connected" description="Add your first deployment target above." />
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase text-slate-400">{label}</span>
            {children}
        </label>
    );
}

function buildPayload(form: typeof initialForm): VpsConnectionPayload {
    return {
        ipAddress: form.ipAddress.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim(),
        authType: form.authType,
        ...(form.authType === 'password' ? { password: form.password } : { privateKey: form.privateKey }),
    };
}

function errorMessage(error: unknown) {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Request failed';
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20';
