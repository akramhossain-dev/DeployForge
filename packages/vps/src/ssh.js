"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSHService = exports.SSHConnectionError = void 0;
const ssh2_1 = require("ssh2");
class SSHConnectionError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = 'SSHConnectionError';
        this.code = code;
    }
}
exports.SSHConnectionError = SSHConnectionError;
class SSHService {
    client;
    constructor() {
        this.client = new ssh2_1.Client();
    }
    async connect(config) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn) => {
                if (settled)
                    return;
                settled = true;
                fn();
            };
            this.client
                .once('ready', () => finish(resolve))
                .once('error', (error) => {
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
    async shell(pty = { term: 'xterm-256color' }) {
        return new Promise((resolve, reject) => {
            this.client.shell(pty, (err, stream) => {
                if (err)
                    return reject(err);
                resolve(stream);
            });
        });
    }
    async execute(command) {
        return new Promise((resolve, reject) => {
            this.client.exec(command, (err, stream) => {
                if (err)
                    return reject(err);
                let stdout = '';
                let stderr = '';
                stream
                    .on('close', (code) => {
                    resolve({ stdout, stderr, code });
                })
                    .on('data', (data) => {
                    stdout += data.toString();
                })
                    .stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            });
        });
    }
    disconnect() {
        this.client.end();
    }
}
exports.SSHService = SSHService;
function mapSSHError(error) {
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
