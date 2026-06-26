'use client';

import { FormEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Plus, Server, ShieldCheck, Terminal, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Button, Panel, PasswordInput, SectionHeading, inputClassName } from '@/components/ui';
import { useAddVps, useTestVpsConnection } from '@/hooks/useDeployForgeData';
import { ApiError } from '@/lib/api/client';
import type { VpsConnectionPayload } from '@/lib/api/types';

const STEPS = ['Connection', 'Verify SSH', 'Register'] as const;
type Step = 0 | 1 | 2;

const initial = { name: '', ipAddress: '', port: '22', username: 'root', authType: 'password' as 'password' | 'key', password: '', privateKey: '' };

type TestResult = { status: 'idle' | 'success' | 'failed'; message: string; readiness?: { shell: boolean; os?: string; dockerInstalled?: boolean; nginxInstalled?: boolean } };

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase text-slate-400">{label}</span>
            {children}
            {error && <p className="mt-1.5 text-xs font-semibold text-rose-400">{error}</p>}
        </label>
    );
}

function StepIndicator({ current }: { current: Step }) {
    return (
        <div className="flex items-center gap-0 mb-7">
            {STEPS.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <div key={label} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                            <div className={clsx(
                                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-black border transition-all',
                                done && 'bg-emerald-400/20 border-emerald-400/40 text-emerald-300',
                                active && 'bg-cyan-300/15 border-cyan-300/40 text-cyan-200 shadow-lg shadow-cyan-500/20',
                                !done && !active && 'bg-white/[0.04] border-white/10 text-slate-500'
                            )}>
                                {done ? <CheckCircle2 size={14} /> : i + 1}
                            </div>
                            <span className={clsx('text-[10px] font-bold uppercase whitespace-nowrap', active ? 'text-cyan-300' : done ? 'text-emerald-400' : 'text-slate-600')}>{label}</span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div className={clsx('mx-2 flex-1 h-px mt-[-12px]', i < current ? 'bg-emerald-400/30' : 'bg-white/[0.06]')} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function ReadinessBadge({ ok, label }: { ok?: boolean; label: string }) {
    return (
        <div className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold',
            ok ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300' : 'border-slate-700/50 bg-white/[0.03] text-slate-500')}>
            {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {label}
        </div>
    );
}

export default function AddVpsTab({ onAdded }: { onAdded?: () => void }) {
    const [step, setStep] = useState<Step>(0);
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [testResult, setTestResult] = useState<TestResult>({ status: 'idle', message: '' });
    const addVps = useAddVps();
    const testConn = useTestVpsConnection();

    const nameRef = useRef<HTMLInputElement>(null);
    const ipRef = useRef<HTMLInputElement>(null);
    const portRef = useRef<HTMLInputElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const privateKeyRef = useRef<HTMLTextAreaElement>(null);

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
        if (!form.ipAddress.trim()) e.ipAddress = 'IP or hostname required';
        const p = Number(form.port);
        if (!form.port || isNaN(p) || p < 1 || p > 65535) e.port = 'Port must be 1–65535';
        if (!form.username.trim()) e.username = 'Username required';
        if (form.authType === 'password' && !form.password) e.password = 'Password required';
        if (form.authType === 'key' && !form.privateKey.trim()) e.privateKey = 'Private key required';
        setErrors(e);
        if (e.ipAddress) ipRef.current?.focus();
        else if (e.port) portRef.current?.focus();
        else if (e.username) usernameRef.current?.focus();
        else if (e.password) passwordRef.current?.focus();
        else if (e.privateKey) privateKeyRef.current?.focus();
        return Object.keys(e).length === 0;
    }

    async function handleVerify() {
        if (!validateConnection()) return;
        setTestResult({ status: 'idle', message: '' });
        try {
            const res = await testConn.mutateAsync(payload);
            if (res.success) {
                setTestResult({ status: 'success', message: res.message || 'SSH verified successfully', readiness: res.readiness });
                setStep(2);
            } else {
                setTestResult({ status: 'failed', message: res.message || 'Connection failed' });
            }
        } catch (err) {
            setTestResult({ status: 'failed', message: err instanceof ApiError ? err.message : 'Connection failed' });
        }
    }

    async function handleAdd(e: FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) { setErrors({ name: 'VPS name required' }); nameRef.current?.focus(); return; }
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
        <Panel>
            <SectionHeading icon={<Plus size={18} />} title="Add VPS" description="Connect a server via SSH. Credentials are encrypted at rest." />
            <StepIndicator current={step} />

            {/* Step 0: Connection details */}
            {step === 0 && (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="IP Address / Hostname" error={errors.ipAddress}>
                            <input ref={ipRef} className={clsx(inputClassName, errors.ipAddress ? 'border-rose-500' : '')}
                                value={form.ipAddress} onChange={e => setField('ipAddress', e.target.value)} placeholder="203.0.113.10" />
                        </Field>
                        <Field label="SSH Port" error={errors.port}>
                            <input ref={portRef} className={clsx(inputClassName, errors.port ? 'border-rose-500' : '')}
                                value={form.port} onChange={e => setField('port', e.target.value)} inputMode="numeric" placeholder="22" />
                        </Field>
                        <Field label="SSH Username" error={errors.username}>
                            <input ref={usernameRef} className={clsx(inputClassName, errors.username ? 'border-rose-500' : '')}
                                value={form.username} onChange={e => setField('username', e.target.value)} placeholder="root" />
                        </Field>
                        <Field label="Auth Type" error={undefined}>
                            <div className="flex w-full rounded-lg border border-white/10 bg-slate-950/55 p-1">
                                {(['password', 'key'] as const).map(t => (
                                    <button key={t} type="button" onClick={() => { setField('authType', t); setErrors({}); }}
                                        className={clsx('flex-1 h-9 rounded-md text-sm font-black transition-colors',
                                            form.authType === t ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white')}>
                                        {t === 'password' ? 'Password' : 'SSH Key'}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </div>
                    {form.authType === 'password' ? (
                        <Field label="SSH Password" error={errors.password}>
                            <PasswordInput ref={passwordRef} className={clsx(inputClassName, errors.password ? 'border-rose-500' : '')}
                                value={form.password} onChange={e => setField('password', e.target.value)} autoComplete="new-password" />
                        </Field>
                    ) : (
                        <Field label="SSH Private Key" error={errors.privateKey}>
                            <textarea ref={privateKeyRef} className={clsx(inputClassName, 'min-h-36 py-3 font-mono text-xs', errors.privateKey ? 'border-rose-500' : '')}
                                value={form.privateKey} onChange={e => setField('privateKey', e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                        </Field>
                    )}
                    <Button onClick={() => { setStep(1); }} className="w-full sm:w-auto">
                        <Server size={16} /> Next: Verify SSH
                    </Button>
                </div>
            )}

            {/* Step 1: Verify */}
            {step === 1 && (
                <div className="space-y-5">
                    <div className="rounded-lg border border-white/[0.06] bg-slate-950/50 p-4 font-mono text-xs text-slate-400 space-y-1">
                        <p><span className="text-cyan-300">host</span>  {form.ipAddress}:{form.port}</p>
                        <p><span className="text-cyan-300">user</span>  {form.username}</p>
                        <p><span className="text-cyan-300">auth</span>  {form.authType === 'password' ? 'password' : 'ssh-key'}</p>
                    </div>

                    {testResult.status !== 'idle' && (
                        <div className={clsx('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
                            testResult.status === 'success' ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-200' : 'border-rose-400/20 bg-rose-400/8 text-rose-200')}>
                            {testResult.status === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
                            <div>
                                <p className="font-bold">{testResult.message}</p>
                                {testResult.readiness && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <ReadinessBadge ok={testResult.readiness.shell} label="Shell" />
                                        <ReadinessBadge ok={testResult.readiness.dockerInstalled} label="Docker" />
                                        <ReadinessBadge ok={testResult.readiness.nginxInstalled} label="Nginx" />
                                    </div>
                                )}
                                {testResult.readiness?.os && <p className="mt-2 text-xs opacity-60 font-mono">{testResult.readiness.os}</p>}
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Terminal size={14} className="text-slate-500" />
                            <span className="text-xs font-bold uppercase text-slate-500">Auto-install DeployForge Agent</span>
                            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-300 ring-1 ring-amber-400/20">Coming Soon</span>
                        </div>
                        <p className="text-xs text-slate-600">Agent installation and API key provisioning will be available in an upcoming release.</p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button variant="secondary" onClick={() => setStep(0)}>← Back</Button>
                        <Button onClick={handleVerify} loading={isTesting} disabled={isTesting}>
                            <KeyRound size={16} /> {isTesting ? 'Connecting…' : 'Test SSH Connection'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 2: Register */}
            {step === 2 && (
                <form onSubmit={handleAdd} className="space-y-5">
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-4 py-3">
                        <ShieldCheck size={18} className="text-emerald-300 shrink-0" />
                        <div>
                            <p className="text-sm font-black text-emerald-200">SSH verified successfully</p>
                            <p className="text-xs text-emerald-300/70 mt-0.5">{form.ipAddress}:{form.port} — {testResult.readiness?.os}</p>
                        </div>
                    </div>
                    <Field label="VPS Name" error={errors.name}>
                        <input ref={nameRef} className={clsx(inputClassName, errors.name ? 'border-rose-500' : '')}
                            value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Production API Server" autoFocus />
                    </Field>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button variant="secondary" type="button" onClick={() => setStep(1)}>← Back</Button>
                        <Button type="submit" loading={isAdding}>
                            {isAdding ? <><Loader2 size={16} className="animate-spin" />Adding…</> : <><Plus size={16} />Add VPS</>}
                        </Button>
                    </div>
                </form>
            )}
        </Panel>
    );
}
