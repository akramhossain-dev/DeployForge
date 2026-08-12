'use client';

import { useState } from 'react';
import {
    CheckCircle2, Github, KeyRound, Mail, RefreshCw,
    ShieldCheck, UserPlus, XCircle, Zap, Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { AppModal } from '@/components/ui';
import { AdminTable, SmallMeta, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAccounts, useAdminAction, useAdminMe, useAdminSettings } from '@/hooks/useDeployForgeData';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className="flex items-center justify-between border-b border-[#1F1F1F] py-1.5 font-mono text-xs">
            <span className="text-[#666666] font-semibold uppercase text-[10px]">{label}</span>
            <span className={clsx('font-bold', ok ? 'text-emerald-400' : 'text-[#666666]')}>{ok ? 'CONFIGURED' : 'NOT SET'}</span>
        </div>
    );
}

export default function AdminSettingsPage() {
    const settings = useAdminSettings();
    const me = useAdminMe();
    const action = useAdminAction();
    const data = settings.data;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('ADMIN');
    const [adminSecret, setAdminSecret] = useState('');
    const isSuperAdmin = me.data?.role === 'SUPER_ADMIN';
    const accounts = useAdminAccounts(isSuperAdmin);

    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        actionText: string;
        onConfirm: () => void;
        variant: 'primary' | 'secondary' | 'danger';
    }>({
        open: false,
        title: '',
        message: '',
        actionText: '',
        onConfirm: () => {},
        variant: 'primary',
    });

    const triggerCreateAdmin = () => {
        if (!email || !password || !adminSecret) return;
        setConfirmModal({
            open: true,
            title: `Provision Administrative Account`,
            message: `Are you sure you want to create a new ${role} account for "${email}"?`,
            actionText: 'Create Account',
            variant: 'primary',
            onConfirm: () => {
                action.mutate({ path: '/admin/create-user', body: { email, password, role, adminSecret } }, {
                    onSuccess: () => {
                        setEmail('');
                        setPassword('');
                        setAdminSecret('');
                        setConfirmModal(prev => ({ ...prev, open: false }));
                        accounts.refetch();
                    },
                });
            }
        });
    };

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Platform System Config
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Inspect platform environment variables, SMTP parameters, GitHub App config, and system secrets.
                    </p>
                </div>
                <button
                    onClick={() => settings.refetch()}
                    disabled={settings.isRefetching}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#1F1F1F] bg-[#111111] px-3 font-semibold text-white hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                    <RefreshCw size={13} className={settings.isRefetching ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {settings.isError && <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">{(settings.error as Error)?.message}</div>}

            {/* SUPER_ADMIN Provision Form */}
            {isSuperAdmin && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <UserPlus size={14} />
                        <span>Provision System Admin or Moderator</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="admin@example.com" className={INPUT_STYLE} />
                        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" className={INPUT_STYLE} />
                        <select value={role} onChange={e => setRole(e.target.value)} className={INPUT_STYLE}>
                            <option value="ADMIN">ADMIN</option>
                            <option value="MODERATOR">MODERATOR</option>
                        </select>
                        <input value={adminSecret} onChange={e => setAdminSecret(e.target.value)} type="password" placeholder="ADMIN_SECRET" className={INPUT_STYLE} />
                    </div>
                    <div className="flex justify-end pt-2 border-t border-[#1F1F1F]">
                        <button onClick={triggerCreateAdmin} disabled={!email || !password || !adminSecret || action.isPending} className="h-8 px-4 rounded border border-[#1F1F1F] bg-white font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50">
                            Create Account
                        </button>
                    </div>
                </div>
            )}

            {/* Config Panels */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* SMTP */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Mail size={14} />
                        <span>SMTP Email Transport</span>
                    </div>
                    <StatusChip ok={!!data?.smtp.host} label="SMTP Host" />
                    <StatusChip ok={!!data?.smtp.port} label="SMTP Port" />
                    <StatusChip ok={!!data?.smtp.userConfigured} label="SMTP Auth Credentials" />
                </div>

                {/* GitHub OAuth */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Github size={14} />
                        <span>GitHub App Integration</span>
                    </div>
                    <StatusChip ok={!!data?.github.clientIdConfigured} label="GitHub Client ID" />
                    <StatusChip ok={!!data?.github.clientSecretConfigured} label="GitHub Client Secret" />
                </div>

                {/* Queue */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <Zap size={14} />
                        <span>Redis Queue & Worker</span>
                    </div>
                    <StatusChip ok={!!data?.queue.redisConfigured} label="Redis Server Status" />
                    <StatusChip ok={!!data?.queue.maxAttempts} label="Max Job Retry Attempts" />
                </div>

                {/* Security */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <KeyRound size={14} />
                        <span>Platform Secrets & Security</span>
                    </div>
                    <StatusChip ok={!!data?.security.jwtConfigured} label="Session JWT Secret" />
                    <StatusChip ok={!!data?.security.adminSecretConfigured} label="System Admin Secret" />
                    <StatusChip ok={!!data?.security.encryptionConfigured} label="Database Encryption Key" />
                </div>
            </div>

            {/* Modal */}
            {confirmModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                        <h3 className="text-sm font-bold text-white">{confirmModal.title}</h3>
                        <p className="text-[#A1A1A1]">{confirmModal.message}</p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-[#1F1F1F]">
                            <button onClick={() => setConfirmModal(p => ({ ...p, open: false }))} className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white">Cancel</button>
                            <button onClick={confirmModal.onConfirm} className="h-8 px-3 rounded border border-[#1F1F1F] bg-white font-semibold text-black hover:bg-[#E5E5E5]">Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
