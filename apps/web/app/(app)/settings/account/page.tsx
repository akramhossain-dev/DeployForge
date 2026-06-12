'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { useAuthStore } from '@/lib/store/useAuthStore';

export default function AccountSettingsPage() {
    const addToast = useToastStore((state) => state.addToast);
    const logout = useAuthStore((state) => state.logout);
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmText, setConfirmText] = useState('');

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();

        if (confirmText !== 'delete my account') {
            addToast({ title: 'Validation Error', description: 'Please type the confirmation text exactly', severity: 'error' });
            return;
        }

        if (!passwordConfirm) {
            addToast({ title: 'Validation Error', description: 'Password confirmation is required', severity: 'error' });
            return;
        }

        if (!confirm('Are you absolutely sure you want to delete your DeployForge account? This action cannot be undone.')) {
            return;
        }

        setIsDeleting(true);
        try {
            await api.delete('/profile', {
                body: JSON.stringify({ passwordConfirm })
            });
            addToast({ title: 'Success', description: 'Your DeployForge account has been permanently deleted.', severity: 'success' });
            
            // Clear auth store state and redirect to landing page
            logout();
            setTimeout(() => {
                window.location.assign('/');
            }, 1500);
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to delete account. Please check your password.', severity: 'error' });
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Panel className="border-rose-500/20 bg-rose-950/5">
                <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="text-rose-400" size={18} />
                    <h3 className="font-bold text-white">Danger Zone</h3>
                </div>

                <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                        <p className="font-bold text-sm mb-1">Warning: Account deletion is permanent</p>
                        <ul className="list-disc pl-4 space-y-1 mt-1">
                            <li>All active login sessions will be instantly revoked.</li>
                            <li>Your profile data, notification preferences, and avatars will be permanently removed.</li>
                            <li>You will lose configuration access to all VPS servers and deployments.</li>
                        </ul>
                    </div>

                    <form onSubmit={handleDeleteAccount} className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">
                                To confirm, type <span className="font-bold text-white">delete my account</span> below:
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                placeholder="delete my account"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">
                                Confirm with your password:
                            </label>
                            <input
                                type="password"
                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-cyan-500 text-sm"
                                placeholder="••••••••"
                            />
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button 
                                type="submit" 
                                variant="danger"
                                className="bg-rose-600 hover:bg-rose-500 border-rose-700 text-white"
                                loading={isDeleting}
                            >
                                <Trash2 size={16} className="mr-1.5" /> Delete Account
                            </Button>
                        </div>
                    </form>
                </div>
            </Panel>
        </div>
    );
}
