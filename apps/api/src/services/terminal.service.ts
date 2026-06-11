import prisma from '@deployforge/database';
import { SSHConnectionError, SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import { SocketStream } from '@fastify/websocket';
import { randomUUID } from 'crypto';

const encryptionService = new EncryptionService(config.encryption.key);

type TerminalStage = 'ssh_connect' | 'shell_init' | 'websocket_bridge';
type TerminalStatusEvent = 'terminal:connected' | 'terminal:closed' | 'terminal:error';
type SSHShellStream = Awaited<ReturnType<SSHService['shell']>>;

type TerminalSessionOptions = {
    cols?: number;
    rows?: number;
};

type TerminalControlMessage = {
    event?: 'terminal:resize';
    cols?: number;
    rows?: number;
};

type SSHSession = {
    sessionId: string;
    dbSessionId?: string;
    userId: string;
    vpsId: string;
    ssh: SSHService;
    shell?: SSHShellStream;
    socket: SocketStream['socket'];
    heartbeat?: NodeJS.Timeout;
    closed: boolean;
};

const sessions = new Map<string, SSHSession>();
const HEARTBEAT_INTERVAL_MS = 10000;
const WS_OPEN = 1;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export class TerminalService {
    static async createSession(userId: string, vpsId: string, socket: SocketStream, options: TerminalSessionOptions = {}) {
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps || vps.userId !== userId) {
            this.sendEvent(socket.socket, 'terminal:error', {
                success: false,
                stage: 'websocket_bridge',
                message: 'Unauthorized',
                errorCode: 'AUTH_FAILED',
            });
            socket.socket.close();
            return;
        }

        const ssh = new SSHService();
        const sessionId = randomUUID();
        const activeSession: SSHSession = {
            sessionId,
            userId,
            vpsId,
            ssh,
            socket: socket.socket,
            closed: false,
        };
        sessions.set(sessionId, activeSession);

        let dbSession: Awaited<ReturnType<typeof prisma.terminalSession.create>> | undefined;

        try {
            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            dbSession = await prisma.terminalSession.create({
                data: {
                    userId,
                    vpsId,
                    sessionId,
                    status: 'ACTIVE',
                },
            });
            activeSession.dbSessionId = dbSession.id;

            const stream = await ssh.shell({
                term: 'xterm-256color',
                cols: this.normalizeDimension(options.cols, DEFAULT_COLS),
                rows: this.normalizeDimension(options.rows, DEFAULT_ROWS),
            });
            activeSession.shell = stream;

            this.sendEvent(socket.socket, 'terminal:connected', { sessionId });
            this.attachHeartbeat(activeSession);

            stream.on('data', (data: Buffer) => {
                if (socket.socket.readyState === WS_OPEN) {
                    socket.socket.send(data);
                }
            });

            stream.on('error', (error: Error) => {
                this.sendError(socket.socket, 'websocket_bridge', error);
            });

            stream.on('close', () => {
                void this.cleanup(activeSession, 'CLOSED');
                if (socket.socket.readyState === WS_OPEN) {
                    this.sendEvent(socket.socket, 'terminal:closed', { sessionId });
                    socket.socket.close();
                }
            });

            socket.socket.on('message', (data: unknown) => {
                if (activeSession.closed || !activeSession.shell) return;
                if (this.handleControlMessage(activeSession, data)) return;
                activeSession.shell.write(this.toInput(data));
            });

            socket.socket.on('close', () => {
                void this.cleanup(activeSession, 'CLOSED');
            });

            socket.socket.on('error', (error: Error) => {
                this.sendError(socket.socket, 'websocket_bridge', error);
                void this.cleanup(activeSession, 'FAILED');
            });
        } catch (err: any) {
            const stage: TerminalStage = dbSession ? 'shell_init' : 'ssh_connect';
            this.sendError(socket.socket, stage, err);
            await this.cleanup(activeSession, 'FAILED');
            if (socket.socket.readyState === WS_OPEN) socket.socket.close();
        }
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }

    private static attachHeartbeat(session: SSHSession) {
        let alive = true;
        session.socket.on('pong', () => {
            alive = true;
        });

        session.heartbeat = setInterval(() => {
            if (session.closed) return;
            if (!alive) {
                session.socket.terminate();
                void this.cleanup(session, 'CLOSED');
                return;
            }
            alive = false;
            if (session.socket.readyState === WS_OPEN) {
                session.socket.ping();
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    private static async cleanup(session: SSHSession, status: 'CLOSED' | 'FAILED') {
        if (session.closed) return;
        session.closed = true;
        sessions.delete(session.sessionId);

        if (session.heartbeat) clearInterval(session.heartbeat);
        session.shell?.end();
        session.ssh.disconnect();

        if (session.dbSessionId) {
            await prisma.terminalSession.update({
                where: { id: session.dbSessionId },
                data: { status, endedAt: new Date() },
            }).catch(() => undefined);
        }
    }

    private static toInput(data: unknown) {
        if (typeof data === 'string') return data;
        if (Buffer.isBuffer(data)) return data;
        if (Array.isArray(data)) return Buffer.concat(data);
        if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        if (data instanceof ArrayBuffer) return Buffer.from(data);
        return Buffer.from(String(data));
    }

    private static handleControlMessage(session: SSHSession, data: unknown) {
        if (typeof data !== 'string') return false;

        let message: TerminalControlMessage;
        try {
            message = JSON.parse(data) as TerminalControlMessage;
        } catch {
            return false;
        }

        if (message.event !== 'terminal:resize') return false;

        const cols = this.normalizeDimension(message.cols, DEFAULT_COLS);
        const rows = this.normalizeDimension(message.rows, DEFAULT_ROWS);
        session.shell?.setWindow(rows, cols, 0, 0);
        return true;
    }

    private static normalizeDimension(value: number | undefined, fallback: number) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
        return Math.max(1, Math.floor(value));
    }

    private static sendError(socket: SocketStream['socket'], stage: TerminalStage, error: unknown) {
        const mapped = this.mapError(error);
        this.sendEvent(socket, 'terminal:error', {
            success: false,
            stage,
            message: mapped.message,
            errorCode: mapped.errorCode,
        });
    }

    private static mapError(error: unknown) {
        if (error instanceof SSHConnectionError) {
            return { message: error.message, errorCode: error.code };
        }

        const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
        const message = error instanceof Error ? error.message : 'Terminal connection failed';

        if (code === 'ECONNRESET') return { message: 'SSH connection was reset', errorCode: 'ECONNRESET' };
        if (code === 'ETIMEDOUT') return { message: 'SSH connection timed out', errorCode: 'ETIMEDOUT' };
        if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ENOTFOUND') {
            return { message: 'SSH host is unreachable', errorCode: 'HOST_UNREACHABLE' };
        }
        if (/auth|authentication|permission denied/i.test(message)) {
            return { message: 'SSH authentication failed', errorCode: 'AUTH_FAILED' };
        }

        return { message, errorCode: code || 'TERMINAL_CONNECTION_FAILED' };
    }

    private static sendEvent(socket: SocketStream['socket'], event: TerminalStatusEvent, payload: Record<string, unknown>) {
        if (socket.readyState !== WS_OPEN) return;
        socket.send(JSON.stringify({ event, ...payload }));
    }
}
