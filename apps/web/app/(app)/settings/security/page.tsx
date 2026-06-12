'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Shield, RefreshCw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

interface AuditLog {
    id: string;
    action: string;
    details: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
}

export default function SecurityPage() {
    const addToast = useToastStore((state) => state.addToast);

    // Password State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Audit Log State
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(true);

    const fetchAuditLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const response = await api.get<{ data: AuditLog[] }>('/profile/audit-logs');
            setLogs(response.data || []);
        } catch (err: any) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchAuditLogs();
    }, []);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword.length < 8) {
            addToast({ title: 'Validation Error', description: 'New password must be at least 8 characters long', severity: 'error' });
            return;
        }

        if (newPassword !== confirmPassword) {
            addToast({ title: 'Validation Error', description: 'New passwords do not match', severity: 'error' });
            return;
        }

        setIsUpdating(true);
        try {
            await api.post('/profile/change-password', {
                currentPassword: currentPassword || undefined,
                newPassword,
            });
            addToast({ title: 'Success', description: 'Password updated successfully', severity: 'success' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            await fetchAuditLogs();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to update password', severity: 'error' });
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Change Password Panel */}
            <Panel>
                <div className="flex items-center gap-2 mb-4">
                    <KeyRound className="text-cyan-400" size={18} />
                    <h3 className="font-bold text-white">Change Password</h3>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Current Password</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                placeholder="••••••••"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Confirm New Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button type="submit" loading={isUpdating}>
                            Update Password
                        </Button>
                    </div>
                </form>
            </Panel>

            {/* Audit Logs Panel */}
            <Panel>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Shield className="text-cyan-400" size={18} />
                        <h3 className="font-bold text-white">Security Log</h3>
                    </div>
                    <Button variant="secondary" className="p-2 text-xs" onClick={fetchAuditLogs} disabled={isLoadingLogs}>
                        <RefreshCw size={14} className={isLoadingLogs ? 'animate-spin' : ''} />
                    </Button>
                </div>

                <p className="text-xs text-slate-400 mb-4">
                    This is a log of security events related to your account.
                </p>

                {isLoadingLogs ? (
                    <div className="flex h-32 items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                        No security logs recorded yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 text-slate-400">
                                    <th className="py-2 font-semibold">Event</th>
                                    <th className="py-2 font-semibold">Description</th>
                                    <th className="py-2 font-semibold">IP Address</th>
                                    <th className="py-2 font-semibold">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                        <td className="py-3 font-medium text-white">{log.action}</td>
                                        <td className="py-3 max-w-xs truncate">{log.details}</td>
                                        <td className="py-3 font-mono">{log.ipAddress || '—'}</td>
                                        <td className="py-3 text-slate-400">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </div>
    );
}
