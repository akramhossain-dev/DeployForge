import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import { SocketStream } from '@fastify/websocket';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

export class TerminalService {
    static async createSession(userId: string, vpsId: string, socket: SocketStream) {
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps || vps.userId !== userId) {
            socket.socket.send(JSON.stringify({ event: 'terminal:error', message: 'Unauthorized' }));
            socket.socket.close();
            return;
        }

        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await (ssh as any).client.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            const session = await prisma.terminalSession.create({
                data: {
                    userId,
                    vpsId,
                    sessionId: Math.random().toString(36).substring(7),
                    status: 'ACTIVE',
                },
            });

            (ssh as any).client.shell((err: any, stream: any) => {
                if (err) {
                    socket.socket.send(JSON.stringify({ event: 'terminal:error', message: err.message }));
                    return;
                }

                // Stream from SSH to WebSocket
                stream.on('data', (data: Buffer) => {
                    socket.socket.send(data.toString());
                });

                // Stream from WebSocket to SSH
                socket.socket.on('message', (data: Buffer) => {
                    stream.write(data);
                });

                stream.on('close', async () => {
                    await prisma.terminalSession.update({
                        where: { id: session.id },
                        data: { status: 'CLOSED', endedAt: new Date() },
                    });
                    socket.socket.close();
                    ssh.disconnect();
                });

                socket.socket.on('close', () => {
                    stream.end();
                    ssh.disconnect();
                });
            });

        } catch (err: any) {
            socket.socket.send(JSON.stringify({ event: 'terminal:error', message: err.message }));
            socket.socket.close();
        }
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
