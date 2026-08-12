'use client';

import { Search, Shield, ShieldCheck, Trash2, UserCheck, UserMinus, UserPlus, Users, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { PasswordInput, AppModal } from '@/components/ui';
import { AdminTable, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminAccounts, useAdminMe, useAdminUsers } from '@/hooks/useDeployForgeData';

type UserTab = 'platform' | 'admins' | 'moderators';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

export default function AdminUsersPage() {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [activeTab, setActiveTab] = useState<UserTab>('platform');
    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createRole, setCreateRole] = useState<'ADMIN' | 'MODERATOR'>('ADMIN');
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');

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

    const params = useMemo(() => ({ search, status }), [search, status]);
    const me = useAdminMe();
    const platformUsers = useAdminUsers(params);
    const adminAccounts = useAdminAccounts();
    const action = useAdminAction();

    const isSuperAdmin = me.data?.data?.role === 'SUPER_ADMIN';
    const currentAdminId = me.data?.data?.id;

    const filteredAdmins = useMemo(() => {
        if (!adminAccounts.data) return [];
        if (activeTab === 'admins') return adminAccounts.data.filter((a: any) => a.role === 'ADMIN' || a.role === 'SUPER_ADMIN');
        if (activeTab === 'moderators') return adminAccounts.data.filter((a: any) => a.role === 'MODERATOR');
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

    const handleRoleChange = (id: string, r: 'ADMIN' | 'MODERATOR' | 'USER') => {
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
    const handleDeleteAdmin = (id: string) => {
        action.mutate(
            { method: 'delete', path: `/admin/users/${id}` },
            { onSuccess: () => setConfirmModal(prev => ({ ...prev, open: false })) }
        );
    };
    const handleDeleteUser = (id: string) => {
        action.mutate(
            { method: 'delete', path: `/admin/platform-users/${id}` },
            { onSuccess: () => setConfirmModal(prev => ({ ...prev, open: false })) }
        );
    };

    const triggerRoleChange = (id: string, r: 'ADMIN' | 'MODERATOR' | 'USER') => {
        setConfirmModal({
            open: true,
            title: r === 'USER' ? 'Demote User Role' : `Promote User to ${r}`,
            message: `Are you sure you want to change this user's role to ${r}?`,
            actionText: 'Confirm Role Change',
            variant: 'primary',
            onConfirm: () => handleRoleChange(id, r),
        });
    };

    const triggerStatusChange = (id: string, s: 'ACTIVE' | 'SUSPENDED') => {
        setConfirmModal({
            open: true,
            title: s === 'ACTIVE' ? 'Activate User Account' : 'Suspend User Account',
            message: s === 'ACTIVE' ? 'Activate this developer account?' : 'Suspend this user account immediately?',
            actionText: s === 'ACTIVE' ? 'Activate' : 'Suspend',
            variant: s === 'ACTIVE' ? 'primary' : 'danger',
            onConfirm: () => handleStatusChange(id, s),
        });
    };

    const triggerDeleteAdmin = (id: string) => {
        setConfirmModal({
            open: true,
            title: 'Delete Administrative Account',
            message: 'Permanently delete this admin account?',
            actionText: 'Delete Account',
            variant: 'danger',
            onConfirm: () => handleDeleteAdmin(id),
        });
    };

    const triggerDeleteUser = (id: string) => {
        setConfirmModal({
            open: true,
            title: 'Delete Platform User',
            message: 'Permanently delete this user and all associated servers/deployments?',
            actionText: 'Delete User & Resources',
            variant: 'danger',
            onConfirm: () => handleDeleteUser(id),
        });
    };

    const platformCount = platformUsers.data?.length || 0;
    const adminCount = adminAccounts.data?.filter((a: any) => a.role === 'ADMIN' || a.role === 'SUPER_ADMIN').length || 0;
    const modCount = adminAccounts.data?.filter((a: any) => a.role === 'MODERATOR').length || 0;

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        User Management
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Manage developer platform accounts, administrative roles, and access control policies.
                    </p>
                </div>
            </div>

            {platformUsers.isError && <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">{(platformUsers.error as Error)?.message}</div>}

            {/* Super Admin Provisioning Form */}
            {isSuperAdmin && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 text-white font-bold">
                        <UserPlus size={14} />
                        <span>Provision Admin or Moderator Account</span>
                    </div>
                    <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Full Name</label>
                            <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Full Name" className={INPUT_STYLE} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Email Address</label>
                            <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="email@example.com" className={INPUT_STYLE} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Password</label>
                            <input type="password" value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="••••••••" className={INPUT_STYLE} />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Role</label>
                                <select value={createRole} onChange={e => setCreateRole(e.target.value as any)} className={INPUT_STYLE}>
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="MODERATOR">MODERATOR</option>
                                </select>
                            </div>
                            <button type="submit" disabled={action.isPending} className="h-9 px-4 rounded border border-[#1F1F1F] bg-white font-semibold text-black hover:bg-[#E5E5E5] self-end">
                                Provision
                            </button>
                        </div>
                    </form>
                    {createError && <p className="text-rose-400 text-xs">{createError}</p>}
                    {createSuccess && <p className="text-emerald-400 text-xs">{createSuccess}</p>}
                </div>
            )}

            {/* Tab switcher */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-1 flex items-center gap-1">
                {[
                    { id: 'platform', label: `Platform Users (${platformCount})`, icon: <Users size={13} /> },
                    { id: 'admins', label: `Admins (${adminCount})`, icon: <ShieldCheck size={13} /> },
                    { id: 'moderators', label: `Moderators (${modCount})`, icon: <Shield size={13} /> },
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id as UserTab)}
                        className={clsx(
                            'flex items-center gap-2 rounded px-3 py-1.5 font-semibold text-xs transition-colors flex-1 justify-center',
                            activeTab === t.id ? 'bg-[#111111] text-white' : 'text-[#A1A1A1] hover:text-white'
                        )}
                    >
                        {t.icon}
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            {/* Table */}
            {activeTab === 'platform' && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 justify-between">
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search user name or email..."
                            className={clsx(INPUT_STYLE, 'sm:w-64')}
                        />
                        <select value={status} onChange={e => setStatus(e.target.value)} className={clsx(INPUT_STYLE, 'sm:w-40')}>
                            <option value="">All Statuses</option>
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="SUSPENDED">SUSPENDED</option>
                        </select>
                    </div>

                    <AdminTable
                        columns={['User', 'Role', 'Status', 'Resources', 'Joined', 'Actions']}
                        empty="No users found."
                        rows={platformUsers.isLoading ? undefined : platformUsers.data?.map(user => [
                            <div key="u">
                                <p className="font-bold text-white text-xs">{user.name || 'Unnamed'}</p>
                                <p className="text-[10px] text-[#666666]">{user.email}</p>
                            </div>,
                            <StatusBadge key="r" status={user.role || 'USER'} />,
                            <StatusBadge key="s" status={user.status} />,
                            <span key="res" className="text-[#A1A1A1]">
                                {user._count?.deployments || 0} Deployments / {user._count?.vps || 0} VPS
                            </span>,
                            <span key="j" className="text-[#666666]">{formatDate(user.createdAt)}</span>,
                            <div key="a" className="flex items-center gap-1.5">
                                {user.status === 'ACTIVE' ? (
                                    <button onClick={() => triggerStatusChange(user.id, 'SUSPENDED')} className="h-6 px-2 rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white text-[10px]">
                                        Suspend
                                    </button>
                                ) : (
                                    <button onClick={() => triggerStatusChange(user.id, 'ACTIVE')} className="h-6 px-2 rounded border border-[#1F1F1F] bg-[#111111] text-white text-[10px]">
                                        Activate
                                    </button>
                                )}
                                {isSuperAdmin && (
                                    <button onClick={() => triggerDeleteUser(user.id)} className="h-6 px-2 rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 text-[10px]">
                                        Delete
                                    </button>
                                )}
                            </div>,
                        ]) || []}
                    />
                </div>
            )}

            {activeTab !== 'platform' && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5">
                    <AdminTable
                        columns={['Admin User', 'Role', 'Joined', 'Last Login', 'Actions']}
                        empty={`No ${activeTab} configured.`}
                        rows={adminAccounts.isLoading ? undefined : filteredAdmins.map((account: any) => [
                            <div key="a">
                                <p className="font-bold text-white text-xs">{account.name || 'Admin'}</p>
                                <p className="text-[10px] text-[#666666]">{account.email}</p>
                            </div>,
                            <StatusBadge key="r" status={account.role} />,
                            <span key="c" className="text-[#666666]">{formatDate(account.createdAt)}</span>,
                            <span key="l" className="text-[#666666]">{formatDate(account.lastLoginAt)}</span>,
                            <div key="act" className="flex items-center gap-1.5">
                                {isSuperAdmin && account.id !== currentAdminId && (
                                    <button onClick={() => triggerDeleteAdmin(account.id)} className="h-6 px-2 rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 text-[10px]">
                                        Delete
                                    </button>
                                )}
                            </div>,
                        ]) || []}
                    />
                </div>
            )}
        </div>
    );
}
