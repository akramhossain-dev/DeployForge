'use client';

import { useState } from 'react';
import { ErrorState, PageHeader, inputClassName } from '@/components/ui';
import { AdminTable, Button, Panel, SmallMeta, formatDate } from '@/components/admin/AdminWidgets';
import { useAdminAccounts, useAdminAction, useAdminMe, useAdminSettings } from '@/hooks/useDeployForgeData';

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

    function createAdmin() {
        action.mutate({
            path: '/admin/create-user',
            body: { email, password, role, adminSecret },
        }, {
            onSuccess: () => {
                setEmail('');
                setPassword('');
                setAdminSecret('');
            },
        });
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Admin Settings" description="Current SMTP, GitHub OAuth, queue, security, and app configuration state." />
            {settings.isError ? <ErrorState message={(settings.error as Error)?.message} onRetry={() => settings.refetch()} /> : null}
            {action.isError ? <ErrorState title="Admin action failed" message={(action.error as Error)?.message} /> : null}
            {isSuperAdmin ? (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <Panel>
                        <h3 className="mb-4 font-bold text-white">Create Admin Account</h3>
                        <div className="space-y-3">
                            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" className={inputClassName} />
                            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Temporary password" className={inputClassName} />
                            <select value={role} onChange={(event) => setRole(event.target.value)} className={inputClassName}>
                                <option value="ADMIN">ADMIN</option>
                                <option value="MODERATOR">MODERATOR</option>
                            </select>
                            <input type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} placeholder="ADMIN_SECRET" className={inputClassName} />
                            <Button onClick={createAdmin} loading={action.isPending}>Create Admin</Button>
                        </div>
                    </Panel>
                    <Panel>
                        <h3 className="mb-4 font-bold text-white">Admin Accounts</h3>
                        <AdminTable
                            columns={['Email', 'Role', 'Last Login', 'Actions']}
                            empty="No admin accounts found."
                            rows={accounts.isLoading ? undefined : accounts.data?.map((admin) => [
                                <span key="email" className="font-bold text-white">{admin.email}</span>,
                                <select key="role" value={admin.role} onChange={(event) => action.mutate({ method: 'patch', path: `/admin/users/${admin.id}/role`, body: { role: event.target.value } })} className={`${inputClassName} h-9 py-1 text-xs`}>
                                    <option>SUPER_ADMIN</option>
                                    <option>ADMIN</option>
                                    <option>MODERATOR</option>
                                </select>,
                                <span key="login">{formatDate(admin.lastLoginAt)}</span>,
                                <Button key="delete" variant="danger" onClick={() => action.mutate({ method: 'delete', path: `/admin/users/${admin.id}` })}>Delete</Button>,
                            ]) || []}
                        />
                    </Panel>
                </div>
            ) : null}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Panel>
                    <h3 className="mb-4 font-bold text-white">SMTP</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <SmallMeta label="Host" value={data?.smtp.host || 'Unset'} />
                        <SmallMeta label="Port" value={data?.smtp.port || 'Unset'} />
                        <SmallMeta label="Secure" value={data?.smtp.secure ? 'Enabled' : 'Disabled'} />
                        <SmallMeta label="User" value={data?.smtp.userConfigured ? 'Configured' : 'Unset'} />
                    </div>
                </Panel>
                <Panel>
                    <h3 className="mb-4 font-bold text-white">GitHub OAuth</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SmallMeta label="Client ID" value={data?.github.clientIdConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="Client Secret" value={data?.github.clientSecretConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="Redirect URI" value={data?.github.redirectUri || 'Unset'} />
                    </div>
                </Panel>
                <Panel>
                    <h3 className="mb-4 font-bold text-white">Queue</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <SmallMeta label="Redis" value={data?.queue.redisConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="Attempts" value={data?.queue.maxAttempts || 0} />
                    </div>
                </Panel>
                <Panel>
                    <h3 className="mb-4 font-bold text-white">Security & App</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SmallMeta label="JWT Secret" value={data?.security.jwtConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="Admin JWT" value={data?.security.adminJwtConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="Admin Secret" value={data?.security.adminSecretConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="Encryption Key" value={data?.security.encryptionConfigured ? 'Configured' : 'Unset'} />
                        <SmallMeta label="App URL" value={data?.app.appUrl || 'Unset'} />
                        <SmallMeta label="Environment" value={data?.app.nodeEnv || 'development'} />
                    </div>
                </Panel>
            </div>
        </div>
    );
}
