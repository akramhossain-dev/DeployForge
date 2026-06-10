'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, inputClassName } from '@/components/ui';
import { useAuthStore } from '@/lib/store/useAuthStore';
import api from '@/lib/api/client';

type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export function TerminalPanel({ vpsId }: { vpsId?: string }) {
    const token = useAuthStore((state) => state.token);
    const [status, setStatus] = useState<TerminalStatus>('idle');
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('Select a VPS and connect to start a terminal session.\n');
    const socketRef = useRef<WebSocket | null>(null);
    const outputRef = useRef<HTMLPreElement | null>(null);

    const wsUrl = useMemo(() => {
        if (!vpsId || !token) return null;
        const base = api.baseUrl.replace(/^http/, 'ws');
        return `${base}/terminal/${vpsId}?token=${encodeURIComponent(token)}`;
    }, [token, vpsId]);

    useEffect(() => {
        outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
    }, [output]);

    useEffect(() => {
        return () => socketRef.current?.close();
    }, []);

    function connect() {
        if (!wsUrl) return;
        socketRef.current?.close();
        setStatus('connecting');
        setOutput((current) => `${current}\n[deployforge] connecting...\n`);

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => setStatus('connected');
        socket.onmessage = (event) => {
            const text = typeof event.data === 'string' ? event.data : '';
            setOutput((current) => `${current}${text}`);
        };
        socket.onerror = () => {
            setStatus('error');
            setOutput((current) => `${current}\n[deployforge] terminal connection failed.\n`);
        };
        socket.onclose = () => {
            setStatus((current) => (current === 'error' ? 'error' : 'closed'));
            setOutput((current) => `${current}\n[deployforge] session closed.\n`);
        };
    }

    function sendInput(event: FormEvent) {
        event.preventDefault();
        if (!input.trim() || socketRef.current?.readyState !== WebSocket.OPEN) return;
        socketRef.current.send(`${input}\n`);
        setInput('');
    }

    return (
        <Panel className="bg-slate-950/70">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-mono text-sm font-bold uppercase tracking-widest text-emerald-300">DeployForge TUI</p>
                    <p className="mt-1 text-xs text-slate-500">Status: {status}</p>
                </div>
                <Button variant="secondary" onClick={connect} disabled={!wsUrl || status === 'connecting'}>
                    {status === 'connected' ? 'Reconnect' : 'Connect'}
                </Button>
            </div>
            <pre ref={outputRef} className="terminal-scrollbar h-[520px] overflow-auto rounded-lg border border-white/10 bg-slate-950/90 p-4 font-mono text-xs leading-6 text-emerald-100">
                {output}
            </pre>
            <form onSubmit={sendInput} className="mt-4 flex gap-3">
                <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={status !== 'connected'}
                    className={`${inputClassName} h-11 min-w-0 flex-1 font-mono text-emerald-100`}
                    placeholder={status === 'connected' ? 'Type a command...' : 'Connect to enable input'}
                />
                <Button type="submit" disabled={status !== 'connected'}>Send</Button>
            </form>
        </Panel>
    );
}
