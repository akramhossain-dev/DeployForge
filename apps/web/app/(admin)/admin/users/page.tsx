'use client';

import { Search, Shield, Trash2, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState, PageHeader, PasswordInput, inputClassName } from '@/components/ui';
import { AdminTable, Button, Panel, StatusBadge, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAction, useAdminAccounts, useAdminMe, useAdminUsers } from '@/hooks/useDeployForgeData';

export default function AdminUsersPage() {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [activeTab, setActiveTab] = useState<'platform' | 'admins' | 'moderators'>('platform');

    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createRole, setCreateRole] = useState<'ADMIN' | 'MODERATOR'>('ADMIN');
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');

    const params = useMemo(() => ({ search, status }), [search, status]);

    const me = useAdminMe();
    const platformUsers = useAdminUsers(params);
    const adminAccounts = useAdminAccounts();
    const action = useAdminAction();

    const isSuperAdmin = me.data?.data?.role === 'SUPER_ADMIN';
    const currentAdminId = me.data?.data?.id;

    const filteredAdmins = useMemo(() => {
        if (!adminAccounts.data) return [];
        const accounts = adminAccounts.data;
        if (activeTab === 'admins') {
            return accounts.filter((a) => a.role === 'ADMIN' || a.role === 'SUPER_ADMIN');
        }
        if (activeTab === 'moderators') {
            return accounts.filter((a) => a.role === 'MODERATOR');
        }
        return [];
    }, [adminAccounts.data, activeTab]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError('');
        setCreateSuccess('');

        if (!createName || !createEmail || !createPassword) {
            setCreateError('All fields are required.');
            return;
        }

        if (createPassword.length < 6) {
            setCreateError('Password must be at least 6 characters.');
            return;
        }

        action.mutate(
            {
                method: 'post',
                path: '/admin/create-user',
                body: {
                    name: createName,
                    email: createEmail,
                    password: createPassword,
                    role: createRole,
                },
            },
            {
                onSuccess: () => {
                    setCreateSuccess(`${createRole === 'ADMIN' ? 'Admin' : 'Moderator'} user created successfully.`);
                    setCreateName('');
                    setCreateEmail('');
                    setCreatePassword('');
                },
                onError: (err: any) => {
                    setCreateError(err?.response?.data?.message || err?.message || 'Failed to create user.');
                },
            }
        );
    };

    const handleRoleChange = (userId: string, newRole: 'ADMIN' | 'MODERATOR' | 'USER') => {
        action.mutate({
            method: 'patch',
            path: `/admin/users/${userId}/role`,
            body: { role: newRole },
        });
    };

    const handleStatusChange = (userId: string, newStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') => {
        action.mutate({
            method: 'patch',
            path: `/admin/platform-users/${userId}/status`,
            body: { status: newStatus },
        });
    };

    const handleDeleteAdmin = (adminId: string) => {
        if (confirm('Are you sure you want to delete this administrator/moderator account?')) {
            action.mutate({
                method: 'delete',
                path: `/admin/users/${adminId}`,
            });
        }
    };

    const handleDeletePlatformUser = (userId: string) => {
        if (confirm('Are you sure you want to delete this platform user? This will also remove all associated deployments and resources.')) {
            action.mutate({
                method: 'delete',
                path: `/admin/platform-users/${userId}`,
            });
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="User Management" description="Manage platform developers, moderators, administrators, and configure system access roles." />

            {}
            {platformUsers.isError && <ErrorState message={(platformUsers.error as Error)?.message} onRetry={() => platformUsers.refetch()} />}
            {adminAccounts.isError && <ErrorState message={(adminAccounts.error as Error)?.message} onRetry={() => adminAccounts.refetch()} />}
            {action.isError && <ErrorState title="Admin Action Failed" message={(action.error as Error)?.message} />}

            {}
            {isSuperAdmin && (
                <Panel className="border-cyan-500/20 bg-cyan-950/5">
                    <div className="flex items-center gap-2 mb-4">
                        <UserPlus className="text-cyan-300" size={18} />
                        <h3 className="font-black text-white text-base">Provision Admin or Moderator</h3>
                    </div>
                    <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Full Name</label>
                            <input
                                type="text"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                placeholder="E.g. Jane Doe"
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Email Address</label>
                            <input
                                type="email"
                                value={createEmail}
                                onChange={(e) => setCreateEmail(e.target.value)}
                                placeholder="jane@example.com"
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">Password (Min 6 chars)</label>
                            <PasswordInput
                                value={createPassword}
                                onChange={(e) => setCreatePassword(e.target.value)}
                                placeholder="Secure password"
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-400 mb-1">System Role</label>
                                <select
                                    value={createRole}
                                    onChange={(e) => setCreateRole(e.target.value as 'ADMIN' | 'MODERATOR')}
                                    className={inputClassName}
                                >
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="MODERATOR">MODERATOR</option>
                                </select>
                            </div>
                            <Button type="submit" loading={action.isPending} className="h-10 px-6">
                                Provision
                            </Button>
                        </div>
                    </form>
                    {createError && <p className="mt-2 text-xs font-bold text-rose-400">{createError}</p>}
                    {createSuccess && <p className="mt-2 text-xs font-bold text-emerald-400">{createSuccess}</p>}
                </Panel>
            )}

            {}
            <div className="flex border-b border-white/10 bg-slate-950/20 p-1 rounded-lg">
                <button
                    onClick={() => setActiveTab('platform')}
                    className={`flex-1 py-2 text-sm font-black rounded-md transition-all ${
                        activeTab === 'platform' ? 'bg-white/[0.08] text-white border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    Platform Users ({platformUsers.data?.length || 0})
                </button>
                <button
                    onClick={() => setActiveTab('admins')}
                    className={`flex-1 py-2 text-sm font-black rounded-md transition-all ${
                        activeTab === 'admins' ? 'bg-white/[0.08] text-white border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    Administrators ({adminAccounts.data?.filter(a => a.role === 'ADMIN' || a.role === 'SUPER_ADMIN').length || 0})
                </button>
                <button
                    onClick={() => setActiveTab('moderators')}
                    className={`flex-1 py-2 text-sm font-black rounded-md transition-all ${
                        activeTab === 'moderators' ? 'bg-white/[0.08] text-white border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    Moderators ({adminAccounts.data?.filter(a => a.role === 'MODERATOR').length || 0})
                </button>
            </div>

            {}
            {activeTab === 'platform' && (
                <div className="space-y-4">
                    <Panel>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                            <label className={`${inputClassName} flex h-10 items-center gap-2 text-slate-400`}>
                                <Search size={16} />
                                <input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search platform users"
                                    className="w-full bg-transparent text-slate-100 outline-none"
                                />
                            </label>
                            <select
                                value={status}
                                onChange={(event) => setStatus(event.target.value)}
                                className={inputClassName}
                            >
                                <option value="">All statuses</option>
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="SUSPENDED">SUSPENDED</option>
                                <option value="DISABLED">DISABLED</option>
                            </select>
                        </div>
                    </Panel>

                    <Panel>
                        <AdminTable
                            columns={['User', 'Role', 'Status', 'Resources', 'GitHub', 'Joined', 'Actions']}
                            empty="No users match the search filters."
                            rows={
                                platformUsers.isLoading
                                    ? undefined
                                    : platformUsers.data?.map((user) => [
                                          <div key="user">
                                              <p className="font-bold text-white">{user.name || 'Unnamed user'}</p>
                                              <p className="text-xs text-slate-500">{user.email}</p>
                                          </div>,
                                          <StatusBadge key="role" status={user.role || 'USER'} />,
                                          <StatusBadge key="status" status={user.status} />,
                                          <span key="resources">
                                              {user._count?.deployments || 0} deployments / {user._count?.vps || 0} VPS
                                          </span>,
                                          <span key="github">
                                              {user.githubAccount ? `@${user.githubAccount.username}` : 'Not connected'}
                                          </span>,
                                          <span key="joined">{formatDate(user.createdAt)}</span>,
                                          <div key="actions" className="flex flex-wrap gap-2">
                                              {}
                                              {user.status === 'ACTIVE' ? (
                                                  <>
                                                      <Button
                                                          variant="secondary"
                                                          onClick={() => handleStatusChange(user.id, 'SUSPENDED')}
                                                      >
                                                          Suspend
                                                      </Button>
                                                      <Button
                                                          variant="secondary"
                                                          onClick={() => handleStatusChange(user.id, 'DISABLED')}
                                                      >
                                                          Disable
                                                      </Button>
                                                  </>
                                              ) : (
                                                  <Button
                                                      variant="secondary"
                                                      onClick={() => handleStatusChange(user.id, 'ACTIVE')}
                                                  >
                                                      Activate
                                                  </Button>
                                              )}

                                              {}
                                              {isSuperAdmin && (
                                                  <>
                                                      {user.role === 'USER' && (
                                                          <>
                                                              <Button
                                                                  variant="secondary"
                                                                  onClick={() => handleRoleChange(user.id, 'ADMIN')}
                                                              >
                                                                  Promote to Admin
                                                              </Button>
                                                              <Button
                                                                  variant="secondary"
                                                                  onClick={() => handleRoleChange(user.id, 'MODERATOR')}
                                                              >
                                                                  Promote to Moderator
                                                              </Button>
                                                          </>
                                                      )}
                                                      {(user.role === 'ADMIN' || user.role === 'MODERATOR') && (
                                                          <Button
                                                              variant="secondary"
                                                              onClick={() => handleRoleChange(user.id, 'USER')}
                                                          >
                                                              Demote to USER
                                                          </Button>
                                                      )}
                                                      <Button
                                                          variant="danger"
                                                          onClick={() => handleDeletePlatformUser(user.id)}
                                                      >
                                                          Delete
                                                      </Button>
                                                  </>
                                              )}
                                          </div>,
                                      ]) || []
                            }
                        />
                    </Panel>
                </div>
            )}

            {}
            {activeTab !== 'platform' && (
                <Panel>
                    <AdminTable
                        columns={['Name / Email', 'System Role', 'Created At', 'Last Login', 'Actions']}
                        empty={`No ${activeTab === 'admins' ? 'administrators' : 'moderators'} configured.`}
                        rows={
                            adminAccounts.isLoading
                                ? undefined
                                : filteredAdmins.map((account) => {
                                      const isSelf = account.id === currentAdminId;
                                      const canModify = isSuperAdmin && !isSelf && account.role !== 'SUPER_ADMIN';

                                      return [
                                          <div key="account">
                                              <p className="font-bold text-white">{account.name || 'Administrative Account'}</p>
                                              <p className="text-xs text-slate-500">{account.email}</p>
                                          </div>,
                                          <StatusBadge key="role" status={account.role} />,
                                          <span key="created">{formatDate(account.createdAt)}</span>,
                                          <span key="login">{formatDate(account.lastLoginAt)}</span>,
                                          <div key="actions" className="flex gap-2">
                                              {canModify ? (
                                                  <>
                                                      <Button
                                                          variant="secondary"
                                                          onClick={() => handleRoleChange(account.id, 'USER')}
                                                      >
                                                          <UserMinus size={14} /> Demote to USER
                                                      </Button>
                                                      <Button
                                                          variant="danger"
                                                          onClick={() => handleDeleteAdmin(account.id)}
                                                      >
                                                          <Trash2 size={14} /> Delete
                                                      </Button>
                                                  </>
                                              ) : (
                                                  <span className="text-xs text-slate-500 italic">
                                                      {isSelf ? 'Current Session' : 'Protected'}
                                                  </span>
                                              )}
                                          </div>,
                                      ];
                                  })
                        }
                    />
                </Panel>
            )}
        </div>
    );
}
