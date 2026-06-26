'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Panel, AppModal } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { useAuthStore } from '@/lib/store/useAuthStore';

export default function AccountSettingsPage() {
    const addToast = useToastStore((state) => state.addToast);
    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmText, setConfirmText] = useState('');

    const hasLocalPassword = Boolean(user?.connectedProviders?.local);

    const handleOpenModal = () => {
        setConfirmText('');
        setPasswordConfirm('');
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        if (!isDeleting) {
            setIsModalOpen(false);
        }
    };

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();

        if (confirmText !== 'delete my account') {
            addToast({ title: 'Validation Error', description: 'Please type the confirmation text exactly', severity: 'error' });
            return;
        }

        if (hasLocalPassword && !passwordConfirm) {
            addToast({ title: 'Validation Error', description: 'Password confirmation is required', severity: 'error' });
            return;
        }

        setIsDeleting(true);
        try {
            await api.delete('/profile', { passwordConfirm: hasLocalPassword ? passwordConfirm : 'oauth-password-bypass' });
            addToast({ title: 'Success', description: 'Your DeployForge account has been permanently deleted.', severity: 'success' });
            
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
                        <p className="mt-1 text-slate-400">
                            Deleting your DeployForge account will permanently remove all configuration access to your VPS servers, projects, deployments, and linked provider connections.
                        </p>
                    </div>

                    <div className="flex justify-start pt-2">
                        <Button 
                            onClick={handleOpenModal}
                            variant="danger"
                            className="bg-rose-600 hover:bg-rose-500 border-rose-700 text-white"
                        >
                            <Trash2 size={16} className="mr-1.5" /> Delete My Account
                        </Button>
                    </div>
                </div>
            </Panel>

            <AppModal
                open={isModalOpen}
                onClose={handleCloseModal}
                title="Confirm Account Deletion"
            >
                <form onSubmit={handleDeleteAccount} className="space-y-4">
                    <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                        <p className="font-bold text-sm mb-1.5">Are you absolutely sure?</p>
                        <p className="mb-2 leading-relaxed text-[11px] text-rose-300/80">
                            This action cannot be undone. Please confirm the following:
                        </p>
                        <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px] text-rose-300/80">
                            <li>All active login sessions will be instantly revoked.</li>
                            <li>Your profile data, preferences, and linked accounts will be deleted.</li>
                            <li>You will lose configuration access to all VPS servers and deployments.</li>
                        </ul>
                    </div>

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
                            required
                        />
                    </div>

                    {hasLocalPassword ? (
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
                                required
                            />
                        </div>
                    ) : (
                        <div className="text-[11px] text-slate-500 italic bg-white/5 p-2 rounded-md border border-white/5">
                            Note: Since you logged in via OAuth (GitHub/Google), password verification is not required.
                        </div>
                    )}

                    <div className="flex justify-end gap-2 border-t border-white/5 pt-4 mt-2">
                        <Button 
                            type="button" 
                            variant="secondary"
                            onClick={handleCloseModal}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            variant="danger"
                            className="bg-rose-600 hover:bg-rose-500 border-rose-700 text-white"
                            loading={isDeleting}
                            disabled={confirmText !== 'delete my account'}
                        >
                            <Trash2 size={16} className="mr-1.5" /> Confirm Delete
                        </Button>
                    </div>
                </form>
            </AppModal>
        </div>
    );
}
