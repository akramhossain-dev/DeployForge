import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

export class SandboxService {
    static async analyze(deploymentId: string) {
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { project: true, vps: true },
        });
        if (!deployment) throw new Error('Deployment not found');

        const ssh = new SSHService();
        const issues: string[] = [];
        let score = 100;

        try {
            const vps = deployment.vps;
            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            const workDir = `/home/${vps.username}/deployments/${deployment.project.name}`;

            // 1. Structure Validation (20 points)
            const { stdout: fileList } = await ssh.execute(`ls -F ${workDir}`);
            const files = fileList.split('\n').map(f => f.trim().replace('*', '').replace('/', ''));

            const hasPackageJson = files.includes('package.json');
            const hasRequirements = files.includes('requirements.txt');
            const hasComposer = files.includes('composer.json');
            const hasDockerfile = files.includes('Dockerfile');

            if (!hasPackageJson && !hasRequirements && !hasComposer && !hasDockerfile) {
                issues.push('No valid project structure found (missing package.json, requirements.txt, etc.)');
                score -= 20;
            }

            // 2. Security Scan (25 points)
            const { stdout: dangerousCode } = await ssh.execute(`grep -rnE "eval\\(|exec\\(|child_process|rm -rf" ${workDir} --exclude-dir=node_modules || true`);
            if (dangerousCode.trim()) {
                issues.push('Dangerous code patterns detected (eval, exec, or rm -rf)');
                score -= 25;
            }

            // 3. Resource Estimation (20 points)
            // Basic heuristic: check current VPS load
            const { stdout: memFree } = await ssh.execute("free -m | grep Mem | awk '{print $4}'");
            const freeMB = parseInt(memFree.trim());
            if (freeMB < 512) {
                issues.push('Low VPS memory available (< 512MB)');
                score -= 10;
            }

            // 4. Port Analysis
            const port = deployment.port || 3000;
            const { stdout: portCheck } = await ssh.execute(`netstat -tuln | grep :${port} || true`);
            if (portCheck.trim()) {
                issues.push(`Port ${port} is already in use on the VPS`);
                score -= 10;
            }

            // 5. Env Validation (20 points)
            if (!deployment.env || deployment.env === '{}') {
                issues.push('No environment variables provided');
                score -= 10;
            }

            const status = score < 60 ? 'rejected' : score < 80 ? 'warning' : 'approved';

            return await prisma.deploymentSandbox.upsert({
                where: { deploymentId },
                update: {
                    score,
                    status,
                    issues,
                    estimatedCPU: 0.5, // Mock data for now
                    estimatedRAM: 256.0,
                    estimatedDisk: 1024.0,
                },
                create: {
                    deploymentId,
                    score,
                    status,
                    issues,
                    estimatedCPU: 0.5,
                    estimatedRAM: 256.0,
                    estimatedDisk: 1024.0,
                },
            });

        } finally {
            ssh.disconnect();
        }
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
