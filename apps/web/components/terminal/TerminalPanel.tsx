'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';
import { Server, Play, Square, Trash2, RefreshCw, ChevronDown, Monitor, Maximize2, Minimize2, Terminal as TerminalIcon } from 'lucide-react';
import api from '@/lib/api/client';
import type { Vps } from '@/lib/api/types';
import clsx from 'clsx';

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

interface TerminalPanelProps {
    vpsList?: Vps[];
    activeVps?: Vps | null;
    onSelectVps?: (vps: Vps) => void;
}

export function TerminalPanel({ vpsList = [], activeVps, onSelectVps }: TerminalPanelProps) {
    const vpsId = activeVps?.id;
    const [status, setStatus] = useState<TerminalStatus>('idle');
    const [isFullscreen, setIsFullscreen] = useState(false);

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
                background: '#000000',
                foreground: '#E2E8F0',
                cursor: '#FFFFFF',
                selectionBackground: '#333333',
                black: '#000000',
                red: '#F87171',
                green: '#4ADE80',
                yellow: '#FACC15',
                blue: '#60A5FA',
                magenta: '#C084FC',
                cyan: '#38BDF8',
                white: '#F8FAFC',
                brightBlack: '#666666',
                brightRed: '#FCA5A5',
                brightGreen: '#86EFAC',
                brightYellow: '#FDE047',
                brightBlue: '#93C5FD',
                brightMagenta: '#E9D5FF',
                brightCyan: '#7DD3FC',
                brightWhite: '#FFFFFF',
            },
        });
        const fitAddon = new FitAddon();

        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        fitAddon.fit();
        terminal.writeln('\x1b[1;30m[DeployForge Web SSH Shell v2.0]\x1b[0m');
        terminal.writeln('\x1b[38;5;242mSelect a target server and click "Connect" to initiate WebSocket SSH session.\x1b[0m\r\n');

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
        writeStatus(isReconnect ? 'Reconnecting to SSH host...' : `Connecting to ${activeVps?.name} (${activeVps?.ipAddress}:${activeVps?.port})...`);

        let token = '';
        try {
            const res = await api.get<{ token: string }>('/auth/socket-token');
            token = res.token;
        } catch (err) {
            shouldReconnectRef.current = false;
            setStatus('error');
            writeStatus('Authentication failed. Session token expired.');
            return;
        }

        const { cols, rows } = dimensions();
        const socket = new WebSocket(`${wsBaseUrl}?token=${token}&cols=${cols}&rows=${rows}`);
        socket.binaryType = 'arraybuffer';
        socketRef.current = socket;
        manualCloseRef.current = false;

        socket.onopen = () => {
            writeStatus('WebSocket tunnel established. Initializing PTY shell...');
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
            writeStatus('Terminal SSH connection failed.');
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
                writeStatus(`Disconnected. Attempting reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
                reconnectTimerRef.current = setTimeout(() => connect(true), RECONNECT_DELAY_MS);
                return;
            }

            setStatus((current) => (current === 'error' ? 'error' : 'disconnected'));
            writeStatus('Session disconnected.');
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
            writeStatus('SSH Session Connected.');
            terminalRef.current?.focus();
            sendResize();
            return;
        }

        if (event.event === 'terminal:error') {
            shouldReconnectRef.current = false;
            setStatus('error');
            writeStatus(`Error: ${event.message || 'SSH handshake failed'}${event.errorCode ? ` [${event.errorCode}]` : ''}`);
            return;
        }

        if (event.event === 'terminal:closed') {
            setStatus('disconnected');
            writeStatus('Remote shell closed.');
        }
    }

    function sendResize() {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || !terminalReadyRef.current) return;
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

    function clearTerminal() {
        terminalRef.current?.clear();
    }

    function writeStatus(message: string) {
        terminalRef.current?.writeln(`\r\n\x1b[1;30m[deployforge-ssh]\x1b[0m \x1b[38;5;244m${message}\x1b[0m`);
    }

    function sendQuickCommand(cmd: string) {
        if (status === 'connected' && socketRef.current?.readyState === WebSocket.OPEN) {
            const encoder = new TextEncoder();
            socketRef.current.send(encoder.encode(cmd + '\r'));
            terminalRef.current?.focus();
        }
    }

    return (
        <div className={clsx(
            'rounded-md border border-[#1F1F1F] bg-[#000000] overflow-hidden font-mono text-xs flex flex-col transition-all',
            isFullscreen ? 'fixed inset-4 z-50 h-[calc(100vh-32px)]' : 'h-[640px]'
        )}>
            {/* Window Topbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] bg-[#0A0A0A] px-4 py-2.5 gap-3 shrink-0">
                {/* Left: Window Controls + Server Switcher */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                    </div>

                    <div className="h-3 w-px bg-[#1F1F1F] shrink-0" />

                    {/* Server selector */}
                    {vpsList.length > 0 ? (
                        <div className="relative flex items-center gap-2">
                            <Server size={13} className="text-[#A1A1A1] shrink-0" />
                            <select
                                value={activeVps?.id || ''}
                                onChange={(e) => {
                                    const selected = vpsList.find(v => v.id === e.target.value);
                                    if (selected && onSelectVps) {
                                        disconnect();
                                        onSelectVps(selected);
                                    }
                                }}
                                className="bg-[#000000] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-white outline-none cursor-pointer hover:border-[#333333] transition-colors"
                            >
                                {vpsList.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.username || 'root'}@{v.name} ({v.ipAddress}:{v.port})
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <span className="text-[#666666] text-xs">No Server Selected</span>
                    )}
                </div>

                {/* Right: Status Pill & Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className={clsx(
                        'flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        status === 'connected' ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-400' :
                        status === 'connecting' || status === 'reconnecting' ? 'border-amber-900/40 bg-amber-950/20 text-amber-400' :
                        status === 'error' ? 'border-rose-900/40 bg-rose-950/20 text-rose-400' :
                        'border-[#1F1F1F] bg-[#111111] text-[#666666]'
                    )}>
                        <span className={clsx('h-1.5 w-1.5 rounded-full',
                            status === 'connected' ? 'bg-emerald-400 animate-pulse' :
                            status === 'connecting' || status === 'reconnecting' ? 'bg-amber-400 animate-ping' :
                            'bg-[#666666]'
                        )} />
                        {status}
                    </span>

                    <div className="h-3 w-px bg-[#1F1F1F]" />

                    {status !== 'connected' ? (
                        <button
                            onClick={() => connect()}
                            disabled={!wsBaseUrl || status === 'connecting' || status === 'reconnecting'}
                            className="flex h-7 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-3 font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50 transition-colors"
                        >
                            {status === 'connecting' || status === 'reconnecting' ? (
                                <RefreshCw size={12} className="animate-spin" />
                            ) : (
                                <Play size={12} />
                            )}
                            <span>Connect</span>
                        </button>
                    ) : (
                        <button
                            onClick={disconnect}
                            className="flex h-7 items-center gap-1.5 rounded border border-rose-900/40 bg-rose-950/20 px-3 font-semibold text-rose-400 hover:bg-rose-900/30 transition-colors"
                        >
                            <Square size={12} />
                            <span>Disconnect</span>
                        </button>
                    )}

                    <button
                        onClick={clearTerminal}
                        className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-[#A1A1A1] hover:text-white transition-colors"
                        title="Clear screen"
                    >
                        <Trash2 size={12} />
                    </button>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="flex h-7 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-[#A1A1A1] hover:text-white transition-colors"
                        title="Toggle Fullscreen"
                    >
                        {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                </div>
            </div>

            {/* Quick Command Shortcuts Bar */}
            {status === 'connected' && (
                <div className="flex items-center gap-2 border-b border-[#1F1F1F] bg-[#000000] px-4 py-1.5 text-[11px] overflow-x-auto no-scrollbar shrink-0">
                    <span className="text-[#666666] font-semibold uppercase text-[9px] shrink-0">Quick Commands:</span>
                    {[
                        { label: 'top', cmd: 'top' },
                        { label: 'df -h', cmd: 'df -h' },
                        { label: 'free -m', cmd: 'free -m' },
                        { label: 'docker ps', cmd: 'docker ps' },
                        { label: 'systemctl status', cmd: 'systemctl status' },
                        { label: 'uptime', cmd: 'uptime' },
                    ].map((qc) => (
                        <button
                            key={qc.cmd}
                            onClick={() => sendQuickCommand(qc.cmd)}
                            className="rounded border border-[#1F1F1F] bg-[#0A0A0A] px-2 py-0.5 text-[#A1A1A1] hover:border-[#333333] hover:text-white shrink-0 transition-colors"
                        >
                            {qc.label}
                        </button>
                    ))}
                </div>
            )}

            {/* xterm.js Terminal Container */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden p-3 bg-[#000000]"
            />
        </div>
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
