'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Monitor, Smartphone, Tablet, XCircle, LogOut } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

interface Session {
    id: string;
    browser: string;
    device: string;
    ip: string;
    lastActivity: string;
    createdAt: string;
}

export default function SessionsPage() {
    const addToast = useToastStore((state) => state.addToast);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRevoking, setIsRevoking] = useState<string | null>(null);
    const [isRevokingOthers, setIsRevokingOthers] = useState(false);
    const [isRevokingAll, setIsRevokingAll] = useState(false);

    const fetchSessions = async () => {
        setIsLoading(true);
        try {
            const response = await api.get<{ data: Session[] }>('/sessions');
            setSessions(response.data || []);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to load sessions', severity: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleRevoke = async (id: string) => {
        setIsRevoking(id);
        try {
            await api.delete(`/sessions/${id}`);
            addToast({ title: 'Success', description: 'Session revoked successfully', severity: 'success' });
            setSessions((prev) => prev.filter((s) => s.id !== id));
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
            await api.delete('/sessions');
            addToast({ title: 'Success', description: 'Other sessions revoked successfully', severity: 'success' });
            await fetchSessions();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to revoke sessions', severity: 'error' });
        } finally {
            setIsRevokingOthers(false);
        }
    };

    const handleRevokeAll = async () => {
        if (!confirm('Are you sure you want to log out of ALL active sessions, including the current one?')) return;
        setIsRevokingAll(true);
        try {
            await api.delete('/sessions?revokeAll=true');
            addToast({ title: 'Success', description: 'Logged out of all sessions successfully', severity: 'success' });
            // Wait brief moment and reload window to redirect to login
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
            <Panel>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <KeyRound className="text-cyan-400" size={18} />
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

                {isLoading ? (
                    <div className="flex h-32 items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                        No active sessions.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((session, index) => (
                            <div 
                                key={session.id} 
                                className={`flex items-center justify-between p-4 rounded-lg border bg-slate-950/50 hover:bg-slate-950/80 transition-colors ${
                                    index === 0 ? 'border-cyan-500/30' : 'border-white/5'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="mt-1 p-2 rounded-md bg-white/5 border border-white/10">
                                        {getDeviceIcon(session.device)}
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-white">{session.browser}</span>
                                            <span className="text-xs text-slate-400">on {session.device}</span>
                                            {index === 0 && (
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
                                
                                {index !== 0 && (
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
        </div>
    );
}
