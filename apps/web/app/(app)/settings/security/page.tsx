'use client';

import { useState, useEffect, useRef } from 'react';
import { KeyRound, Shield, RefreshCw, Monitor, Smartphone, Tablet, XCircle, LogOut, Loader2 } from 'lucide-react';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import type { AuditLog, UserSession as Session } from '@/lib/api/types';
import { INPUT_STYLE } from '@/components/ui';

export default function SecurityPage() {
    const addToast = useToastStore((state) => state.addToast);

    const currentPasswordRef = useRef<HTMLInputElement>(null);
    const newPasswordRef = useRef<HTMLInputElement>(null);
    const confirmPasswordRef = useRef<HTMLInputElement>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isRevoking, setIsRevoking] = useState<string | null>(null);
    const [isRevokingOthers, setIsRevokingOthers] = useState(false);
    const [isRevokingAll, setIsRevokingAll] = useState(false);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(true);

    const fetchSessions = async () => {
        setIsLoadingSessions(true);
        try {
            const response = await api.get<any>('/sessions');
            const sessionList = Array.isArray(response) ? response : response?.data || [];
            setSessions(sessionList);
        } catch (err: any) {
            console.error('Failed to load sessions:', err);
            addToast({ 
                title: 'Load Failure', 
                description: err.message || 'Failed to load active sessions.', 
                severity: 'error' 
            });
        } finally {
            setIsLoadingSessions(false);
        }
    };

    const fetchAuditLogs = async (showToast = false) => {
        setIsLoadingLogs(true);
        try {
            const response = await api.get<any>('/profile/audit-logs?limit=5');
            const logList = response?.logs || response?.data?.logs || [];
            setLogs(logList);
            if (showToast) {
                addToast({
                    title: 'Logs Updated',
                    description: 'Security log loaded successfully.',
                    severity: 'success'
                });
            }
        } catch (err: any) {
            console.error('Failed to load audit logs:', err);
            addToast({
                title: 'Load Failure',
                description: err.message || 'Failed to load security activity logs.',
                severity: 'error'
            });
        } finally {
            setIsLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        fetchAuditLogs(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const validatePasswordForm = (): boolean => {
        const errors: Record<string, string> = {};
        let isValid = true;

        if (!currentPassword) {
            errors.currentPassword = 'Current password is required';
            isValid = false;
        }

        if (!newPassword) {
            errors.newPassword = 'New password is required';
            isValid = false;
        } else if (newPassword.length < 8) {
            errors.newPassword = 'New password must be at least 8 characters long';
            isValid = false;
        }

        if (!confirmPassword) {
            errors.confirmPassword = 'Please confirm your new password';
            isValid = false;
        } else if (newPassword !== confirmPassword) {
            errors.confirmPassword = 'New passwords do not match';
            isValid = false;
        }

        setPasswordErrors(errors);

        if (!isValid) {
            if (errors.currentPassword) currentPasswordRef.current?.focus();
            else if (errors.newPassword) newPasswordRef.current?.focus();
            else if (errors.confirmPassword) confirmPasswordRef.current?.focus();
        }

        return isValid;
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validatePasswordForm()) return;

        setIsUpdating(true);
        try {
            await api.post('/profile/change-password', {
                currentPassword: currentPassword || undefined,
                newPassword,
            });
            addToast({ title: 'Success', description: 'Password changed successfully', severity: 'success' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordErrors({});
            await fetchAuditLogs(false);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to update password', severity: 'error' });
        } finally {
            setIsUpdating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        setIsRevoking(id);
        try {
            await api.delete(`/sessions/${id}`);
            addToast({ title: 'Success', description: 'Session revoked successfully', severity: 'success' });
            setSessions((prev) => prev.filter((s) => s.id !== id));
            await fetchAuditLogs(false);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to revoke session', severity: 'error' });
        } finally {
            setIsRevoking(null);
        }
    };

    const handleRevokeOthers = async () => {
        if (!confirm('Are you sure you want to log out all other sessions?')) return;
        setIsRevokingOthers(true);
        try {
            await api.delete('/sessions/logout-others');
            addToast({ title: 'Success', description: 'Other sessions revoked successfully', severity: 'success' });
            await fetchSessions();
            await fetchAuditLogs(false);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to revoke other sessions', severity: 'error' });
        } finally {
            setIsRevokingOthers(false);
        }
    };

    const handleRevokeAll = async () => {
        if (!confirm('Are you sure you want to log out of ALL active sessions, including the current one?')) return;
        setIsRevokingAll(true);
        try {
            await api.delete('/sessions/logout-all');
            addToast({ title: 'Success', description: 'All sessions logged out successfully', severity: 'success' });
            setTimeout(() => {
                window.location.assign('/');
            }, 1000);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to revoke all sessions', severity: 'error' });
            setIsRevokingAll(false);
        }
    };

    const getDeviceIcon = (device: string) => {
        const d = device.toLowerCase();
        if (d.includes('mobile') || d.includes('phone') || d.includes('ios') || d.includes('android')) {
            return <Smartphone size={14} className="text-white" />;
        }
        if (d.includes('tablet') || d.includes('ipad')) {
            return <Tablet size={14} className="text-white" />;
        }
        return <Monitor size={14} className="text-white" />;
    };

    return (
        <div className="space-y-6">

            {/* ── 1. Change Password Section ── */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                <div className="flex items-center gap-2 border-b border-[#1F1F1F] pb-3 mb-4">
                    <KeyRound size={15} className="text-white" />
                    <h3 className="text-sm font-semibold text-white">Change Account Password</h3>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                            Current Password
                        </label>
                        <input
                            ref={currentPasswordRef}
                            type="password"
                            value={currentPassword}
                            onChange={(e) => {
                                setCurrentPassword(e.target.value);
                                if (passwordErrors.currentPassword) {
                                    setPasswordErrors({ ...passwordErrors, currentPassword: '' });
                                }
                            }}
                            className={`${INPUT_STYLE} ${passwordErrors.currentPassword ? 'border-rose-900/80 focus:border-rose-700' : 'border-[#1F1F1F]'}`}
                            placeholder="••••••••"
                            disabled={isUpdating}
                        />
                        {passwordErrors.currentPassword && (
                            <p className="mt-1 text-xs font-mono text-rose-400">{passwordErrors.currentPassword}</p>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                New Password
                            </label>
                            <input
                                ref={newPasswordRef}
                                type="password"
                                value={newPassword}
                                onChange={(e) => {
                                    setNewPassword(e.target.value);
                                    if (passwordErrors.newPassword) {
                                        setPasswordErrors({ ...passwordErrors, newPassword: '' });
                                    }
                                }}
                                className={`${INPUT_STYLE} ${passwordErrors.newPassword ? 'border-rose-900/80 focus:border-rose-700' : 'border-[#1F1F1F]'}`}
                                placeholder="••••••••"
                                disabled={isUpdating}
                            />
                            {passwordErrors.newPassword && (
                                <p className="mt-1 text-xs font-mono text-rose-400">{passwordErrors.newPassword}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                Confirm New Password
                            </label>
                            <input
                                ref={confirmPasswordRef}
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (passwordErrors.confirmPassword) {
                                        setPasswordErrors({ ...passwordErrors, confirmPassword: '' });
                                    }
                                }}
                                className={`${INPUT_STYLE} ${passwordErrors.confirmPassword ? 'border-rose-900/80 focus:border-rose-700' : 'border-[#1F1F1F]'}`}
                                placeholder="••••••••"
                                disabled={isUpdating}
                            />
                            {passwordErrors.confirmPassword && (
                                <p className="mt-1 text-xs font-mono text-rose-400">{passwordErrors.confirmPassword}</p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isUpdating}
                            className="flex h-8 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-4 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                        >
                            {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <span>Update Password</span>}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── 2. Active Sessions Section ── */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <Shield size={15} className="text-white" />
                        <h3 className="text-sm font-semibold text-white">Active Sessions</h3>
                    </div>
                    {sessions.length > 1 && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleRevokeOthers}
                                disabled={isRevokingOthers}
                                className="flex h-7 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs font-mono text-[#A1A1A1] hover:text-white transition-colors disabled:opacity-50"
                            >
                                {isRevokingOthers ? <Loader2 size={12} className="animate-spin" /> : <span>Revoke Other Sessions</span>}
                            </button>
                            <button
                                type="button"
                                onClick={handleRevokeAll}
                                disabled={isRevokingAll}
                                className="flex h-7 items-center gap-1.5 rounded border border-rose-900/40 bg-rose-950/20 px-2.5 text-xs font-mono text-rose-300 hover:bg-rose-900/30 transition-colors disabled:opacity-50"
                            >
                                <LogOut size={12} />
                                <span>Revoke All Sessions</span>
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-xs text-[#A1A1A1] mb-4">
                    Devices currently signed into your DeployForge account. Revoking a session immediately invalidates its token.
                </p>

                {isLoadingSessions ? (
                    <div className="flex h-24 items-center justify-center font-mono text-xs text-[#666666]">
                        <Loader2 size={16} className="animate-spin mr-2" /> Loading active sessions...
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="py-6 text-center font-mono text-xs text-[#666666]">
                        No active sessions found.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={`flex flex-wrap items-center justify-between gap-3 rounded border p-3 font-mono text-xs ${
                                    session.isCurrent ? 'border-[#333333] bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#0A0A0A]">
                                        {getDeviceIcon(session.device)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-white">{session.browser}</span>
                                            <span className="text-[#666666]">on {session.os || session.device}</span>
                                            {session.isCurrent && (
                                                <span className="rounded border border-[#1F1F1F] bg-[#0A0A0A] px-1.5 py-0.5 text-[10px] text-emerald-400">
                                                    CURRENT SESSION
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#666666]">
                                            <span>IP: <span className="text-[#A1A1A1]">{session.ip}</span></span>
                                            <span>Active: {new Date(session.lastActivity).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {!session.isCurrent && (
                                    <button
                                        type="button"
                                        onClick={() => handleRevoke(session.id)}
                                        disabled={isRevoking === session.id}
                                        className="flex h-7 items-center gap-1 rounded border border-rose-900/40 bg-rose-950/20 px-2 text-[11px] font-mono text-rose-300 hover:bg-rose-900/40 disabled:opacity-50"
                                    >
                                        {isRevoking === session.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={13} />}
                                        <span>Revoke</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── 3. Recent Security Activity Section ── */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6">
                <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <Shield size={15} className="text-white" />
                        <h3 className="text-sm font-semibold text-white">Recent Security Activity</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchAuditLogs(true)}
                        disabled={isLoadingLogs}
                        className="flex h-7 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs font-mono text-[#A1A1A1] hover:text-white transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>

                <p className="text-xs text-[#A1A1A1] mb-4">
                    Preview of recent security audit events recorded for your account.
                </p>

                {isLoadingLogs ? (
                    <div className="flex h-24 items-center justify-center font-mono text-xs text-[#666666]">
                        <Loader2 size={16} className="animate-spin mr-2" /> Loading audit logs...
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-6 text-center font-mono text-xs text-[#666666]">
                        No recent security events recorded.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded border border-[#1F1F1F] bg-[#000000]">
                        <table className="w-full text-left font-mono text-xs">
                            <thead className="border-b border-[#1F1F1F] bg-[#111111] text-[#666666]">
                                <tr>
                                    <th className="px-3 py-2 font-semibold">EVENT</th>
                                    <th className="px-3 py-2 font-semibold">DETAILS</th>
                                    <th className="px-3 py-2 font-semibold">IP ADDRESS</th>
                                    <th className="px-3 py-2 font-semibold">TIMESTAMP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1F1F1F] text-[#A1A1A1]">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-[#111111]/50 transition-colors">
                                        <td className="px-3 py-2.5 font-semibold text-white">{log.action}</td>
                                        <td className="px-3 py-2.5 max-w-xs truncate">{log.details}</td>
                                        <td className="px-3 py-2.5">{log.ipAddress || '—'}</td>
                                        <td className="px-3 py-2.5 text-[#666666]">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}
