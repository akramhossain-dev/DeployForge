'use client';

import { FormEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Plus, Server, ShieldCheck, Terminal, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAddVps, useTestVpsConnection } from '@/hooks/useDeployForgeData';
import { ApiError } from '@/lib/api/client';
import type { VpsConnectionPayload } from '@/lib/api/types';

const STEPS = ['Connection Details', 'Verify SSH Probe', 'Register Server Node'] as const;
type Step = 0 | 1 | 2;

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

const initial = { name: '', ipAddress: '', port: '22', username: 'root', authType: 'password' as 'password' | 'key', password: '', privateKey: '' };

type TestResult = { status: 'idle' | 'success' | 'failed'; message: string; readiness?: { shell: boolean; os?: string; dockerInstalled?: boolean; nginxInstalled?: boolean } };

export default function AddVpsTab({ onAdded }: { onAdded?: () => void }) {
    const [step, setStep] = useState<Step>(0);
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [testResult, setTestResult] = useState<TestResult>({ status: 'idle', message: '' });

    const addVps = useAddVps();
    const testConn = useTestVpsConnection();

    const nameRef = useRef<HTMLInputElement>(null);
    const ipRef = useRef<HTMLInputElement>(null);

    const payload = useMemo((): VpsConnectionPayload => ({
        ipAddress: form.ipAddress.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim(),
        authType: form.authType,
        ...(form.authType === 'password' ? { password: form.password } : { privateKey: form.privateKey }),
    }), [form]);

    function setField(key: keyof typeof initial, value: string) {
        setForm(f => ({ ...f, [key]: value }));
        if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
    }

    function validateConnection(): boolean {
        const e: Record<string, string> = {};
        if (!form.ipAddress.trim()) e.ipAddress = 'IP Address or hostname required';
        const p = Number(form.port);
        if (!form.port || isNaN(p) || p < 1 || p > 65535) e.port = 'Port must be 1–65535';
        if (!form.username.trim()) e.username = 'Username required';
        if (form.authType === 'password' && !form.password) e.password = 'Password required';
        if (form.authType === 'key' && !form.privateKey.trim()) e.privateKey = 'Private key required';
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    async function handleVerify() {
        if (!validateConnection()) return;
        setTestResult({ status: 'idle', message: '' });
        try {
            const res = await testConn.mutateAsync(payload);
            if (res.success) {
                setTestResult({ status: 'success', message: res.message || 'SSH connection probe verified', readiness: res.readiness });
                setStep(2);
            } else {
                setTestResult({ status: 'failed', message: res.message || 'SSH connection failed' });
            }
        } catch (err) {
            setTestResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'SSH connection failed' });
        }
    }

    async function handleAdd(e: FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) { setErrors({ name: 'VPS Server Name required' }); nameRef.current?.focus(); return; }
        await addVps.mutateAsync({ ...payload, name: form.name.trim() });
        setForm(initial);
        setErrors({});
        setStep(0);
        setTestResult({ status: 'idle', message: '' });
        onAdded?.();
    }

    const isTesting = testConn.isPending;
    const isAdding = addVps.isPending;

    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-6 font-mono text-xs">
            {/* Header & Steps */}
            <div className="border-b border-[#1F1F1F] pb-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Server size={16} />
                    <span>Register New VPS Host Node</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {STEPS.map((label, i) => (
                        <div
                            key={label}
                            className={clsx(
                                'flex items-center gap-2 rounded border px-3 py-2 text-[11px]',
                                i === step ? 'border-white bg-[#111111] font-bold text-white' : i < step ? 'border-[#1F1F1F] bg-[#000000] text-emerald-400' : 'border-[#1F1F1F] bg-[#000000] text-[#666666]'
                            )}
                        >
                            <span>{i + 1}.</span>
                            <span className="truncate">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Step 0: Form inputs */}
            {step === 0 && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                Host IP Address / Domain
                            </label>
                            <input
                                ref={ipRef}
                                value={form.ipAddress}
                                onChange={(e) => setField('ipAddress', e.target.value)}
                                placeholder="203.0.113.10"
                                className={INPUT_STYLE}
                            />
                            {errors.ipAddress && <p className="mt-1 text-xs text-rose-400">{errors.ipAddress}</p>}
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                SSH Port
                            </label>
                            <input
                                value={form.port}
                                onChange={(e) => setField('port', e.target.value)}
                                placeholder="22"
                                className={INPUT_STYLE}
                            />
                            {errors.port && <p className="mt-1 text-xs text-rose-400">{errors.port}</p>}
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                SSH Username
                            </label>
                            <input
                                value={form.username}
                                onChange={(e) => setField('username', e.target.value)}
                                placeholder="root"
                                className={INPUT_STYLE}
                            />
                            {errors.username && <p className="mt-1 text-xs text-rose-400">{errors.username}</p>}
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                Authentication Method
                            </label>
                            <div className="grid grid-cols-2 gap-2 rounded border border-[#1F1F1F] bg-[#000000] p-1">
                                <button
                                    type="button"
                                    onClick={() => setField('authType', 'password')}
                                    className={clsx('h-8 rounded font-semibold text-xs transition-colors', form.authType === 'password' ? 'bg-[#111111] text-white' : 'text-[#A1A1A1]')}
                                >
                                    Password
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setField('authType', 'key')}
                                    className={clsx('h-8 rounded font-semibold text-xs transition-colors', form.authType === 'key' ? 'bg-[#111111] text-white' : 'text-[#A1A1A1]')}
                                >
                                    SSH Key
                                </button>
                            </div>
                        </div>
                    </div>

                    {form.authType === 'password' ? (
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                SSH Password
                            </label>
                            <input
                                type="password"
                                value={form.password}
                                onChange={(e) => setField('password', e.target.value)}
                                placeholder="••••••••••••"
                                className={INPUT_STYLE}
                            />
                            {errors.password && <p className="mt-1 text-xs text-rose-400">{errors.password}</p>}
                        </div>
                    ) : (
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                SSH Private Key
                            </label>
                            <textarea
                                value={form.privateKey}
                                onChange={(e) => setField('privateKey', e.target.value)}
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                className={clsx(INPUT_STYLE, 'h-32 py-2')}
                            />
                            {errors.privateKey && <p className="mt-1 text-xs text-rose-400">{errors.privateKey}</p>}
                        </div>
                    )}

                    <div className="border-t border-[#1F1F1F] pt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 font-semibold text-black hover:bg-[#E5E5E5]"
                        >
                            <span>Next: Verify Connection</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Step 1: Probe test */}
            {step === 1 && (
                <div className="space-y-4">
                    <div className="rounded border border-[#1F1F1F] bg-[#000000] p-4 space-y-1 text-[#A1A1A1]">
                        <p><span className="text-[#666666]">TARGET HOST:</span> {form.ipAddress}:{form.port}</p>
                        <p><span className="text-[#666666]">SSH USER:</span> {form.username}</p>
                        <p><span className="text-[#666666]">AUTH MODE:</span> {form.authType.toUpperCase()}</p>
                    </div>

                    {testResult.status !== 'idle' && (
                        <div className={clsx(
                            'rounded border p-4 space-y-2',
                            testResult.status === 'success' ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-300' : 'border-rose-900/50 bg-rose-950/20 text-rose-300'
                        )}>
                            <p className="font-bold">{testResult.message}</p>
                            {testResult.readiness && (
                                <div className="flex flex-wrap gap-2 text-[10px]">
                                    <span className={clsx('rounded border px-2 py-0.5', testResult.readiness.shell ? 'border-emerald-900 text-emerald-400' : 'border-rose-900 text-rose-400')}>
                                        Shell: {testResult.readiness.shell ? 'OK' : 'Failed'}
                                    </span>
                                    <span className={clsx('rounded border px-2 py-0.5', testResult.readiness.dockerInstalled ? 'border-emerald-900 text-emerald-400' : 'border-rose-900 text-rose-400')}>
                                        Docker: {testResult.readiness.dockerInstalled ? 'Installed' : 'Missing'}
                                    </span>
                                    <span className={clsx('rounded border px-2 py-0.5', testResult.readiness.nginxInstalled ? 'border-emerald-900 text-emerald-400' : 'border-rose-900 text-rose-400')}>
                                        Nginx: {testResult.readiness.nginxInstalled ? 'Installed' : 'Missing'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="border-t border-[#1F1F1F] pt-4 flex justify-between">
                        <button
                            type="button"
                            onClick={() => setStep(0)}
                            className="h-9 px-4 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={handleVerify}
                            disabled={isTesting}
                            className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                            <span>{isTesting ? 'Testing SSH...' : 'Execute SSH Probe'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Register VPS */}
            {step === 2 && (
                <form onSubmit={handleAdd} className="space-y-4">
                    <div className="rounded border border-emerald-900/50 bg-emerald-950/20 p-4 text-emerald-300 space-y-1">
                        <p className="font-bold text-white">SSH Connection Verified</p>
                        <p className="text-xs text-[#A1A1A1]">{form.ipAddress}:{form.port} is reachable.</p>
                    </div>

                    <div>
                        <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                            Server Display Name
                        </label>
                        <input
                            ref={nameRef}
                            value={form.name}
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder="Production-Node-01"
                            className={INPUT_STYLE}
                            autoFocus
                        />
                        {errors.name && <p className="mt-1 text-xs text-rose-400">{errors.name}</p>}
                    </div>

                    <div className="border-t border-[#1F1F1F] pt-4 flex justify-between">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="h-9 px-4 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={isAdding}
                            className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            <span>Register Server Node</span>
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
