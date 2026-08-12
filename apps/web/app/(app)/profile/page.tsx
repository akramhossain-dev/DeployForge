'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Github, Key, KeyRound, Mail, Save, Shield, User, Loader2 } from 'lucide-react';
import { useAuthSession } from '@/hooks/useDeployForgeData';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import clsx from 'clsx';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function ReadonlyField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">{label}</label>
            <input type="text" value={value} readOnly disabled className={clsx(INPUT_STYLE, 'cursor-not-allowed opacity-50')} />
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
    const auth = useAuthSession();
    const addToast = useToastStore(s => s.addToast);

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
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading user profile...
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

    const gitHubAvatar = auth.user?.githubAvatar;
    const gitHubUsername = auth.user?.githubUsername;
    const initials = getInitials(name, username);

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        User Profile
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Manage user identity display name, linked GitHub account, and authentication preferences.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left: Avatar Card */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 flex flex-col items-center text-center space-y-4">
                    <div className="h-20 w-20 overflow-hidden rounded-full border border-[#1F1F1F] bg-[#000000] flex items-center justify-center">
                        {gitHubAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={gitHubAvatar} alt="GitHub Avatar" className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-2xl font-bold text-white">{initials}</span>
                        )}
                    </div>

                    <div>
                        <p className="font-bold text-white text-base">{name || 'User'}</p>
                        {username && <p className="text-xs text-[#A1A1A1]">@{username}</p>}
                    </div>

                    <div className="w-full pt-4 border-t border-[#1F1F1F] space-y-2">
                        <Link href="/settings/security" className="block">
                            <button className="w-full h-8 flex items-center justify-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] font-semibold text-white hover:bg-[#1A1A1A]">
                                <KeyRound size={13} /> Change Password
                            </button>
                        </Link>
                        <Link href="/settings" className="block">
                            <button className="w-full h-8 flex items-center justify-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] font-semibold text-white hover:bg-[#1A1A1A]">
                                <Shield size={13} /> Connected Accounts
                            </button>
                        </Link>
                    </div>
                </div>

                {/* Right: Editable Info Form */}
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4 lg:col-span-2">
                    <div className="border-b border-[#1F1F1F] pb-3">
                        <h2 className="font-bold text-white text-sm">Account Information</h2>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Display Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Your full display name"
                                className={INPUT_STYLE}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <ReadonlyField label="Username" value={username || '—'} />
                            <ReadonlyField label="Email Address" value={email || '—'} />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <ReadonlyField label="GitHub Account" value={gitHubUsername ? `@${gitHubUsername}` : 'Not connected'} />
                            <ReadonlyField label="Account Role" value={auth.user?.role || 'USER'} />
                        </div>

                        <div className="flex justify-end border-t border-[#1F1F1F] pt-4">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                <span>Save Changes</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
