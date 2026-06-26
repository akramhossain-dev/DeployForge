'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, Loader2, Lock, Mail, MessageSquare, Send, Shield } from 'lucide-react';
import api, { ApiError } from '@/lib/api/client';
import { PublicAurora, SystemHero } from '@/components/system/PublicSystem';

const initialForm = { name: '', email: '', subject: '', message: '' };

const FIELD = 'w-full rounded-xl border border-white/[0.1] bg-slate-900/80 px-4 text-white outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-400/50 text-sm';

const topics = [
    { icon: Shield, label: 'Security & privacy requests' },
    { icon: Mail,   label: 'GitHub OAuth & repository sync issues' },
    { icon: Lock,   label: 'VPS, deployment, terminal & monitoring support' },
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
        <main className="overflow-hidden bg-slate-950 text-white">
            <SystemHero
                eyebrow="Contact"
                title="Reach the DeployForge team."
                description="Send questions about accounts, security, integrations, infrastructure workflows, privacy, or operational support."
            />

            <section className="relative isolate border-y border-white/[0.07] bg-white/[0.02] px-4 py-16 sm:px-6 lg:px-8">
                <PublicAurora />
                <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.85fr_1.15fr]">

                    {/* ── Left info panel ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-6 sm:p-7">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400/50 to-transparent" />
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                            <Mail size={22} />
                        </div>
                        <h2 className="mt-5 text-2xl font-black tracking-tight text-white">Support for self-hosted delivery.</h2>
                        <p className="mt-3 text-sm leading-6 text-slate-400">
                            Include the account email, affected repository or VPS name, and a clear description of what happened. Never send passwords, private keys, tokens, or production secrets.
                        </p>

                        <div className="mt-6 space-y-2.5">
                            {topics.map(t => {
                                const Icon = t.icon;
                                return (
                                    <div key={t.label} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                                        <Icon size={14} className="shrink-0 text-cyan-400" />
                                        <span className="text-sm font-semibold text-slate-300">{t.label}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Response notice */}
                        <div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-wider text-amber-400">Response time</p>
                            <p className="mt-0.5 text-xs text-slate-400">We typically respond within 1–2 business days.</p>
                        </div>
                    </div>

                    {/* ── Form panel ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.06] p-1 shadow-2xl backdrop-blur-xl">
                        <div className="rounded-xl border border-white/[0.08] bg-slate-950/90 p-6 sm:p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                                    <MessageSquare size={18} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black tracking-tight text-white">Send a message</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">All fields required · protected by rate limiting</p>
                                </div>
                            </div>

                            <form onSubmit={submitContact} className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Name">
                                        <input required minLength={2} maxLength={80} value={form.name} onChange={set('name')} className={`${FIELD} h-11`} placeholder="Your name" autoComplete="name" />
                                    </Field>
                                    <Field label="Email">
                                        <input required type="email" maxLength={160} value={form.email} onChange={set('email')} className={`${FIELD} h-11`} placeholder="you@example.com" autoComplete="email" />
                                    </Field>
                                </div>

                                <Field label="Subject">
                                    <input required minLength={4} maxLength={140} value={form.subject} onChange={set('subject')} className={`${FIELD} h-11`} placeholder="What should we look at?" />
                                </Field>

                                <Field label="Message">
                                    <textarea required minLength={20} maxLength={4000} value={form.message} onChange={set('message')} className={`${FIELD} min-h-36 resize-y py-3`} placeholder="Describe the request without sharing secrets." />
                                </Field>

                                {success && (
                                    <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm leading-6 text-emerald-100">
                                        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={16} />
                                        <span>{success}</span>
                                    </div>
                                )}
                                {error && (
                                    <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.07] p-4 text-sm text-rose-200">{error}</div>
                                )}

                                <button type="submit" disabled={loading}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 shadow-lg transition-all hover:scale-[1.01] hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-60">
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <><Send size={15} /> Submit Message</>}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
            {children}
        </label>
    );
}
