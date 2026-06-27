'use client';

import { useState, useEffect } from 'react';
import { Bell, Save, Cpu, MemoryStick, HardDrive, Database, Mail, Monitor, Wifi } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { useAlertSettings, useUpdateAlertSettings } from '@/hooks/useNotifications';

export default function NotificationsPage() {
    const addToast = useToastStore((state) => state.addToast);
    const { data: alertSettings, isLoading: alertLoading } = useAlertSettings();
    const updateAlertSettings = useUpdateAlertSettings();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Legacy notification preferences (matches backend updatePreferencesSchema)
    const [emailDeployments, setEmailDeployments] = useState(true);
    const [emailSecurity, setEmailSecurity] = useState(true);
    const [emailNewsletter, setEmailNewsletter] = useState(true);

    // Alert thresholds
    const [cpuThreshold, setCpuThreshold] = useState(90);
    const [ramThreshold, setRamThreshold] = useState(90);
    const [diskThreshold, setDiskThreshold] = useState(85);
    const [swapThreshold, setSwapThreshold] = useState(80);

    // Notification channels
    const [emailAlerts, setEmailAlerts] = useState(true);
    const [browserAlerts, setBrowserAlerts] = useState(true);
    const [realtimeAlerts, setRealtimeAlerts] = useState(true);

    useEffect(() => {
        const fetchPreferences = async () => {
            setIsLoading(true);
            try {
                const response = await api.get<{ data: any }>('/profile/preferences');
                if (response.data) {
                    setEmailDeployments(response.data.emailDeployments ?? true);
                    setEmailSecurity(response.data.emailSecurity ?? true);
                    setEmailNewsletter(response.data.emailNewsletter ?? true);
                }
            } catch (err: any) {
                // Preferences may not exist yet, use defaults
            } finally {
                setIsLoading(false);
            }
        };
        fetchPreferences();
    }, []);

    // Sync alert settings when loaded
    useEffect(() => {
        if (alertSettings) {
            setCpuThreshold(alertSettings.cpuThreshold);
            setRamThreshold(alertSettings.ramThreshold);
            setDiskThreshold(alertSettings.diskThreshold);
            setSwapThreshold(alertSettings.swapThreshold);
            setEmailAlerts(alertSettings.emailAlerts);
            setBrowserAlerts(alertSettings.browserAlerts);
            setRealtimeAlerts(alertSettings.realtimeAlerts);
        }
    }, [alertSettings]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            // Save legacy preferences
            await api.patch('/profile/preferences', {
                emailDeployments,
                emailSecurity,
                emailNewsletter,
            });

            // Save alert settings
            await updateAlertSettings.mutateAsync({
                cpuThreshold,
                ramThreshold,
                diskThreshold,
                swapThreshold,
                emailAlerts,
                browserAlerts,
                realtimeAlerts,
            });

            addToast({ title: 'Settings Saved', description: 'All notification preferences updated successfully.', severity: 'success' });
        } catch (err: any) {
            addToast({ title: 'Error', description: err.message || 'Failed to save preferences', severity: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading || alertLoading) {
        return (
            <Panel>
                <div className="flex h-32 items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                </div>
            </Panel>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {/* Alert Thresholds */}
            <Panel>
                <div className="flex items-center gap-2 mb-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Cpu size={16} className="text-amber-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Alert Thresholds</h3>
                        <p className="text-[10px] text-slate-500">Alerts trigger when resource usage exceeds these values</p>
                    </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <ThresholdSlider
                        icon={<Cpu size={14} className="text-cyan-400" />}
                        label="CPU Usage"
                        value={cpuThreshold}
                        onChange={setCpuThreshold}
                        color="cyan"
                    />
                    <ThresholdSlider
                        icon={<MemoryStick size={14} className="text-violet-400" />}
                        label="RAM Usage"
                        value={ramThreshold}
                        onChange={setRamThreshold}
                        color="violet"
                    />
                    <ThresholdSlider
                        icon={<HardDrive size={14} className="text-amber-400" />}
                        label="Disk Usage"
                        value={diskThreshold}
                        onChange={setDiskThreshold}
                        color="amber"
                    />
                    <ThresholdSlider
                        icon={<Database size={14} className="text-rose-400" />}
                        label="Swap Usage"
                        value={swapThreshold}
                        onChange={setSwapThreshold}
                        color="rose"
                    />
                </div>
            </Panel>

            {/* Notification Channels */}
            <Panel>
                <div className="flex items-center gap-2 mb-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <Wifi size={16} className="text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Notification Channels</h3>
                        <p className="text-[10px] text-slate-500">Choose how you want to receive alerts</p>
                    </div>
                </div>

                <div className="mt-5 space-y-3">
                    <ToggleRow
                        icon={<Mail size={15} className="text-emerald-400" />}
                        title="Email Alerts"
                        description="Receive email notifications for critical alerts like server offline, high resource usage, and deployment failures."
                        checked={emailAlerts}
                        onChange={setEmailAlerts}
                    />
                    <ToggleRow
                        icon={<Monitor size={15} className="text-cyan-400" />}
                        title="Browser Notifications"
                        description="Show browser push notifications when important events occur."
                        checked={browserAlerts}
                        onChange={setBrowserAlerts}
                    />
                    <ToggleRow
                        icon={<Bell size={15} className="text-violet-400" />}
                        title="Real-time Dashboard Notifications"
                        description="Display toast notifications and update the notification bell in real-time via WebSocket."
                        checked={realtimeAlerts}
                        onChange={setRealtimeAlerts}
                    />
                </div>
            </Panel>

            {/* Event Preferences */}
            <Panel>
                <div className="flex items-center gap-2 mb-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <Bell size={16} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Event Preferences</h3>
                        <p className="text-[10px] text-slate-500">Choose which events you want to be notified about</p>
                    </div>
                </div>

                <div className="mt-5 space-y-3">
                    <PreferenceCheckbox
                        id="deployments"
                        title="Deployment Emails"
                        description="Receive email notifications when deployments succeed, fail, or trigger health checks."
                        checked={emailDeployments}
                        onChange={(e) => setEmailDeployments(e.target.checked)}
                    />
                    <PreferenceCheckbox
                        id="security"
                        title="Security Emails"
                        description="Get notified about login attempts, password changes, and security-related events."
                        checked={emailSecurity}
                        onChange={(e) => setEmailSecurity(e.target.checked)}
                    />
                    <PreferenceCheckbox
                        id="newsletter"
                        title="Newsletter & Updates"
                        description="Receive product updates, feature announcements, and platform news."
                        checked={emailNewsletter}
                        onChange={(e) => setEmailNewsletter(e.target.checked)}
                    />
                </div>
            </Panel>

            {/* Save */}
            <div className="flex justify-end">
                <Button type="submit" loading={isSaving} className="px-6">
                    <Save size={16} /> Save All Preferences
                </Button>
            </div>
        </form>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────

function ThresholdSlider({
    icon,
    label,
    value,
    onChange,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    onChange: (val: number) => void;
    color: string;
}) {
    const colorMap: Record<string, string> = {
        cyan: 'accent-cyan-500',
        violet: 'accent-violet-500',
        amber: 'accent-amber-500',
        rose: 'accent-rose-500',
    };

    return (
        <div className="rounded-lg border border-white/5 bg-slate-950/30 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-xs font-bold text-white">{label}</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-300">{value}%</span>
            </div>
            <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className={`w-full h-1.5 rounded-full bg-slate-700 cursor-pointer ${colorMap[color] || 'accent-cyan-500'}`}
            />
            <div className="flex justify-between mt-1">
                <span className="text-[9px] text-slate-600">10%</span>
                <span className="text-[9px] text-slate-600">100%</span>
            </div>
        </div>
    );
}

function ToggleRow({
    icon,
    title,
    description,
    checked,
    onChange,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    checked: boolean;
    onChange: (val: boolean) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-slate-950/20 p-4 cursor-pointer hover:bg-slate-950/40 transition-colors select-none">
            <div className="flex items-start gap-3">
                <div className="mt-0.5">{icon}</div>
                <div>
                    <p className="text-sm font-bold text-white">{title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>
                </div>
            </div>
            <div className="relative shrink-0">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-cyan-600 transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
            </div>
        </label>
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