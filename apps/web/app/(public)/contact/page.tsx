'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Lock, Mail, MessageSquare, Send, Shield, BookOpen, Github } from 'lucide-react';
import api, { ApiError } from '@/lib/api/client';

const initialForm = { name: '', email: '', subject: '', message: '' };

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

const SUPPORT_TOPICS = [
    { icon: Shield, label: 'Security & Privacy Inquiries' },
    { icon: Github, label: 'GitHub OAuth & Repository Sync Issues' },
    { icon: Lock,   label: 'VPS, Terminal, Deployment & Monitoring' },
    { icon: BookOpen, label: 'Documentation & Architecture Questions' },
];

export default function ContactPage() {
    const [form, setForm] = useState(initialForm);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError]     = useState<string | null>(null);

    async function submitContact(event: FormEvent) {
        event.preventDefault();
        setLoading(true); setSuccess(null); setError(null);
        try {
            const response = await api.post<{ success: true; message: string }>('/contact', form);
            setSuccess(response.message || 'Message received.');
            setForm(initialForm);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Unable to send this message right now.');
        } finally { setLoading(false); }
    }

    const set = (key: keyof typeof initialForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }));

    return (
        <main className="min-h-screen bg-black text-white">

            {/* ── 1. Page Header ────────────────────────────────────────── */}
            <section className="border-b border-[#1F1F1F] px-4 pb-12 pt-14 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        {/* Eyebrow */}
                        <div className="inline-flex items-center gap-2 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] px-2.5 py-1 text-xs font-mono text-[#A1A1A1]">
                            <Mail size={13} className="text-white" />
                            <span>DEPLOYFORGE — SUPPORT</span>
                        </div>

                        {/* Title */}
                        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                            Contact Support
                        </h1>

                        {/* Description */}
                        <p className="mt-4 text-base leading-relaxed text-[#A1A1A1] sm:text-lg">
                            Send questions about account credentials, security inquiries, repository integrations, infrastructure workflows, or platform operations.
                        </p>
                    </div>
                </div>
            </section>

            {/* ── 2. Support Content & Form Grid ────────────────────────── */}
            <section className="border-b border-[#1F1F1F] bg-[#000000] px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-12 lg:items-start">

                    {/* Left Column: Support Information (5 cols) */}
                    <div className="space-y-6 lg:col-span-5">
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-4">
                            <h2 className="text-sm font-semibold text-white">Support Channels & Guidelines</h2>
                            <p className="text-xs leading-relaxed text-[#A1A1A1]">
                                For the fastest resolution, please include the account email, affected repository or VPS server name, and a clear description of the issue.
                            </p>
                            <div className="rounded border border-[#1F1F1F] bg-[#000000] p-3 text-xs font-mono text-[#666666]">
                                SECURITY NOTICE: Never include passwords, SSH private keys, secret tokens, or production API keys in support messages.
                            </div>
                        </div>

                        {/* Topics List */}
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-3 font-mono text-xs">
                            <p className="border-b border-[#1F1F1F] pb-2 font-semibold uppercase tracking-wider text-[#666666]">
                                COMMON SUPPORT AREAS
                            </p>
                            <div className="space-y-2">
                                {SUPPORT_TOPICS.map(topic => {
                                    const Icon = topic.icon;
                                    return (
                                        <div key={topic.label} className="flex items-center gap-2.5 rounded border border-[#1F1F1F] bg-[#000000] p-2.5 text-[#A1A1A1]">
                                            <Icon size={14} className="shrink-0 text-white" />
                                            <span>{topic.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Direct Link Options */}
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 font-mono text-xs space-y-3">
                            <p className="border-b border-[#1F1F1F] pb-2 font-semibold uppercase tracking-wider text-[#666666]">
                                SELF-SERVICE RESOURCES
                            </p>
                            <div className="flex flex-col gap-2">
                                <Link
                                    href="/docs"
                                    className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-2.5 text-[#A1A1A1] hover:text-white transition-colors"
                                >
                                    <span>Read Documentation</span>
                                    <BookOpen size={13} />
                                </Link>
                                <a
                                    href="https://github.com/akramhossain-dev/DeployForge/issues"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between rounded border border-[#1F1F1F] bg-[#000000] p-2.5 text-[#A1A1A1] hover:text-white transition-colors"
                                >
                                    <span>GitHub Issues</span>
                                    <Github size={13} />
                                </a>
                            </div>
                            <div className="pt-2 text-[11px] text-[#666666]">
                                Typical response time: 1–2 business days.
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Contact Form (7 cols) */}
                    <div className="lg:col-span-7">
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 lg:p-8">
                            <div className="border-b border-[#1F1F1F] pb-4 mb-6">
                                <h2 className="text-lg font-bold text-white">Send a Message</h2>
                                <p className="mt-1 text-xs text-[#666666]">
                                    All fields are required. Submissions are rate-limited.
                                </p>
                            </div>

                            <form onSubmit={submitContact} className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                            Your Name
                                        </label>
                                        <input
                                            required
                                            minLength={2}
                                            maxLength={80}
                                            value={form.name}
                                            onChange={set('name')}
                                            className={INPUT_STYLE}
                                            placeholder="Jane Doe"
                                            autoComplete="name"
                                            disabled={loading}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                            Email Address
                                        </label>
                                        <input
                                            required
                                            type="email"
                                            maxLength={160}
                                            value={form.email}
                                            onChange={set('email')}
                                            className={INPUT_STYLE}
                                            placeholder="jane@company.com"
                                            autoComplete="email"
                                            disabled={loading}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                        Subject
                                    </label>
                                    <input
                                        required
                                        minLength={4}
                                        maxLength={140}
                                        value={form.subject}
                                        onChange={set('subject')}
                                        className={INPUT_STYLE}
                                        placeholder="Brief summary of request"
                                        disabled={loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666] mb-1">
                                        Message
                                    </label>
                                    <textarea
                                        required
                                        minLength={20}
                                        maxLength={4000}
                                        value={form.message}
                                        onChange={set('message')}
                                        className={`${INPUT_STYLE} min-h-36 resize-y py-2.5`}
                                        placeholder="Describe your inquiry without sharing private keys or secrets."
                                        disabled={loading}
                                    />
                                </div>

                                {/* Feedback states */}
                                {success && (
                                    <div className="flex items-center gap-2.5 rounded border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs font-mono text-emerald-300">
                                        <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                                        <span>{success}</span>
                                    </div>
                                )}
                                {error && (
                                    <div className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-xs font-mono text-rose-300">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#1F1F1F] bg-white text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                                >
                                    {loading ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Send size={13} />
                                            <span>Send message</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>

                </div>
            </section>

        </main>
    );
}
