'use client';

import {
    Search, Shield, ShieldCheck, Trash2, UserCheck, UserMinus, UserPlus, Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ErrorState, PageHeader, PasswordInput, inputClassName, AppModal } from '@/components/ui';
import { AdminTable, Button, Panel, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminAccounts, useAdminMe, useAdminUsers } from '@/hooks/useDeployForgeData';

type UserTab = 'platform' | 'admins' | 'moderators';

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                'relative flex-1 rounded-lg py-2.5 text-sm font-black transition-all',
                active
                    ? 'bg-rose-300/10 text-rose-100'
                    : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
            )}
        >
            {active && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-rose-300" />}
            {children}
        </button>
    );
}

export default function AdminUsersPage() {
    const [search,    setSearch]    = useState('');
    const [status,    setStatus]    = useState('');
    const [activeTab, setActiveTab] = useState<UserTab>('platform');
    const [createName,     setCreateName]     = useState('');
    const [createEmail,    setCreateEmail]    = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createRole,     setCreateRole]     = useState<'ADMIN' | 'MODERATOR'>('ADMIN');
    const [createError,    setCreateError]    = useState('');
    const [createSuccess,  setCreateSuccess]  = useState('');

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

    const params       = useMemo(() => ({ search, status }), [search, status]);
    const me           = useAdminMe();
    const platformUsers = useAdminUsers(params);
    const adminAccounts = useAdminAccounts();
    const action        = useAdminAction();

    const isSuperAdmin   = me.data?.data?.role === 'SUPER_ADMIN';
    const currentAdminId = me.data?.data?.id;

    const filteredAdmins = useMemo(() => {
        if (!adminAccounts.data) return [];
        if (activeTab === 'admins')     return adminAccounts.data.filter(a => a.role === 'ADMIN' || a.role === 'SUPER_ADMIN');
        if (activeTab === 'moderators') return adminAccounts.data.filter(a => a.role === 'MODERATOR');
        return [];
    }, [adminAccounts.data, activeTab]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError(''); setCreateSuccess('');
        if (!createName || !createEmail || !createPassword) { setCreateError('All fields are required.'); return; }
        if (createPassword.length < 6) { setCreateError('Password must be at least 6 characters.'); return; }
        setConfirmModal({
            open: true,
            title: 'Provision Administrative Account',
            message: `Are you sure you want to create a new ${createRole} account for "${createEmail}"?`,
            actionText: 'Create Account',
            variant: 'primary',
            onConfirm: () => {
                action.mutate(
                    { method: 'post', path: '/admin/create-user', body: { name: createName, email: createEmail, password: createPassword, role: createRole } },
                    {
                        onSuccess: () => {
                            setCreateSuccess(`${createRole === 'ADMIN' ? 'Admin' : 'Moderator'} created successfully.`);
                            setCreateName(''); setCreateEmail(''); setCreatePassword('');
                            setConfirmModal(prev => ({ ...prev, open: false }));
                        },
                        onError: (err: any) => {
                            setCreateError(err?.response?.data?.message || err?.message || 'Failed to create user.');
                            setConfirmModal(prev => ({ ...prev, open: false }));
                        },
                    }
                );
            }
        });
    };

    const handleRoleChange   = (id: string, r: 'ADMIN' | 'MODERATOR' | 'USER') => {
        action.mutate(
            { method: 'patch', path: `/admin/users/${id}/role`, body: { role: r } },
            { onSuccess: () => setConfirmModal(prev => ({ ...prev, open: false })) }
        );
    };
    const handleStatusChange = (id: string, s: 'ACTIVE' | 'SUSPENDED') => {
        action.mutate(
            { method: 'patch', path: `/admin/platform-users/${id}/status`, body: { status: s } },
            { onSuccess: () => setConfirmModal(prev => ({ ...prev, open: false })) }
        );
    };
    const handleDeleteAdmin  = (id: string) => {
        action.mutate(
            { method: 'delete', path: `/admin/users/${id}` },
            { onSuccess: () => setConfirmModal(prev => ({ ...prev, open: false })) }
        );
    };
    const handleDeleteUser   = (id: string) => {
        action.mutate(
            { method: 'delete', path: `/admin/platform-users/${id}` },
            { onSuccess: () => setConfirmModal(prev => ({ ...prev, open: false })) }
        );
    };

    const triggerRoleChange = (id: string, r: 'ADMIN' | 'MODERATOR' | 'USER') => {
        setConfirmModal({
            open: true,
            title: r === 'USER' ? 'Demote User Role' : `Promote User to ${r}`,
            message: `Are you sure you want to change this user's role to ${r}? This will modify their access permissions.`,
            actionText: 'Confirm Role Change',
            variant: 'primary',
            onConfirm: () => handleRoleChange(id, r),
        });
    };

    const triggerStatusChange = (id: string, s: 'ACTIVE' | 'SUSPENDED') => {
        setConfirmModal({
            open: true,
            title: s === 'ACTIVE' ? 'Activate User Account' : 'Suspend User Account',
            message: s === 'ACTIVE'
                ? 'Are you sure you want to activate this user account? They will regain access to their dashboard and deployments.'
                : 'Are you sure you want to suspend this user account? They will be immediately blocked from logging in and accessing their resources.',
            actionText: s === 'ACTIVE' ? 'Activate' : 'Suspend',
            variant: s === 'ACTIVE' ? 'primary' : 'danger',
            onConfirm: () => handleStatusChange(id, s),
        });
    };

    const triggerDeleteAdmin = (id: string) => {
        setConfirmModal({
            open: true,
            title: 'Delete Administrative Account',
            message: 'Are you sure you want to permanently delete this admin/moderator account? This action is permanent and cannot be undone.',
            actionText: 'Delete Account',
            variant: 'danger',
            onConfirm: () => handleDeleteAdmin(id),
        });
    };

    const triggerDeleteUser = (id: string) => {
        setConfirmModal({
            open: true,
            title: 'Delete Platform User',
            message: 'Are you sure you want to permanently delete this platform user and ALL of their associated VPS servers, projects, and deployments? This action is permanent and cannot be undone.',
            actionText: 'Delete User & Resources',
            variant: 'danger',
            onConfirm: () => handleDeleteUser(id),
        });
    };

    const platformCount  = platformUsers.data?.length || 0;
    const adminCount     = adminAccounts.data?.filter(a => a.role === 'ADMIN' || a.role === 'SUPER_ADMIN').length || 0;
    const modCount       = adminAccounts.data?.filter(a => a.role === 'MODERATOR').length || 0;
    const activeCount    = platformUsers.data?.filter(u => u.status === 'ACTIVE').length || 0;
    const suspendedCount = platformUsers.data?.filter(u => u.status !== 'ACTIVE').length || 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="User Management"
                description="Manage platform developers, moderators, administrators, and configure system access roles."
            />

            {platformUsers.isError  && <ErrorState message={(platformUsers.error as Error)?.message}  onRetry={() => platformUsers.refetch()} />}
            {adminAccounts.isError  && <ErrorState message={(adminAccounts.error as Error)?.message}  onRetry={() => adminAccounts.refetch()} />}
            {action.isError         && <ErrorState title="Admin Action Failed" message={(action.error as Error)?.message} />}

            {/* Platform stat chips */}
            <div className="flex flex-wrap gap-3">
                {[
                    { label: 'Platform Users', value: platformCount,  color: 'border-white/[0.07] bg-white/[0.04] text-slate-300' },
                    { label: 'Active',         value: activeCount,    color: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300' },
                    { label: 'Suspended',      value: suspendedCount, color: suspendedCount ? 'border-amber-400/15 bg-amber-400/5 text-amber-400/80' : 'border-white/[0.07] bg-white/[0.04] text-slate-600' },
                    { label: 'Admins',         value: adminCount,     color: 'border-rose-400/20 bg-rose-400/8 text-rose-300' },
                ].map(chip => (
                    <div key={chip.label} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${chip.color}`}>
                        <span className="text-base font-black">{chip.value}</span> {chip.label}
                    </div>
                ))}
            </div>

            {/* Super admin provisioning form */}
            {isSuperAdmin && (
                <Panel className="relative overflow-hidden border-rose-300/15">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-300/40 to-transparent" />
                    <div className="mb-5 flex items-center gap-3 border-b border-white/[0.06] pb-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/8 text-rose-200">
                            <UserPlus size={15} />
                        </div>
                        <div>
                            <h2 className="font-black text-white text-sm">Provision Admin or Moderator</h2>
                            <p className="text-[10px] text-slate-500 mt-0.5">Create a privileged account with system access.</p>
                        </div>
                    </div>
                    <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
                        <label>
                            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name</p>
                            <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Jane Doe" className={inputClassName} />
                        </label>
                        <label>
                            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Email Address</p>
                            <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="jane@example.com" className={inputClassName} />
                        </label>
                        <label>
                            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Password (min 6)</p>
                            <PasswordInput value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="Secure password" />
                        </label>
                        <div className="flex gap-2">
                            <label className="flex-1">
                                <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Role</p>
                                <select value={createRole} onChange={e => setCreateRole(e.target.value as 'ADMIN' | 'MODERATOR')} className={inputClassName}>
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="MODERATOR">MODERATOR</option>
                                </select>
                            </label>
                            <div className="pt-6">
                                <Button type="submit" loading={action.isPending} className="h-10 px-5">
                                    Provision
                                </Button>
                            </div>
                        </div>
                    </form>
                    {createError   && <p className="mt-3 text-xs font-bold text-rose-400">{createError}</p>}
                    {createSuccess && <p className="mt-3 text-xs font-bold text-emerald-400">{createSuccess}</p>}
                </Panel>
            )}

            {/* Tab switcher */}
            <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
                <TabButton active={activeTab === 'platform'}  onClick={() => setActiveTab('platform')}>
                    <Users size={13} className="inline mr-1.5" />Platform Users ({platformCount})
                </TabButton>
                <TabButton active={activeTab === 'admins'} onClick={() => setActiveTab('admins')}>
                    <ShieldCheck size={13} className="inline mr-1.5" />Admins ({adminCount})
                </TabButton>
                <TabButton active={activeTab === 'moderators'} onClick={() => setActiveTab('moderators')}>
                    <Shield size={13} className="inline mr-1.5" />Moderators ({modCount})
                </TabButton>
            </div>

            {/* Platform users tab */}
            {activeTab === 'platform' && (
                <div className="space-y-4">
                    {/* Search + filter bar */}
                    <Panel className="py-3">
                        <div className="flex flex-wrap gap-3">
                            <label className={`flex flex-1 min-w-48 items-center gap-2 ${inputClassName}`}>
                                <Search size={14} className="shrink-0 text-slate-500" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search by name or email…"
                                    className="w-full bg-transparent text-sm text-slate-100 outline-none"
                                />
                            </label>
                            <select value={status} onChange={e => setStatus(e.target.value)} className={`${inputClassName} max-w-40`}>
                                <option value="">All Statuses</option>
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="SUSPENDED">SUSPENDED</option>
                            </select>
                        </div>
                    </Panel>

                    <Panel>
                        <AdminTable
                            columns={['User', 'Role', 'Status', 'Resources', 'GitHub', 'Joined', 'Actions']}
                            empty="No users match the filters."
                            rows={platformUsers.isLoading ? undefined : platformUsers.data?.map(user => [
                                <div key="u">
                                    <p className="font-black text-white text-sm">{user.name || 'Unnamed'}</p>
                                    <p className="text-[10px] text-slate-500">{user.email}</p>
                                </div>,
                                <StatusBadge key="r" status={user.role || 'USER'} />,
                                <StatusBadge key="s" status={user.status} />,
                                <span key="res" className="text-xs text-slate-400">
                                    {user._count?.deployments || 0}D / {user._count?.vps || 0}V
                                </span>,
                                <span key="gh" className="text-xs text-slate-400">
                                    {user.githubAccount ? `@${user.githubAccount.username}` : '—'}
                                </span>,
                                <span key="j" className="text-xs text-slate-500 whitespace-nowrap">{formatDate(user.createdAt)}</span>,
                                <div key="a" className="flex flex-wrap gap-1.5">
                                    {user.status === 'ACTIVE' ? (
                                        <Button variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => triggerStatusChange(user.id, 'SUSPENDED')}>
                                            <UserMinus size={11} /> Suspend
                                        </Button>
                                    ) : (
                                        <Button variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => triggerStatusChange(user.id, 'ACTIVE')}>
                                            <UserCheck size={11} /> Activate
                                        </Button>
                                    )}
                                    {isSuperAdmin && (
                                        <Button variant="danger" className="h-7 px-2 text-[11px]" onClick={() => triggerDeleteUser(user.id)}>
                                            <Trash2 size={11} /> Delete
                                        </Button>
                                    )}
                                    {isSuperAdmin && (
                                        <>
                                            {user.role === 'USER' && (
                                                <>
                                                    <Button variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => triggerRoleChange(user.id, 'ADMIN')}>
                                                        <ShieldCheck size={11} /> Admin
                                                    </Button>
                                                    <Button variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => triggerRoleChange(user.id, 'MODERATOR')}>
                                                        <Shield size={11} /> Mod
                                                    </Button>
                                                </>
                                            )}
                                            {(user.role === 'ADMIN' || user.role === 'MODERATOR') && (
                                                <Button variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => triggerRoleChange(user.id, 'USER')}>
                                                    Demote
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>,
                            ]) || []}
                        />
                    </Panel>
                </div>
            )}

            {/* Admins / Moderators tab */}
            {activeTab !== 'platform' && (
                <Panel>
                    <AdminTable
                        columns={['Name / Email', 'Role', 'Created', 'Last Login', 'Actions']}
                        empty={`No ${activeTab === 'admins' ? 'administrators' : 'moderators'} configured.`}
                        rows={adminAccounts.isLoading ? undefined : filteredAdmins.map(account => {
                            const isSelf     = account.id === currentAdminId;
                            const canModify  = isSuperAdmin && !isSelf && account.role !== 'SUPER_ADMIN';
                            return [
                                <div key="a">
                                    <p className="font-black text-white text-sm">{account.name || 'Administrative Account'}</p>
                                    <p className="text-[10px] text-slate-500">{account.email}</p>
                                </div>,
                                <StatusBadge key="r" status={account.role} />,
                                <span key="c" className="text-xs text-slate-500 whitespace-nowrap">{formatDate(account.createdAt)}</span>,
                                <span key="l" className="text-xs text-slate-500 whitespace-nowrap">{formatDate(account.lastLoginAt)}</span>,
                                <div key="act" className="flex gap-1.5">
                                    {canModify ? (
                                        <>
                                            <Button variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => triggerRoleChange(account.id, 'USER')}>
                                                <UserMinus size={11} /> Demote
                                            </Button>
                                            <Button variant="danger" className="h-7 px-2 text-[11px]" onClick={() => triggerDeleteAdmin(account.id)}>
                                                <Trash2 size={11} />
                                            </Button>
                                        </>
                                    ) : (
                                        <span className="text-xs text-slate-600 italic">{isSelf ? 'Current Session' : 'Protected'}</span>
                                    )}
                                </div>,
                            ];
                        })}
                    />
                </Panel>
            )}

            {/* Admin confirmation modal */}
            <AppModal
                open={confirmModal.open}
                onClose={() => !action.isPending && setConfirmModal(prev => ({ ...prev, open: false }))}
                title={confirmModal.title}
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-300 leading-relaxed">
                        {confirmModal.message}
                    </p>

                    <div className="flex justify-end gap-2 border-t border-white/5 pt-4 mt-2">
                        <Button 
                            type="button" 
                            variant="secondary"
                            onClick={() => setConfirmModal(prev => ({ ...prev, open: false }))}
                            disabled={action.isPending}
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="button" 
                            variant={confirmModal.variant}
                            onClick={confirmModal.onConfirm}
                            loading={action.isPending}
                        >
                            {confirmModal.actionText}
                        </Button>
                    </div>
                </div>
            </AppModal>
        </div>
    );
}
