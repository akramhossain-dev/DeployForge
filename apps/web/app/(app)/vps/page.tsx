'use client';

import { FormEvent, ReactNode, useMemo, useState, useRef } from 'react';
import { CheckCircle2, KeyRound, Plus, RefreshCw, Server, Trash2, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { Button, EmptyState, ErrorState, PageHeader, Panel, PasswordInput, SectionHeading, SkeletonBlock, StatusBadge, formatDate, inputClassName } from '@/components/ui';
import { useAddVps, useDeleteVps, useTestVpsConnection, useVpsList } from '@/hooks/useDeployForgeData';
import type { VpsConnectionPayload } from '@/lib/api/types';
import clsx from 'clsx';

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

    // Local validation errors
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Refs for focus management
    const nameRef = useRef<HTMLInputElement>(null);
    const ipRef = useRef<HTMLInputElement>(null);
    const portRef = useRef<HTMLInputElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const privateKeyRef = useRef<HTMLTextAreaElement>(null);

    const payload = useMemo(() => buildPayload(form), [form]);
    const isTestingForm = testConnection.isPending && !testingId;
    const isSubmitting = addVps.isPending || isTestingForm;

    function validateForm(): boolean {
        const newErrors: Record<string, string> = {};
        let isValid = true;

        if (!form.name.trim()) {
            newErrors.name = 'VPS Name is required';
            isValid = false;
        }

        if (!form.ipAddress.trim()) {
            newErrors.ipAddress = 'IP Address or Hostname is required';
            isValid = false;
        }

        const portNum = Number(form.port);
        if (!form.port.trim()) {
            newErrors.port = 'Port is required';
            isValid = false;
        } else if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            newErrors.port = 'Port must be a valid number (1 - 65535)';
            isValid = false;
        }

        if (!form.username.trim()) {
            newErrors.username = 'SSH Username is required';
            isValid = false;
        }

        if (form.authType === 'password') {
            if (!form.password) {
                newErrors.password = 'SSH Password is required';
                isValid = false;
            }
        } else {
            if (!form.privateKey.trim()) {
                newErrors.privateKey = 'SSH Private Key is required';
                isValid = false;
            }
        }

        setErrors(newErrors);

        if (!isValid) {
            if (newErrors.name) nameRef.current?.focus();
            else if (newErrors.ipAddress) ipRef.current?.focus();
            else if (newErrors.port) portRef.current?.focus();
            else if (newErrors.username) usernameRef.current?.focus();
            else if (newErrors.password) passwordRef.current?.focus();
            else if (newErrors.privateKey) privateKeyRef.current?.focus();
        }

        return isValid;
    }

    async function handleTest() {
        if (!validateForm()) return;
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
        if (!validateForm()) return;
        setTestState({ status: 'idle', message: '' });
        try {
            await addVps.mutateAsync({ ...payload, name: form.name.trim() });
            setForm(initialForm);
            setErrors({});
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
                    <SectionHeading icon={<Server size={18} />} title="Add VPS" description="Credentials are tested before save and encrypted at rest." />

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Field label="VPS Name" error={errors.name}>
                            <input
                                ref={nameRef}
                                className={clsx(
                                    inputClassName,
                                    "transition-colors",
                                    errors.name ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                value={form.name}
                                onChange={(event) => {
                                    setForm({ ...form, name: event.target.value });
                                    if (errors.name) setErrors({ ...errors, name: '' });
                                }}
                                placeholder="Production API"
                                disabled={isSubmitting}
                            />
                        </Field>
                        <Field label="IP Address / Hostname" error={errors.ipAddress}>
                            <input
                                ref={ipRef}
                                className={clsx(
                                    inputClassName,
                                    "transition-colors",
                                    errors.ipAddress ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                value={form.ipAddress}
                                onChange={(event) => {
                                    setForm({ ...form, ipAddress: event.target.value });
                                    if (errors.ipAddress) setErrors({ ...errors, ipAddress: '' });
                                }}
                                placeholder="203.0.113.10"
                                disabled={isSubmitting}
                            />
                        </Field>
                        <Field label="Port" error={errors.port}>
                            <input
                                ref={portRef}
                                className={clsx(
                                    inputClassName,
                                    "transition-colors",
                                    errors.port ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                value={form.port}
                                onChange={(event) => {
                                    setForm({ ...form, port: event.target.value });
                                    if (errors.port) setErrors({ ...errors, port: '' });
                                }}
                                inputMode="numeric"
                                placeholder="22"
                                disabled={isSubmitting}
                            />
                        </Field>
                        <Field label="SSH Username" error={errors.username}>
                            <input
                                ref={usernameRef}
                                className={clsx(
                                    inputClassName,
                                    "transition-colors",
                                    errors.username ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                value={form.username}
                                onChange={(event) => {
                                    setForm({ ...form, username: event.target.value });
                                    if (errors.username) setErrors({ ...errors, username: '' });
                                }}
                                placeholder="root"
                                disabled={isSubmitting}
                            />
                        </Field>
                    </div>

                    <div className="flex w-full rounded-lg border border-white/10 bg-slate-950/55 p-1 sm:w-fit">
                        {(['password', 'key'] as const).map((authType) => (
                            <button
                                key={authType}
                                type="button"
                                onClick={() => {
                                    setForm({ ...form, authType });
                                    setErrors({});
                                    setTestState({ status: 'idle', message: '' });
                                }}
                                className={clsx(
                                    "h-9 rounded-md px-4 text-sm font-black transition-colors",
                                    form.authType === authType ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
                                )}
                                disabled={isSubmitting}
                            >
                                {authType === 'password' ? 'Password' : 'Private Key'}
                            </button>
                        ))}
                    </div>

                    {form.authType === 'password' ? (
                        <Field label="SSH Password" error={errors.password}>
                            <PasswordInput
                                ref={passwordRef}
                                className={clsx(
                                    inputClassName,
                                    "transition-colors",
                                    errors.password ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                value={form.password}
                                onChange={(event) => {
                                    setForm({ ...form, password: event.target.value });
                                    if (errors.password) setErrors({ ...errors, password: '' });
                                }}
                                autoComplete="new-password"
                                disabled={isSubmitting}
                            />
                        </Field>
                    ) : (
                        <Field label="SSH Private Key" error={errors.privateKey}>
                            <textarea
                                ref={privateKeyRef}
                                className={clsx(
                                    inputClassName,
                                    "min-h-40 py-3 font-mono text-xs transition-colors",
                                    errors.privateKey ? "border-rose-500 focus:border-rose-400" : "border-white/10 focus:border-cyan-300"
                                )}
                                value={form.privateKey}
                                onChange={(event) => {
                                    setForm({ ...form, privateKey: event.target.value });
                                    if (errors.privateKey) setErrors({ ...errors, privateKey: '' });
                                }}
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                disabled={isSubmitting}
                            />
                        </Field>
                    )}

                    {testState.status !== 'idle' ? (
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${testState.status === 'success' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/20 bg-rose-400/10 text-rose-200'}`}>
                            {testState.status === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            <span>{testState.message}</span>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button type="button" variant="secondary" onClick={handleTest} loading={isTestingForm} disabled={isSubmitting}>
                            <KeyRound size={16} /> Test Connection
                        </Button>
                        <Button type="submit" loading={addVps.isPending} disabled={isSubmitting}>
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
                                                <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                                                    <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(value, 100)}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {health?.dockerInstalled && (
                                    <div className="mt-5 border-t border-white/[0.05] pt-4">
                                        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                                            <span>Running Containers</span>
                                            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                                                {health?.runningContainers?.length || 0} active
                                            </span>
                                        </div>
                                        {health?.runningContainers && health.runningContainers.length > 0 ? (
                                            <div className="mt-2 max-h-24 overflow-y-auto rounded bg-slate-950/40 p-2 text-xs font-mono text-slate-300 space-y-1 custom-scrollbar">
                                                {health.runningContainers.map((container, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 truncate">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                                        <span className="truncate" title={container}>{container}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-2 text-xs text-slate-500 italic">No active containers found.</p>
                                        )}
                                    </div>
                                )}

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

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase text-slate-400">{label}</span>
            {children}
            {error && <p className="mt-1.5 text-xs font-semibold text-rose-400">{error}</p>}
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
