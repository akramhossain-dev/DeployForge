import { Client, ConnectConfig } from 'ssh2';

export interface SSHConfig extends ConnectConfig {
    host: string;
}

export class SSHService {
    private client: Client;

    constructor() {
        this.client = new Client();
    }

    async connect(config: SSHConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client
                .on('ready', resolve)
                .on('error', reject)
                .connect({
                    ...config,
                    readyTimeout: 10000,
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

    disconnect(): void {
        this.client.end();
    }
}
