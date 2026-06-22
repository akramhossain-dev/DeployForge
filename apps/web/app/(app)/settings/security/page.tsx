'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Shield, RefreshCw, Monitor, Smartphone, Tablet, XCircle, LogOut } from 'lucide-react';
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

interface Session {
    id: string;
    browser: string;
    device: string;
    os?: string;
    ip: string;
    lastActivity: string;
    createdAt: string;
    isCurrent?: boolean;
}

export default function SecurityPage() {
    const addToast = useToastStore((state) => state.addToast);

    // Password State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Sessions State
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isRevoking, setIsRevoking] = useState<string | null>(null);
    const [isRevokingOthers, setIsRevokingOthers] = useState(false);
    const [isRevokingAll, setIsRevokingAll] = useState(false);

    // Audit Log State
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
            addToast({ title: 'Success', description: 'Password changed successfully', severity: 'success' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
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
            return <Smartphone className="text-slate-400" size={16} />;
        }
        if (d.includes('tablet') || d.includes('ipad')) {
            return <Tablet className="text-slate-400" size={16} />;
        }
        return <Monitor className="text-slate-400" size={16} />;
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

            {/* Active Sessions Panel */}
            <Panel>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Shield className="text-cyan-400" size={18} />
                        <h3 className="font-bold text-white">Active Sessions</h3>
                    </div>
                    {sessions.length > 1 && (
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                className="text-xs"
                                onClick={handleRevokeOthers}
                                loading={isRevokingOthers}
                            >
                                Logout Other Sessions
                            </Button>
                            <Button
                                variant="danger"
                                className="text-xs bg-rose-500/10 border-rose-500/20 text-rose-300 hover:bg-rose-500/20"
                                onClick={handleRevokeAll}
                                loading={isRevokingAll}
                            >
                                <LogOut size={12} className="mr-1" /> Logout All Sessions
                            </Button>
                        </div>
                    )}
                </div>

                <p className="text-xs text-slate-400 mb-6">
                    This is a list of devices that have recently logged into your DeployForge account. Revoking a session will force that device to log in again.
                </p>

                {isLoadingSessions ? (
                    <div className="flex h-32 items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                        No active sessions.
                    </div>
                ) : (
                    <div className="space-y-3 mb-6">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={`flex items-center justify-between p-4 rounded-lg border bg-slate-950/50 hover:bg-slate-950/80 transition-colors ${session.isCurrent ? 'border-cyan-500/30' : 'border-white/5'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="mt-1 p-2 rounded-md bg-white/5 border border-white/10">
                                        {getDeviceIcon(session.device)}
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-white">{session.browser}</span>
                                            <span className="text-xs text-slate-400">on {session.os || session.device}</span>
                                            {session.isCurrent && (
                                                <span className="rounded bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400 uppercase">
                                                    Current Session
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                            <span>IP: <span className="font-mono text-slate-400">{session.ip}</span></span>
                                            <span>Last active: {new Date(session.lastActivity).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {!session.isCurrent && (
                                    <Button
                                        variant="danger"
                                        className="p-2 bg-rose-500/5 hover:bg-rose-500/15 border-rose-500/10 text-rose-400"
                                        onClick={() => handleRevoke(session.id)}
                                        loading={isRevoking === session.id}
                                    >
                                        <XCircle size={16} />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            {/* Audit Logs Preview Panel */}
            <Panel>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Shield className="text-cyan-400" size={18} />
                        <h3 className="font-bold text-white">Recent Security Activity</h3>
                    </div>
                    <Button variant="secondary" className="p-2 text-xs" onClick={() => fetchAuditLogs(true)} disabled={isLoadingLogs}>
                        <RefreshCw size={14} className={isLoadingLogs ? 'animate-spin' : ''} />
                    </Button>
                </div>

                <p className="text-xs text-slate-400 mb-4">
                    Preview of your account&apos;s recent security logs. Visit the Security Activity tab for full logs, filtering, and search.
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
