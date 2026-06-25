'use client';

import { useState, useEffect } from 'react';
import { Bell, Save } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';

export default function NotificationsPage() {
    const addToast = useToastStore((state) => state.addToast);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [deployNotifications, setDeployNotifications] = useState(true);
    const [buildNotifications, setBuildNotifications] = useState(true);
    const [domainNotifications, setDomainNotifications] = useState(true);
    const [sslNotifications, setSslNotifications] = useState(true);

    useEffect(() => {
        const fetchPreferences = async () => {
            setIsLoading(true);
            try {
                const response = await api.get<{ data: any }>('/profile/preferences');
                if (response.data) {
                    setDeployNotifications(response.data.deployNotifications);
                    setBuildNotifications(response.data.buildNotifications);
                    setDomainNotifications(response.data.domainNotifications);
                    setSslNotifications(response.data.sslNotifications);
                }
            } catch (err: any) {
                addToast({ title: 'Error', description: err.message || 'Failed to load preferences', severity: 'error' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchPreferences();
    }, [addToast]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await api.patch('/profile/preferences', {
                deployNotifications,
                buildNotifications,
                domainNotifications,
                sslNotifications,
            });
            addToast({ title: 'Success', description: 'Notification preferences saved successfully', severity: 'success' });
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to save preferences', severity: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <Panel>
                <div className="flex h-32 items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                </div>
            </Panel>
        );
    }

    return (
        <div className="space-y-6">
            <Panel>
                <div className="flex items-center gap-2 mb-4">
                    <Bell className="text-cyan-400" size={18} />
                    <h3 className="font-bold text-white">Notification Preferences</h3>
                </div>

                <p className="text-xs text-slate-400 mb-6">
                    Choose which notifications you would like to receive. Note that critical system alerts and billing notices cannot be disabled.
                </p>

                <form onSubmit={handleSave} className="space-y-6">
                    <div className="space-y-4">
                        <PreferenceCheckbox
                            id="deploy"
                            title="Deployment Notifications"
                            description="Receive emails when your deployments succeed, fail, or trigger health checks."
                            checked={deployNotifications}
                            onChange={(e) => setDeployNotifications(e.target.checked)}
                        />
                        <PreferenceCheckbox
                            id="build"
                            title="Build Notifications"
                            description="Get notified if compilation, static checks, or dependency builds break."
                            checked={buildNotifications}
                            onChange={(e) => setBuildNotifications(e.target.checked)}
                        />
                        <PreferenceCheckbox
                            id="domain"
                            title="Domain Notifications"
                            description="Receive notices when domain registrations, routing tests, or custom paths fail."
                            checked={domainNotifications}
                            onChange={(e) => setDomainNotifications(e.target.checked)}
                        />
                        <PreferenceCheckbox
                            id="ssl"
                            title="SSL Notifications"
                            description="Get warnings about SSL generation delays, certificate renewals, or issues."
                            checked={sslNotifications}
                            onChange={(e) => setSslNotifications(e.target.checked)}
                        />
                    </div>

                    <div className="flex justify-end pt-4 border-t border-white/5">
                        <Button type="submit" loading={isSaving}>
                            <Save size={16} /> Save Preferences
                        </Button>
                    </div>
                </form>
            </Panel>
        </div>
    );
}

interface PreferenceCheckboxProps {
    id: string;
    title: string;
    description: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function PreferenceCheckbox({ id, title, description, checked, onChange }: PreferenceCheckboxProps) {
    return (
        <label htmlFor={id} className="flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-slate-950/20 hover:bg-slate-950/50 cursor-pointer transition-all select-none">
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className="mt-1 h-4 w-4 rounded border-white/10 bg-slate-950 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-950 accent-cyan-500"
            />
            <div>
                <p className="font-bold text-sm text-white">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            </div>
        </label>
    );
}
