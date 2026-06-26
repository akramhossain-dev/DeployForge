'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Github, Key, KeyRound, Mail, Save, Shield, User } from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import { Button, PageHeader, Panel, SkeletonBlock, inputClassName } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

function ReadonlyField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">{label} <span className="ml-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-slate-600">read-only</span></p>
            <div className="flex h-10 items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-sm text-slate-500">
                <span className="text-slate-600 shrink-0">{icon}</span>
                <span className="truncate">{value}</span>
            </div>
        </div>
    );
}

function getInitials(name: string, username: string) {
    const src = (name || username || 'U').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]?.length >= 2) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0]?.[0] || 'U').toUpperCase();
}

export default function ProfilePage() {
    const auth     = useAuthSession();
    const addToast = useToastStore(s => s.addToast);

    const [name,    setName]    = useState('');
    const [username, setUsername] = useState('');
    const [email,   setEmail]   = useState('');
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
            <div className="space-y-6">
                <SkeletonBlock className="h-12 max-w-sm" />
                <div className="grid gap-6 lg:grid-cols-3">
                    <SkeletonBlock className="h-60" />
                    <SkeletonBlock className="h-60 lg:col-span-2" />
                </div>
            </div>
        );
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { addToast({ title: 'Validation Error', description: 'Full name is required', severity: 'error' }); return; }
        setIsSaving(true);
        try {
            await api.patch('/profile', { name });
            addToast({ title: 'Saved', description: 'Profile updated successfully', severity: 'success' });
            await auth.refetch();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to update profile', severity: 'error' });
        } finally { setIsSaving(false); }
    };

    const gitHubAvatar   = auth.user?.githubAvatar;
    const gitHubUsername = auth.user?.githubUsername;
    const initials       = getInitials(name, username);

    return (
        <div className="space-y-6">
            <PageHeader title="My Profile" description="View and manage your public display name and account identity." />

            <div className="grid gap-6 lg:grid-cols-3">
                {/* ── Avatar card ── */}
                <Panel className="relative overflow-hidden flex flex-col items-center py-8 text-center">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-300/30 to-transparent" />

                    {/* Avatar */}
                    <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-white/[0.1] bg-slate-900 flex items-center justify-center shadow-xl">
                        {gitHubAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={gitHubAvatar} alt="GitHub Avatar" className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-3xl font-black text-slate-300">{initials}</span>
                        )}
                    </div>

                    {/* Name + handle */}
                    <p className="mt-4 font-black text-white text-lg">{name || 'Your Name'}</p>
                    {username && <p className="text-[11px] text-slate-500">@{username}</p>}

                    {/* GitHub badge */}
                    <div className="mt-3">
                        {gitHubAvatar ? (
                            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                                <Github size={10} /> GitHub avatar active
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-600">Connect GitHub to use your avatar</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="mt-6 w-full space-y-2 border-t border-white/[0.06] pt-5">
                        <Link href="/settings/security" className="block">
                            <Button variant="secondary" className="w-full h-9 text-xs">
                                <KeyRound size={13} /> Change Password
                            </Button>
                        </Link>
                        <Link href="/settings" className="block">
                            <Button variant="secondary" className="w-full h-9 text-xs">
                                <Shield size={13} /> Connected Accounts
                            </Button>
                        </Link>
                    </div>
                </Panel>

                {/* ── Info form ── */}
                <Panel className="lg:col-span-2">
                    <div className="mb-5 flex items-center gap-3 border-b border-white/[0.06] pb-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/8 text-cyan-200">
                            <User size={15} />
                        </div>
                        <div>
                            <h2 className="font-black text-white">Profile Information</h2>
                            <p className="text-[10px] text-slate-500 mt-0.5">Username and email can only be changed by an admin.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4">
                        {/* Editable: name */}
                        <label>
                            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</p>
                            <input
                                type="text" value={name} onChange={e => setName(e.target.value)}
                                autoComplete="name" placeholder="Your display name"
                                className={inputClassName}
                            />
                        </label>

                        {/* Read-only grid */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <ReadonlyField icon={<span className="text-xs">@</span>} label="Username" value={username || '—'} />
                            <ReadonlyField icon={<Mail size={13} />} label="Email Address" value={email || '—'} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <ReadonlyField icon={<Github size={13} />} label="GitHub Account" value={gitHubUsername ? `@${gitHubUsername}` : 'Not connected'} />
                            <ReadonlyField icon={<Key size={13} />}    label="Avatar Source"  value={gitHubAvatar ? 'GitHub Avatar' : 'Initials (no GitHub)'} />
                        </div>

                        {/* Meta timestamps */}
                        <div className="flex flex-wrap gap-5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] text-slate-600">
                            <span className="flex items-center gap-1.5">
                                <Calendar size={11} />
                                Joined: {auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleDateString() : '—'}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Key size={11} />
                                Last login: {auth.user?.lastLoginAt ? new Date(auth.user.lastLoginAt).toLocaleString() : '—'}
                            </span>
                        </div>

                        <div className="flex justify-end border-t border-white/[0.06] pt-4">
                            <Button type="submit" loading={isSaving}>
                                <Save size={14} /> Save Changes
                            </Button>
                        </div>
                    </form>
                </Panel>
            </div>
        </div>
    );
}
