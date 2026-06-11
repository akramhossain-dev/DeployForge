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

export class SSHService {
    private client: Client;

    constructor() {
        this.client = new Client();
    }

    async connect(config: SSHConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                fn();
            };

            this.client
                .once('ready', () => finish(resolve))
                .once('error', (error: NodeJS.ErrnoException & { level?: string }) => {
                    finish(() => reject(mapSSHError(error)));
                })
                .once('timeout', () => {
                    finish(() => reject(new SSHConnectionError('SSH connection timed out', 'SSH_TIMEOUT')));
                })
                .connect({
                    ...config,
                    host: config.host.trim(),
                    readyTimeout: 10000,
                    keepaliveInterval: 10000,
                    keepaliveCountMax: 3,
                    sock: config.sock,
                });
        });
    }

    async shell(pty: PseudoTtyOptions = { term: 'xterm-256color' }): Promise<ClientChannel> {
        return new Promise((resolve, reject) => {
            this.client.shell(pty, (err, stream) => {
                if (err) return reject(err);
                resolve(stream);
            });
        });
    }

    async execute(command: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
        return new Promise((resolve, reject) => {
            this.client.exec(command, (err, stream) => {
                if (err) return reject(err);

                let stdout = '';
                let stderr = '';

                stream
                    .on('close', (code: number | null) => {
                        resolve({ stdout, stderr, code });
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
            this.client.sftp((err, sftp) => {
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
        this.client.end();
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
