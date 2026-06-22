'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { User, Mail, Calendar, Key, Save, Github } from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { Button, Panel, PageHeader } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

export default function ProfilePage() {
    const auth = useAuthSession();
    const addToast = useToastStore((state) => state.addToast);
    
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (auth.user) {
            setName(auth.user.name || '');
            setUsername(auth.user.username || '');
            setEmail(auth.user.email || '');
        }
    }, [auth.user]);

    if (auth.isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            </div>
        );
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            addToast({ title: 'Validation Error', description: 'Full name is required', severity: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            await api.patch('/profile', { name });
            addToast({ title: 'Success', description: 'Profile updated successfully', severity: 'success' });
            await auth.refetch();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to update profile', severity: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Helper to generate name initials
    const getInitials = () => {
        const displayName = (name || username || 'User').trim();
        const parts = displayName.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        if (parts.length === 1) {
            const word = parts[0];
            if (word.length >= 2) {
                return word.substring(0, 2).toUpperCase();
            }
            return word.charAt(0).toUpperCase();
        }
        return 'DF';
    };

    const gitHubUsername = auth.user?.githubUsername || 'Not connected';
    const gitHubAvatar = auth.user?.githubAvatar;

    return (
        <div className="space-y-6">
            <PageHeader title="My Profile" description="View and manage your public profile information." />

            <div className="grid gap-6 md:grid-cols-3">
                {/* Profile Photo Panel */}
                <Panel className="flex flex-col items-center justify-center p-6 text-center md:col-span-1">
                    <h3 className="mb-4 font-bold text-white">Profile Picture</h3>
                    
                    <div className="relative group mb-6">
                        <div className="h-32 w-32 overflow-hidden rounded-full border-2 border-cyan-500 bg-slate-900 flex items-center justify-center font-bold text-4xl text-cyan-400 select-none">
                            {gitHubAvatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={gitHubAvatar} alt="GitHub Avatar" className="h-full w-full object-cover" />
                            ) : (
                                getInitials()
                            )}
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 mb-6">
                        {gitHubAvatar ? (
                            <p className="text-emerald-400 font-semibold">Using active GitHub profile avatar</p>
                        ) : (
                            <p>Connect your GitHub account in settings to display your GitHub avatar</p>
                        )}
                    </div>

                    <div className="w-full pt-4 border-t border-white/5">
                        <Link href="/settings/security" className="block w-full">
                            <Button variant="secondary" className="w-full text-xs">
                                <Key size={14} className="mr-1.5" /> Change Password
                            </Button>
                        </Link>
                    </div>
                </Panel>

                {/* Profile Information Panel */}
                <Panel className="md:col-span-2">
                    <h3 className="mb-4 font-bold text-white">Profile Information</h3>
                    
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1">Full Name</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-500"><User size={16} /></span>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-950 border border-white/10 rounded-md py-2 pl-9 pr-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                    placeholder="Full Name"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-slate-500 mb-1">Username (Read-Only)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-slate-600">@</span>
                                    <input
                                        type="text"
                                        value={username}
                                        readOnly
                                        disabled
                                        className="w-full bg-slate-950/50 border border-white/5 rounded-md py-2 pl-9 pr-3 text-slate-500 cursor-not-allowed text-sm select-none"
                                        placeholder="username"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-500 mb-1">Email Address (Read-Only)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-slate-600"><Mail size={16} /></span>
                                    <input
                                        type="email"
                                        value={email}
                                        readOnly
                                        disabled
                                        className="w-full bg-slate-950/50 border border-white/5 rounded-md py-2 pl-9 pr-3 text-slate-500 cursor-not-allowed text-sm select-none"
                                        placeholder="email@example.com"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 pt-2">
                            <div>
                                <label className="block text-sm font-semibold text-slate-500 mb-1">GitHub Account (Read-Only)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-slate-600"><Github size={16} /></span>
                                    <input
                                        type="text"
                                        value={gitHubUsername}
                                        readOnly
                                        disabled
                                        className="w-full bg-slate-950/50 border border-white/5 rounded-md py-2 pl-9 pr-3 text-slate-500 cursor-not-allowed text-sm select-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-500 mb-1">GitHub Avatar URL (Read-Only)</label>
                                <input
                                    type="text"
                                    value={gitHubAvatar || 'No Avatar connected'}
                                    readOnly
                                    disabled
                                    className="w-full bg-slate-950/50 border border-white/5 rounded-md py-2 px-3 text-slate-500 cursor-not-allowed text-sm select-none truncate"
                                />
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/5 grid gap-4 sm:grid-cols-2 text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-slate-500" />
                                <span>Account Created Date: {auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Key size={14} className="text-slate-500" />
                                <span>Last Login: {auth.user?.lastLoginAt ? new Date(auth.user.lastLoginAt).toLocaleString() : 'N/A'}</span>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button type="submit" loading={isSaving}>
                                <Save size={16} className="mr-1.5" /> Save Changes
                            </Button>
                        </div>
                    </form>
                </Panel>
            </div>
        </div>
    );
}
