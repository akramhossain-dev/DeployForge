'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { useAuthStore } from '@/lib/store/useAuthStore';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

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
        <div className="space-y-6 font-mono text-xs">
            {/* Danger Zone Container */}
            <div className="rounded-md border border-rose-900/40 bg-rose-950/20 p-6 space-y-4 text-rose-300">
                <div className="flex items-center gap-2 font-bold text-rose-400 text-sm border-b border-rose-900/40 pb-3">
                    <AlertTriangle size={16} />
                    <span>Danger Zone — Permanent Account Deletion</span>
                </div>

                <div className="space-y-2 text-xs">
                    <p className="font-bold text-white">Warning: Account deletion is permanent</p>
                    <p className="text-[#A1A1A1] leading-relaxed">
                        Deleting your account purges access to all registered VPS server nodes, projects, deployment histories, and OAuth connections.
                    </p>
                </div>

                <div className="pt-2 border-t border-rose-900/40 flex justify-start">
                    <button
                        onClick={handleOpenModal}
                        className="flex h-9 items-center gap-2 rounded-md border border-rose-900/60 bg-rose-950/60 px-4 font-semibold text-rose-300 hover:bg-rose-900/80 transition-colors"
                    >
                        <Trash2 size={14} />
                        <span>Delete My Account</span>
                    </button>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs">
                    <div className="w-full max-w-md rounded-md border border-rose-900/50 bg-[#0A0A0A] p-6 space-y-4">
                        <div className="border-b border-[#1F1F1F] pb-3">
                            <h3 className="text-sm font-bold text-white">Confirm Permanent Account Deletion</h3>
                            <p className="mt-1 text-[#666666]">This action cannot be reversed.</p>
                        </div>

                        <form onSubmit={handleDeleteAccount} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                    Type <span className="font-bold text-white">delete my account</span> to confirm:
                                </label>
                                <input
                                    type="text"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    className={INPUT_STYLE}
                                    placeholder="delete my account"
                                    required
                                />
                            </div>

                            {hasLocalPassword && (
                                <div>
                                    <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">
                                        Confirm Password:
                                    </label>
                                    <input
                                        type="password"
                                        value={passwordConfirm}
                                        onChange={(e) => setPasswordConfirm(e.target.value)}
                                        className={INPUT_STYLE}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-[#1F1F1F]">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={isDeleting}
                                    className="h-8 px-3 rounded border border-[#1F1F1F] bg-[#111111] text-white hover:bg-[#1A1A1A]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isDeleting || confirmText !== 'delete my account'}
                                    className="flex h-8 items-center gap-1.5 rounded border border-rose-900/60 bg-rose-950/60 px-4 font-semibold text-rose-300 hover:bg-rose-900/80 disabled:opacity-50"
                                >
                                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    <span>Confirm Delete</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
