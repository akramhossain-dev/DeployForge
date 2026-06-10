'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Mail, MessageSquare, Send } from 'lucide-react';
import api, { ApiError } from '@/lib/api/client';
import { inputClassName } from '@/components/ui';
import { PublicAurora, SystemHero } from '@/components/system/PublicSystem';

const initialForm = {
    name: '',
    email: '',
    subject: '',
    message: '',
};

export default function ContactPage() {
    const [form, setForm] = useState(initialForm);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function submitContact(event: FormEvent) {
        event.preventDefault();
        setLoading(true);
        setSuccess(null);
        setError(null);

        try {
            const response = await api.post<{ success: true; message: string }>('/api/contact', form);
            setSuccess(response.message || 'Message received.');
            setForm(initialForm);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Unable to send this message right now.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <SystemHero
                eyebrow="Contact"
                title="Reach the DeployForge team."
                description="Send questions about accounts, security, integrations, infrastructure workflows, privacy, or operational support."
            />

            <section className="relative isolate border-y border-white/10 bg-white/[0.03] px-4 py-16 sm:px-6 lg:px-8">
                <PublicAurora />
                <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-lg border border-white/10 bg-slate-900/70 p-6 sm:p-7">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                            <Mail size={22} />
                        </div>
                        <h2 className="mt-6 text-3xl font-black tracking-tight text-white">Support for self-hosted delivery.</h2>
                        <p className="mt-4 text-base leading-7 text-slate-400">
                            Include the account email, affected repository or VPS name, and a clear description of what happened. Avoid sending passwords, private keys, tokens, or production secrets.
                        </p>
                        <div className="mt-6 grid gap-3">
                            {['Security and privacy requests', 'GitHub OAuth and repository sync issues', 'VPS, deployment, terminal, and monitoring support'].map((item) => (
                                <div key={item} className="rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm font-bold text-slate-300">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={submitContact} className="rounded-lg border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30 sm:p-7">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                                <MessageSquare size={22} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight text-white">Send a message</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-400">All fields are required and protected by validation plus rate limiting.</p>
                            </div>
                        </div>

                        <div className="mt-7 grid gap-4 sm:grid-cols-2">
                            <Field label="Name">
                                <input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`${inputClassName} h-12 px-4`} placeholder="Your name" autoComplete="name" />
                            </Field>
                            <Field label="Email">
                                <input required type="email" maxLength={160} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={`${inputClassName} h-12 px-4`} placeholder="you@example.com" autoComplete="email" />
                            </Field>
                        </div>

                        <div className="mt-4">
                            <Field label="Subject">
                                <input required minLength={4} maxLength={140} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className={`${inputClassName} h-12 px-4`} placeholder="What should we look at?" />
                            </Field>
                        </div>

                        <div className="mt-4">
                            <Field label="Message">
                                <textarea required minLength={20} maxLength={4000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className={`${inputClassName} min-h-40 resize-y px-4 py-3`} placeholder="Describe the request without sharing secrets." />
                            </Field>
                        </div>

                        {success ? (
                            <div className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
                                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={18} />
                                <span>{success}</span>
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-5 rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100">
                                {error}
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <><Send size={17} /> Submit Message <ArrowRight size={17} /></>}
                        </button>
                    </form>
                </div>
            </section>
        </main>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
            {children}
        </label>
    );
}
