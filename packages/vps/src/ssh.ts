import { Client, ClientChannel, ConnectConfig, PseudoTtyOptions } from 'ssh2';
import fs from 'node:fs';

export interface SSHConfig extends ConnectConfig {
    host: string;
}

export type SSHConnectionErrorCode =
    | 'SSH_TIMEOUT'
    | 'INVALID_CREDENTIALS'
    | 'HOST_UNREACHABLE'
    | 'CONNECTION_RESET'
    | 'PORT_BLOCKED'
    | 'SSH_COMMAND_FAILED'
    | 'SSH_CONNECTION_FAILED';

export class SSHConnectionError extends Error {
    code: SSHConnectionErrorCode;

    constructor(message: string, code: SSHConnectionErrorCode) {
        super(message);
        this.name = 'SSHConnectionError';
        this.code = code;
    }
}

interface PooledConnection {
    client: Client;
    refCount: number;
    idleTimeout?: NodeJS.Timeout;
    key: string;
}

export class SSHService {
    // Static connection pool shared across all SSHService instances
    private static pool = new Map<string, PooledConnection>();
    private static IDLE_TIMEOUT_MS = 60000; // 60 seconds idle timeout

    private client: Client | null = null;
    private poolKey: string | null = null;

    constructor() {}

    async connect(config: SSHConfig): Promise<void> {
        const hostStr = config.host.trim();
        const portNum = config.port || 22;
        const userStr = config.username || 'root';
        // Unique key for the host connection configuration
        const key = `${hostStr}:${portNum}:${userStr}:${config.privateKey ? 'key' : 'password'}`;

        let pooled = SSHService.pool.get(key);

        if (pooled) {
            // Cancel any pending idle timeout
            if (pooled.idleTimeout) {
                clearTimeout(pooled.idleTimeout);
                pooled.idleTimeout = undefined;
            }
            pooled.refCount++;
            this.client = pooled.client;
            this.poolKey = key;
            return;
        }

        const client = new Client();
        pooled = {
            client,
            refCount: 1,
            key
        };

        SSHService.pool.set(key, pooled);
        this.client = client;
        this.poolKey = key;

        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                fn();
            };

            const cleanupPool = () => {
                const conn = SSHService.pool.get(key);
                if (conn && conn.client === client) {
                    if (conn.idleTimeout) clearTimeout(conn.idleTimeout);
                    SSHService.pool.delete(key);
                }
            };

            client
                .once('ready', () => finish(resolve))
                .once('error', (error: NodeJS.ErrnoException & { level?: string }) => {
                    cleanupPool();
                    finish(() => reject(mapSSHError(error)));
                })
                .once('close', () => {
                    cleanupPool();
                })
                .once('end', () => {
                    cleanupPool();
                })
                .once('timeout', () => {
                    cleanupPool();
                    finish(() => reject(new SSHConnectionError('SSH connection timed out', 'SSH_TIMEOUT')));
                })
                .connect({
                    ...config,
                    host: hostStr,
                    readyTimeout: 10000,
                    keepaliveInterval: 10000,
                    keepaliveCountMax: 3,
                    sock: config.sock,
                });
        });
    }

    private getClient(): Client {
        if (!this.client) {
            throw new Error('SSH client is not connected');
        }
        return this.client;
    }

    async shell(pty: PseudoTtyOptions = { term: 'xterm-256color' }): Promise<ClientChannel> {
        return new Promise((resolve, reject) => {
            this.getClient().shell(pty, (err, stream) => {
                if (err) return reject(err);
                resolve(stream);
            });
        });
    }

    async execute(command: string, timeoutMs = 15 * 60 * 1000): Promise<{ stdout: string; stderr: string; code: number | null }> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                fn();
            };

            const timer = setTimeout(() => {
                finish(() => reject(new SSHConnectionError(`Command timed out after ${Math.round(timeoutMs / 1000)}s`, 'SSH_COMMAND_FAILED')));
            }, timeoutMs);

            this.getClient().exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timer);
                    return reject(err);
                }

                let stdout = '';
                let stderr = '';

                stream
                    .on('close', (code: number | null) => {
                        clearTimeout(timer);
                        finish(() => resolve({ stdout, stderr, code }));
                    })
                    .on('data', (data: Buffer) => {
                        stdout += data.toString();
                    })
                    .stderr.on('data', (data: Buffer) => {
                        stderr += data.toString();
                    });
            });
        });
    }

    async uploadFile(localPath: string, remotePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.getClient().sftp((err, sftp) => {
                if (err) return reject(err);
                const readStream = fs.createReadStream(localPath);
                const writeStream = sftp.createWriteStream(remotePath, { mode: 0o600 });

                const fail = (error: Error) => {
                    readStream.destroy();
                    writeStream.destroy();
                    reject(error);
                };

                readStream.once('error', fail);
                writeStream.once('error', fail);
                writeStream.once('close', () => {
                    sftp.end();
                    resolve();
                });
                readStream.pipe(writeStream);
            });
        });
    }

    disconnect(): void {
        if (!this.poolKey) return;
        const conn = SSHService.pool.get(this.poolKey);
        if (conn) {
            conn.refCount--;
            if (conn.refCount <= 0) {
                conn.refCount = 0;
                // Start idle timeout to disconnect the client if not used within the threshold
                if (!conn.idleTimeout) {
                    conn.idleTimeout = setTimeout(() => {
                        conn.client.end();
                        SSHService.pool.delete(conn.key);
                    }, SSHService.IDLE_TIMEOUT_MS);
                }
            }
        }
        this.client = null;
        this.poolKey = null;
    }
}

function mapSSHError(error: NodeJS.ErrnoException & { level?: string }) {
    const message = String(error.message || '');
    if (error.level === 'client-authentication' || /All configured authentication methods failed|Authentication failed/i.test(message)) {
        return new SSHConnectionError('Invalid SSH username, password, or private key', 'INVALID_CREDENTIALS');
    }
    if (error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') {
        return new SSHConnectionError('Host is unreachable', 'HOST_UNREACHABLE');
    }
    if (error.code === 'ECONNREFUSED') {
        return new SSHConnectionError('SSH port is closed or blocked', 'PORT_BLOCKED');
    }
    if (error.code === 'ETIMEDOUT' || /timed out/i.test(message)) {
        return new SSHConnectionError('SSH connection timed out', 'SSH_TIMEOUT');
    }
    if (error.code === 'ECONNRESET') {
        return new SSHConnectionError('SSH connection was reset', 'CONNECTION_RESET');
    }
    return new SSHConnectionError(message || 'SSH connection failed', 'SSH_CONNECTION_FAILED');
}
