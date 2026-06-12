'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, User, Mail, Calendar, Key, Save } from 'lucide-react';
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
    const [isUploading, setIsUploading] = useState(false);
    const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            await api.patch('/profile', { name, username: username || undefined, email });
            addToast({ title: 'Success', description: 'Profile updated successfully', severity: 'success' });
            await auth.refetch();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to update profile', severity: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            addToast({ title: 'Invalid File Format', description: 'Supported formats: PNG, JPG, JPEG, WEBP', severity: 'error' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            addToast({ title: 'File Too Large', description: 'File size must be under 2MB', severity: 'error' });
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        setIsUploading(true);
        try {
            await api.post('/profile/avatar', formData);
            addToast({ title: 'Success', description: 'Profile photo updated successfully', severity: 'success' });
            await auth.refetch();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to upload photo', severity: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteAvatar = async () => {
        if (!confirm('Are you sure you want to remove your profile photo?')) return;
        
        setIsDeletingAvatar(true);
        try {
            await api.delete('/profile/avatar');
            addToast({ title: 'Success', description: 'Profile photo removed successfully', severity: 'success' });
            await auth.refetch();
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to remove photo', severity: 'error' });
        } finally {
            setIsDeletingAvatar(false);
        }
    };

    // Construct profile image URL
    let avatarSrc = '';
    if (auth.user?.avatarUrl) {
        if (auth.user.avatarUrl.startsWith('http')) {
            avatarSrc = auth.user.avatarUrl;
        } else {
            avatarSrc = `${api.baseUrl}/profile/avatar/image?t=${new Date().getTime()}`;
        }
    } else if (auth.user?.githubAvatar) {
        avatarSrc = auth.user.githubAvatar;
    } else if (auth.user?.googleAvatar) {
        avatarSrc = auth.user.googleAvatar;
    }

    return (
        <div className="space-y-6">
            <PageHeader title="My Profile" description="View and manage your public profile information." />

            <div className="grid gap-6 md:grid-cols-3">
                {/* Profile Photo Panel */}
                <Panel className="flex flex-col items-center justify-center p-6 text-center md:col-span-1">
                    <h3 className="mb-4 font-bold text-white">Profile Photo</h3>
                    
                    <div className="relative group">
                        <div className="h-32 w-32 overflow-hidden rounded-full border-2 border-cyan-500 bg-slate-900 flex items-center justify-center text-slate-400">
                            {avatarSrc ? (
                                <img src={avatarSrc} alt="Avatar" className="h-full w-full object-cover" />
                            ) : (
                                <User size={48} className="text-slate-600" />
                            )}
                        </div>
                        
                        <button
                            type="button"
                            onClick={triggerFileInput}
                            disabled={isUploading}
                            className="absolute bottom-0 right-0 p-2 bg-cyan-600 text-white rounded-full hover:bg-cyan-500 transition-colors border-2 border-slate-950 disabled:opacity-50"
                        >
                            <Camera size={16} />
                        </button>
                        
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            className="hidden"
                        />
                    </div>

                    <p className="mt-4 text-xs text-slate-400">
                        Supports PNG, JPG, JPEG, WEBP. Max 2MB.
                    </p>

                    <div className="mt-4 flex gap-2 w-full">
                        <Button 
                            variant="secondary" 
                            className="w-full text-xs" 
                            onClick={triggerFileInput} 
                            loading={isUploading}
                        >
                            Change Photo
                        </Button>
                        {auth.user?.avatarUrl && (
                            <Button 
                                variant="danger" 
                                className="p-2" 
                                onClick={handleDeleteAvatar} 
                                loading={isDeletingAvatar}
                            >
                                <Trash2 size={14} />
                            </Button>
                        )}
                    </div>
                </Panel>

                {/* Profile Information Panel */}
                <Panel className="md:col-span-2">
                    <h3 className="mb-4 font-bold text-white">Profile Information</h3>
                    
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
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
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1">Username</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-slate-500">@</span>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full bg-slate-950 border border-white/10 rounded-md py-2 pl-9 pr-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                        placeholder="username"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1">Email Address</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-500"><Mail size={16} /></span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-950 border border-white/10 rounded-md py-2 pl-9 pr-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                    placeholder="email@example.com"
                                />
                            </div>
                            {!auth.user?.isVerified && (
                                <p className="mt-1 text-xs text-amber-400">
                                    Your email address is unverified. Go to settings to send a verification link.
                                </p>
                            )}
                        </div>

                        <div className="pt-4 border-t border-white/5 grid gap-4 sm:grid-cols-2 text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-slate-500" />
                                <span>Joined: {auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Key size={14} className="text-slate-500" />
                                <span>Last Login: {auth.user?.lastLoginAt ? new Date(auth.user.lastLoginAt).toLocaleString() : 'N/A'}</span>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button type="submit" loading={isSaving}>
                                <Save size={16} /> Save Changes
                            </Button>
                        </div>
                    </form>
                </Panel>
            </div>
        </div>
    );
}
