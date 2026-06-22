'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';
import { Button, Panel } from '@/components/ui';
import api from '@/lib/api/client';

type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

type TerminalEvent = {
    event?: 'terminal:connected' | 'terminal:closed' | 'terminal:error';
    sessionId?: string;
    stage?: string;
    message?: string;
    errorCode?: string;
};

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1500;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export function TerminalPanel({ vpsId }: { vpsId?: string }) {
    const [status, setStatus] = useState<TerminalStatus>('idle');
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const dataDisposableRef = useRef<IDisposable | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const manualCloseRef = useRef(false);
    const terminalReadyRef = useRef(false);
    const shouldReconnectRef = useRef(true);

    const wsBaseUrl = useMemo(() => {
        if (!vpsId) return null;
        return `${api.baseUrl.replace(/^http/, 'ws')}/terminal/${vpsId}`;
    }, [vpsId]);

    useEffect(() => {
        if (!containerRef.current || terminalRef.current) return;

        const terminal = new Terminal({
            cursorBlink: true,
            convertEol: false,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
            lineHeight: 1.45,
            scrollback: 5000,
            tabStopWidth: 8,
            theme: {
                background: '#020617',
                foreground: '#d1fae5',
                cursor: '#67e8f9',
                selectionBackground: '#155e75',
                black: '#0f172a',
                red: '#fb7185',
                green: '#34d399',
                yellow: '#facc15',
                blue: '#38bdf8',
                magenta: '#c084fc',
                cyan: '#22d3ee',
                white: '#e2e8f0',
                brightBlack: '#64748b',
                brightRed: '#fda4af',
                brightGreen: '#86efac',
                brightYellow: '#fde047',
                brightBlue: '#7dd3fc',
                brightMagenta: '#d8b4fe',
                brightCyan: '#67e8f9',
                brightWhite: '#f8fafc',
            },
        });
        const fitAddon = new FitAddon();

        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        fitAddon.fit();
        terminal.writeln('Select a VPS and connect to start a terminal session.');

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
            sendResize();
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            dataDisposableRef.current?.dispose();
            terminal.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        return () => {
            manualCloseRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            dataDisposableRef.current?.dispose();
            socketRef.current?.close();
        };
    }, []);

    function dimensions() {
        const terminal = terminalRef.current;
        if (!terminal) return { cols: DEFAULT_COLS, rows: DEFAULT_ROWS };
        fitAddonRef.current?.fit();
        return {
            cols: terminal.cols || DEFAULT_COLS,
            rows: terminal.rows || DEFAULT_ROWS,
        };
    }

    async function connect(isReconnect = false) {
        if (!wsBaseUrl || !terminalRef.current) return;
        if (!isReconnect && (status === 'connecting' || status === 'reconnecting')) return;

        terminalReadyRef.current = false;
        shouldReconnectRef.current = true;
        dataDisposableRef.current?.dispose();

        if (socketRef.current) {
            socketRef.current.onopen = null;
            socketRef.current.onmessage = null;
            socketRef.current.onerror = null;
            socketRef.current.onclose = null;
            socketRef.current.close();
        }

        setStatus(isReconnect ? 'reconnecting' : 'connecting');
        writeStatus(isReconnect ? 'reconnecting...' : 'connecting...');

        let token = '';
        try {
            const res = await api.get<{ token: string }>('/auth/socket-token');
            token = res.token;
        } catch (err) {
            shouldReconnectRef.current = false;
            setStatus('error');
            writeStatus('authentication failed. Please log in.');
            return;
        }

        const { cols, rows } = dimensions();
        const socket = new WebSocket(`${wsBaseUrl}?token=${token}&cols=${cols}&rows=${rows}`);
        socket.binaryType = 'arraybuffer';
        socketRef.current = socket;
        manualCloseRef.current = false;

        socket.onopen = () => {
            writeStatus('websocket open, starting shell...');
        };

        socket.onmessage = (event) => {
            if (typeof event.data === 'string') {
                const terminalEvent = parseTerminalEvent(event.data);
                if (terminalEvent) {
                    handleTerminalEvent(terminalEvent);
                    return;
                }
                terminalRef.current?.write(event.data);
                return;
            }

            if (event.data instanceof ArrayBuffer) {
                terminalRef.current?.write(new Uint8Array(event.data));
            }
        };

        socket.onerror = () => {
            shouldReconnectRef.current = false;
            setStatus('error');
            writeStatus('terminal connection failed.');
        };

        socket.onclose = () => {
            dataDisposableRef.current?.dispose();
            dataDisposableRef.current = null;

            const shouldReconnect = !manualCloseRef.current
                && shouldReconnectRef.current
                && terminalReadyRef.current
                && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS;

            terminalReadyRef.current = false;

            if (shouldReconnect) {
                reconnectAttemptsRef.current += 1;
                setStatus('reconnecting');
                writeStatus(`disconnected, reconnecting (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
                reconnectTimerRef.current = setTimeout(() => connect(true), RECONNECT_DELAY_MS);
                return;
            }

            setStatus((current) => (current === 'error' ? 'error' : 'disconnected'));
            writeStatus('disconnected.');
        };
    }

    function bindTerminalInput(socket: WebSocket) {
        dataDisposableRef.current?.dispose();
        const encoder = new TextEncoder();
        dataDisposableRef.current = terminalRef.current?.onData((data) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(encoder.encode(data));
            }
        }) || null;
    }

    function handleTerminalEvent(event: TerminalEvent) {
        if (event.event === 'terminal:connected') {
            terminalReadyRef.current = true;
            reconnectAttemptsRef.current = 0;
            setStatus('connected');
            if (socketRef.current) bindTerminalInput(socketRef.current);
            writeStatus('connected.');
            terminalRef.current?.focus();
            sendResize();
            return;
        }

        if (event.event === 'terminal:error') {
            shouldReconnectRef.current = false;
            setStatus('error');
            writeStatus(`${event.message || 'terminal connection failed'}${event.errorCode ? ` (${event.errorCode})` : ''}.`);
            return;
        }

        if (event.event === 'terminal:closed') {
            setStatus('disconnected');
            writeStatus('session closed.');
        }
    }

    function sendResize() {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const { cols, rows } = dimensions();
        socket.send(JSON.stringify({ event: 'terminal:resize', cols, rows }));
    }

    function disconnect() {
        manualCloseRef.current = true;
        shouldReconnectRef.current = false;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        dataDisposableRef.current?.dispose();
        dataDisposableRef.current = null;
        socketRef.current?.close();
        setStatus('disconnected');
    }

    function writeStatus(message: string) {
        terminalRef.current?.writeln(`\r\n[deployforge] ${message}`);
    }

    return (
        <Panel className="bg-slate-950/70">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-mono text-sm font-bold uppercase tracking-widest text-emerald-300">DeployForge TUI</p>
                    <p className="mt-1 text-xs text-slate-500">Status: {status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => connect()} disabled={!wsBaseUrl || status === 'connecting' || status === 'reconnecting'}>
                        {status === 'connected' ? 'Reconnect' : status === 'reconnecting' ? 'Reconnecting' : 'Connect'}
                    </Button>
                    {status === 'connected' && (
                        <Button variant="secondary" onClick={disconnect}>Disconnect</Button>
                    )}
                </div>
            </div>
            <div
                ref={containerRef}
                className="terminal-scrollbar h-[560px] overflow-hidden rounded-lg border border-white/10 bg-slate-950 p-3"
            />
        </Panel>
    );
}

function parseTerminalEvent(text: string): TerminalEvent | null {
    if (!text.startsWith('{')) return null;
    try {
        const parsed = JSON.parse(text) as TerminalEvent;
        return parsed.event?.startsWith('terminal:') ? parsed : null;
    } catch {
        return null;
    }
}
