import fs from 'node:fs/promises';
import path from 'node:path';
import { DeploymentError } from './error';

export class DeploymentWorkspaceService {
    static async cleanup(deploymentId: string, uploadPath?: string | null) {
        await fs.rm(path.join('/tmp/deployforge', 'deployments', deploymentId), { recursive: true, force: true }).catch(() => undefined);
        if (uploadPath?.startsWith('/tmp/deployforge/deployments/')) {
            await fs.rm(path.dirname(uploadPath), { recursive: true, force: true }).catch(() => undefined);
        }
    }

    static async prepareUpload(deploymentId: string, incomingPath: string, originalFileName: string) {
        const archiveName = path.basename(originalFileName);
        const workspace = path.join('/tmp/deployforge', 'deployments', deploymentId);
        const archivePath = path.join(workspace, archiveName);
        await fs.rm(workspace, { recursive: true, force: true });
        await fs.mkdir(path.join(workspace, 'workspace'), { recursive: true });
        await fs.mkdir(path.join(workspace, 'logs'), { recursive: true });
        await fs.access(incomingPath).catch(() => {
            throw new DeploymentError('uploading', 'Uploaded archive disappeared before workspace preparation', 'UPLOAD_FILE_MISSING');
        });
        await fs.copyFile(incomingPath, archivePath);
        await fs.access(archivePath).catch(() => {
            throw new DeploymentError('uploading', 'Deployment workspace archive was not persisted', 'WORKSPACE_NOT_FOUND');
        });
        await fs.writeFile(path.join(workspace, '.upload.lock'), JSON.stringify({
            deploymentId,
            originalFileName,
            archiveName,
            lockedAt: new Date().toISOString(),
        }, null, 2), { mode: 0o600 });
        await fs.unlink(incomingPath).catch(() => undefined);
        await fs.rm(path.dirname(incomingPath), { recursive: true, force: true }).catch(() => undefined);
        return { archiveName, archivePath, workspace };
    }
}
