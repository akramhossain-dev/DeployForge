'use client';

import { useState } from 'react';
import {
    CheckCircle2, Database, Github, KeyRound, Mail, RefreshCw,
    Settings, ShieldCheck, UserPlus, XCircle, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { ErrorState, PageHeader, PasswordInput, inputClassName } from '@/components/ui';
import { AdminTable, Button, Panel, SmallMeta, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAccounts, useAdminAction, useAdminMe, useAdminSettings } from '@/hooks/useDeployForgeData';

function SectionPanel({ icon, title, description, children, accent }: {
    icon: React.ReactNode; title: string; description?: string; children: React.ReactNode; accent?: string;
}) {
    return (
        <Panel className="relative overflow-hidden">
            <div className={clsx('absolute inset-x-0 top-0 h-0.5', accent || 'bg-gradient-to-r from-rose-300/25 to-transparent')} />
            <div className="mb-5 flex items-center gap-3 border-b border-white/[0.06] pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/8 text-rose-200 shrink-0">{icon}</div>
                <div>
                    <h2 className="font-black text-white text-sm">{title}</h2>
                    {description && <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>}
                </div>
            </div>
            {children}
        </Panel>
    );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className={clsx(
            'flex items-center gap-2 rounded-xl border px-3 py-2.5',
            ok ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-rose-400/15 bg-rose-400/[0.04]'
        )}>
            {ok
                ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                : <XCircle size={13} className="text-rose-400 shrink-0" />}
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                <p className={clsx('text-xs font-black', ok ? 'text-emerald-300' : 'text-rose-300')}>{ok ? 'Configured' : 'Not Set'}</p>
            </div>
        </div>
    );
}

export default function AdminSettingsPage() {
    const settings  = useAdminSettings();
    const me        = useAdminMe();
    const action    = useAdminAction();
    const data      = settings.data;
    const [email,       setEmail]       = useState('');
    const [password,    setPassword]    = useState('');
    const [role,        setRole]        = useState('ADMIN');
    const [adminSecret, setAdminSecret] = useState('');
    const isSuperAdmin  = me.data?.role === 'SUPER_ADMIN';
    const accounts      = useAdminAccounts(isSuperAdmin);

    function createAdmin() {
        action.mutate({ path: '/admin/create-user', body: { email, password, role, adminSecret } }, {
            onSuccess: () => { setEmail(''); setPassword(''); setAdminSecret(''); },
        });
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Admin Settings"
                description="Current SMTP, GitHub OAuth, queue, security, and app configuration state."
                action={
                    <Button variant="secondary" onClick={() => settings.refetch()} loading={settings.isRefetching}>
                        <RefreshCw size={14} /> Refresh
                    </Button>
                }
            />

            {settings.isError ? <ErrorState message={(settings.error as Error)?.message} onRetry={() => settings.refetch()} /> : null}
            {action.isError   ? <ErrorState title="Admin action failed" message={(action.error as Error)?.message} /> : null}

            {/* SUPER_ADMIN: provision + manage */}
            {isSuperAdmin && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <SectionPanel icon={<UserPlus size={15} />} title="Provision Admin / Moderator" description="Create a new administrative account.">
                        <div className="space-y-3">
                            <label>
                                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Email Address</p>
                                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="admin@example.com" className={inputClassName} />
                            </label>
                            <label>
                                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Password</p>
                                <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Temporary password" />
                            </label>
                            <label>
                                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">System Role</p>
                                <select value={role} onChange={e => setRole(e.target.value)} className={inputClassName}>
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="MODERATOR">MODERATOR</option>
                                </select>
                            </label>
                            <label>
                                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Admin Secret</p>
                                <PasswordInput value={adminSecret} onChange={e => setAdminSecret(e.target.value)} placeholder="ADMIN_SECRET env value" />
                            </label>
                            <div className="pt-1">
                                <Button onClick={createAdmin} loading={action.isPending} className="w-full">
                                    <UserPlus size={14} /> Create Account
                                </Button>
                            </div>
                        </div>
                    </SectionPanel>

                    <SectionPanel icon={<ShieldCheck size={15} />} title="Admin Accounts" description="Manage administrator and moderator roles.">
                        <AdminTable
                            columns={['Email', 'Role', 'Last Login', '']}
                            empty="No admin accounts found."
                            rows={accounts.isLoading ? undefined : accounts.data?.map(admin => [
                                <div key="e">
                                    <p className="font-black text-white text-sm">{admin.name || 'Admin'}</p>
                                    <p className="text-[10px] text-slate-500">{admin.email}</p>
                                </div>,
                                <select key="r" value={admin.role}
                                    onChange={e => action.mutate({ method: 'patch', path: `/admin/users/${admin.id}/role`, body: { role: e.target.value } })}
                                    className={`${inputClassName} h-8 py-1 text-xs`}>
                                    <option>SUPER_ADMIN</option><option>ADMIN</option><option>MODERATOR</option>
                                </select>,
                                <span key="l" className="text-xs text-slate-500">{formatDate(admin.lastLoginAt)}</span>,
                                <Button key="d" variant="danger" className="h-7 px-2 text-[11px]"
                                    onClick={() => action.mutate({ method: 'delete', path: `/admin/users/${admin.id}` })}>
                                    Delete
                                </Button>,
                            ]) || []}
                        />
                    </SectionPanel>
                </div>
            )}

            {/* Config overview */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* SMTP */}
                <SectionPanel icon={<Mail size={15} />} title="SMTP" description="Email delivery configuration." accent="bg-gradient-to-r from-cyan-400/20 to-transparent">
                    <div className="grid grid-cols-2 gap-3">
                        <SmallMeta label="Host"   value={data?.smtp.host || '—'} />
                        <SmallMeta label="Port"   value={data?.smtp.port ?? '—'} />
                        <SmallMeta label="Secure" value={data?.smtp.secure ? 'TLS Enabled' : 'Disabled'} />
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Auth User</p>
                            {data?.smtp.userConfigured
                                ? <span className="flex items-center gap-1 text-xs font-black text-emerald-300"><CheckCircle2 size={11} />Configured</span>
                                : <span className="flex items-center gap-1 text-xs font-black text-slate-600"><XCircle size={11} />Not Set</span>}
                        </div>
                    </div>
                </SectionPanel>

                {/* GitHub OAuth */}
                <SectionPanel icon={<Github size={15} />} title="GitHub OAuth" description="OAuth app credentials for GitHub integration." accent="bg-gradient-to-r from-violet-400/20 to-transparent">
                    <div className="space-y-2">
                        <StatusChip ok={!!data?.github.clientIdConfigured}     label="Client ID" />
                        <StatusChip ok={!!data?.github.clientSecretConfigured} label="Client Secret" />
                        <SmallMeta label="Redirect URI" value={data?.github.redirectUri || '—'} />
                    </div>
                </SectionPanel>

                {/* Queue */}
                <SectionPanel icon={<Zap size={15} />} title="Queue" description="Redis queue and job retry configuration." accent="bg-gradient-to-r from-amber-400/15 to-transparent">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Redis</p>
                            {data?.queue.redisConfigured
                                ? <span className="flex items-center gap-1 text-xs font-black text-emerald-300"><CheckCircle2 size={11} />Connected</span>
                                : <span className="flex items-center gap-1 text-xs font-black text-rose-300"><XCircle size={11} />Not Set</span>}
                        </div>
                        <SmallMeta label="Max Attempts" value={data?.queue.maxAttempts ?? 0} />
                    </div>
                </SectionPanel>

                {/* Security & App */}
                <SectionPanel icon={<KeyRound size={15} />} title="Security & App" description="JWT secrets, encryption keys, and environment.">
                    <div className="grid grid-cols-1 gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <StatusChip ok={!!data?.security.jwtConfigured}         label="JWT Secret" />
                            <StatusChip ok={!!data?.security.adminJwtConfigured}    label="Admin JWT" />
                            <StatusChip ok={!!data?.security.adminSecretConfigured} label="Admin Secret" />
                            <StatusChip ok={!!data?.security.encryptionConfigured}  label="Encryption Key" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-1">
                            <SmallMeta label="App URL"     value={data?.app.appUrl || '—'} />
                            <SmallMeta label="Environment" value={data?.app.nodeEnv || 'development'} />
                        </div>
                    </div>
                </SectionPanel>
            </div>
        </div>
    );
}
