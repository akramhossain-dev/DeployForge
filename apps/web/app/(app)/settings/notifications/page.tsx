'use client';

import { useState, useEffect } from 'react';
import { Bell, Save, Cpu, MemoryStick, HardDrive, Database, Mail, Monitor, Wifi, Loader2 } from 'lucide-react';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import { useAlertSettings, useUpdateAlertSettings } from '@/hooks/useNotifications';
import clsx from 'clsx';

export default function NotificationsPage() {
    const addToast = useToastStore((state) => state.addToast);
    const { data: alertSettings, isLoading: alertLoading } = useAlertSettings();
    const updateAlertSettings = useUpdateAlertSettings();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [emailDeployments, setEmailDeployments] = useState(true);
    const [emailSecurity, setEmailSecurity] = useState(true);
    const [emailNewsletter, setEmailNewsletter] = useState(true);

    const [cpuThreshold, setCpuThreshold] = useState(90);
    const [ramThreshold, setRamThreshold] = useState(90);
    const [diskThreshold, setDiskThreshold] = useState(85);
    const [swapThreshold, setSwapThreshold] = useState(80);

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
            } finally {
                setIsLoading(false);
            }
        };
        fetchPreferences();
    }, []);

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
            await api.patch('/profile/preferences', {
                emailDeployments,
                emailSecurity,
                emailNewsletter,
            });

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
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading alert thresholds...
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6 font-mono text-xs">
            {/* Alert Thresholds */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                <div className="border-b border-[#1F1F1F] pb-3">
                    <h3 className="font-bold text-white text-sm">Alert Thresholds</h3>
                    <p className="mt-0.5 text-xs text-[#A1A1A1]">Alert notifications trigger when server telemetry exceeds these percentages.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <ThresholdSlider label="CPU Usage Limit" value={cpuThreshold} onChange={setCpuThreshold} />
                    <ThresholdSlider label="RAM Memory Limit" value={ramThreshold} onChange={setRamThreshold} />
                    <ThresholdSlider label="Disk Storage Limit" value={diskThreshold} onChange={setDiskThreshold} />
                    <ThresholdSlider label="Swap Memory Limit" value={swapThreshold} onChange={setSwapThreshold} />
                </div>
            </div>

            {/* Notification Channels */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                <div className="border-b border-[#1F1F1F] pb-3">
                    <h3 className="font-bold text-white text-sm">Notification Delivery Channels</h3>
                </div>

                <div className="space-y-3">
                    <ToggleRow
                        title="Email Alert Delivery"
                        description="Receive email notifications for critical alerts like server offline status or failed deployments."
                        checked={emailAlerts}
                        onChange={setEmailAlerts}
                    />
                    <ToggleRow
                        title="Browser Push Notifications"
                        description="Display browser native notifications when important alerts occur."
                        checked={browserAlerts}
                        onChange={setBrowserAlerts}
                    />
                    <ToggleRow
                        title="Real-time WebSockets Feed"
                        description="Display live toast notifications and update the header notification bell in real-time."
                        checked={realtimeAlerts}
                        onChange={setRealtimeAlerts}
                    />
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>Save All Preferences</span>
                </button>
            </div>
        </form>
    );
}

function ThresholdSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <div className="rounded border border-[#1F1F1F] bg-[#000000] p-4 space-y-2">
            <div className="flex justify-between text-xs">
                <span className="text-[#666666] font-semibold uppercase">{label}</span>
                <span className="font-bold text-white">{value}%</span>
            </div>
            <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="w-full accent-white h-1.5 rounded bg-[#111111] cursor-pointer"
            />
        </div>
    );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center justify-between gap-4 rounded border border-[#1F1F1F] bg-[#000000] p-4 cursor-pointer">
            <div>
                <p className="font-bold text-white text-xs">{title}</p>
                <p className="text-[11px] text-[#A1A1A1] mt-0.5">{description}</p>
            </div>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 accent-white"
            />
        </label>
    );
}