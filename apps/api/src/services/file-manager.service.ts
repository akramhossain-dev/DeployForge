import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { buildStoredAuth } from './vps.service';
import path from 'path';

export interface FileEntry {
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink';
    size: number;
    modified: string;
    permissions: string;
    extension: string;
    mimeType: string;
}

export interface DirectoryListing {
    path: string;
    entries: FileEntry[];
}

export class FileManagerError extends Error {
    errorCode: string;
    statusCode: number;
    constructor(message: string, errorCode = 'FILE_MANAGER_ERROR', statusCode = 400) {
        super(message);
        this.name = 'FileManagerError';
        this.errorCode = errorCode;
        this.statusCode = statusCode;
    }
}

function getMimeType(name: string): string {
    const ext = path.extname(name).toLowerCase().slice(1);
    const map: Record<string, string> = {
        js: 'text/javascript', ts: 'text/typescript', jsx: 'text/javascript', tsx: 'text/typescript',
        html: 'text/html', css: 'text/css', scss: 'text/x-scss', json: 'application/json',
        yaml: 'text/yaml', yml: 'text/yaml', md: 'text/markdown', txt: 'text/plain',
        sh: 'text/x-shellscript', bash: 'text/x-shellscript', php: 'text/x-php',
        py: 'text/x-python', go: 'text/x-go', java: 'text/x-java', rs: 'text/x-rust',
        rb: 'text/x-ruby', sql: 'text/x-sql', xml: 'text/xml', csv: 'text/csv',
        toml: 'text/x-toml', ini: 'text/plain', env: 'text/plain',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
        pdf: 'application/pdf', zip: 'application/zip', tar: 'application/x-tar',
        gz: 'application/gzip',
    };
    return map[ext] || 'application/octet-stream';
}

function isTextFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase().slice(1);
    const binaryExts = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'pdf',
        'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
        'mp3', 'mp4', 'mkv', 'avi', 'mov', 'wav', 'ogg', 'flac',
        'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'img', 'dmg',
        'deb', 'rpm', 'msi', 'app', 'war', 'jar', 'class',
        'pyc', 'pyd', 'db', 'sqlite', 'woff', 'woff2', 'ttf', 'eot'
    ]);
    return !binaryExts.has(ext);
}

function isImageFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase().slice(1);
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext);
}

export function safePath(clientPath: string): string {
    
    let p = clientPath
        .replace(/\0/g, '')           
        .replace(/\.\.\//g, '')       
        .replace(/\/\.\./g, '')       
        .replace(/^\.\.$/g, '')       
        .replace(/\/\/+/g, '/');      

    if (!p.startsWith('/') && !p.startsWith('~')) p = '/' + p;

    return p.replace(/\/\/+/g, '/') || '/';
}

export async function resolvePath(ssh: SSHService, clientPath: string): Promise<string> {
    if (!clientPath || clientPath === '~') {
        const pwdResult = await ssh.execute('pwd');
        return safePath(pwdResult.stdout.trim() || '/');
    }
    if (clientPath.startsWith('~')) {
        const pwdResult = await ssh.execute('pwd');
        const home = pwdResult.stdout.trim() || '/';
        const suffix = clientPath.slice(1);
        return safePath(home + suffix);
    }
    return safePath(clientPath);
}

async function connectToVps(userId: string, vpsId: string): Promise<{ ssh: SSHService; vps: any }> {
    const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
    if (!vps) throw new FileManagerError('VPS not found or access denied', 'VPS_NOT_FOUND', 404);

    const ssh = new SSHService();
    await ssh.connect({
        host: vps.ipAddress,
        port: vps.port,
        username: vps.username,
        ...buildStoredAuth(vps),
    });
    return { ssh, vps };
}

export class FileManagerService {

    static async listDirectory(userId: string, vpsId: string, clientPath: string): Promise<DirectoryListing> {
        const { ssh } = await connectToVps(userId, vpsId);
        const dirPath = await resolvePath(ssh, clientPath);

        try {
            const statResult = await ssh.execute(`stat -c "%F" "${dirPath}" 2>/dev/null || echo "NOT_FOUND"`);
            const statOut = statResult.stdout.trim();
            if (statOut === 'NOT_FOUND') throw new FileManagerError('Directory not found', 'NOT_FOUND', 404);
            if (!statOut.includes('directory')) throw new FileManagerError('Path is not a directory', 'NOT_A_DIRECTORY', 400);

            const listResult = await ssh.execute(
                `ls -la --time-style="+%Y-%m-%dT%H:%M:%S" "${dirPath}" 2>/dev/null | tail -n +2 | awk '{print $1"\\t"$5"\\t"$6"\\t"$NF}'`
            );

            const entries: FileEntry[] = [];
            for (const line of listResult.stdout.trim().split('\n').filter(Boolean)) {
                const [perms, sizeStr, modified, name] = line.split('\t');
                if (!name || name === '.' || name === '..') continue;

                const isDir = perms?.startsWith('d');
                const isSymlink = perms?.startsWith('l');
                const entryPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;

                entries.push({
                    name,
                    path: entryPath,
                    type: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
                    size: parseInt(sizeStr, 10) || 0,
                    modified: modified || '',
                    permissions: perms || '',
                    extension: isDir ? '' : path.extname(name).toLowerCase().slice(1),
                    mimeType: isDir ? 'inode/directory' : getMimeType(name),
                });
            }

            return { path: dirPath, entries };
        } finally {
            ssh.disconnect();
        }
    }

    static async readFile(userId: string, vpsId: string, clientPath: string): Promise<{ content: string; encoding: string; mimeType: string }> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);
        const fileName = path.basename(filePath);

        try {
            const statResult = await ssh.execute(`stat -c "%s %F" "${filePath}" 2>/dev/null || echo "NOT_FOUND"`);
            const statLine = statResult.stdout.trim();
            if (statLine === 'NOT_FOUND') throw new FileManagerError('File not found', 'NOT_FOUND', 404);

            const [sizeStr, ...typeParts] = statLine.split(' ');
            const fileType = typeParts.join(' ');
            if (fileType.includes('directory')) throw new FileManagerError('Path is a directory', 'IS_DIRECTORY', 400);

            const fileSize = parseInt(sizeStr, 10) || 0;
            if (fileSize > 20 * 1024 * 1024) throw new FileManagerError('File too large to preview (max 20MB)', 'FILE_TOO_LARGE', 413);

            const mimeType = getMimeType(fileName);

            if (isImageFile(fileName)) {
                const result = await ssh.execute(`base64 -w 0 "${filePath}" 2>/dev/null`);
                if (result.code !== 0) throw new FileManagerError('Failed to read file', 'READ_ERROR', 500);
                return { content: result.stdout.trim(), encoding: 'base64', mimeType };
            }

            if (!isTextFile(fileName)) {
                throw new FileManagerError('Binary files cannot be previewed in the editor', 'BINARY_FILE', 415);
            }

            const result = await ssh.execute(`cat "${filePath}" 2>/dev/null`);
            if (result.code !== 0) throw new FileManagerError('Failed to read file', 'READ_ERROR', 500);
            return { content: result.stdout, encoding: 'utf-8', mimeType };
        } finally {
            ssh.disconnect();
        }
    }

    static async writeFile(userId: string, vpsId: string, clientPath: string, content: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);

        try {
            await ssh.execute(`mkdir -p "${path.dirname(filePath)}"`);
            const encoded = Buffer.from(content).toString('base64');
            const result = await ssh.execute(`printf '%s' "${encoded}" | base64 -d > "${filePath}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to write file', 'WRITE_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async createFile(userId: string, vpsId: string, clientPath: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);

        try {
            const exists = await ssh.execute(`test -e "${filePath}" && echo "EXISTS" || echo "OK"`);
            if (exists.stdout.trim() === 'EXISTS') throw new FileManagerError('File already exists', 'ALREADY_EXISTS', 409);
            await ssh.execute(`mkdir -p "${path.dirname(filePath)}"`);
            const result = await ssh.execute(`touch "${filePath}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to create file', 'CREATE_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async createDirectory(userId: string, vpsId: string, clientPath: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const dirPath = await resolvePath(ssh, clientPath);

        try {
            const result = await ssh.execute(`mkdir -p "${dirPath}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to create directory', 'CREATE_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async delete(userId: string, vpsId: string, clientPath: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);
        if (filePath === '/') throw new FileManagerError('Cannot delete root directory', 'DELETE_ROOT', 403);

        try {
            const result = await ssh.execute(`rm -rf "${filePath}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to delete', 'DELETE_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async rename(userId: string, vpsId: string, oldPath: string, newPath: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const safeOld = await resolvePath(ssh, oldPath);
        const safeNew = await resolvePath(ssh, newPath);
        if (safeOld === '/') throw new FileManagerError('Cannot rename root', 'RENAME_ROOT', 403);

        try {
            await ssh.execute(`mkdir -p "${path.dirname(safeNew)}"`);
            const result = await ssh.execute(`mv "${safeOld}" "${safeNew}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to rename', 'RENAME_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async copy(userId: string, vpsId: string, srcPath: string, dstPath: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const safeSrc = await resolvePath(ssh, srcPath);
        const safeDst = await resolvePath(ssh, dstPath);

        try {
            await ssh.execute(`mkdir -p "${path.dirname(safeDst)}"`);
            const result = await ssh.execute(`cp -r "${safeSrc}" "${safeDst}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to copy', 'COPY_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async getProperties(userId: string, vpsId: string, clientPath: string): Promise<Record<string, string>> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);

        try {
            const result = await ssh.execute(
                `stat -c "name=%n|size=%s|type=%F|permissions=%A|modified=%y|access=%x" "${filePath}" 2>/dev/null || echo "NOT_FOUND"`
            );
            if (result.stdout.trim() === 'NOT_FOUND') throw new FileManagerError('Path not found', 'NOT_FOUND', 404);

            const props: Record<string, string> = { absolutePath: filePath, extension: path.extname(filePath).slice(1) };
            result.stdout.trim().split('|').forEach((pair) => {
                const eq = pair.indexOf('=');
                if (eq > 0) props[pair.slice(0, eq)] = pair.slice(eq + 1);
            });
            return props;
        } finally {
            ssh.disconnect();
        }
    }

    static async search(userId: string, vpsId: string, searchRoot: string, query: string, extension?: string): Promise<{ path: string; name: string; type: string; size: number }[]> {
        const { ssh } = await connectToVps(userId, vpsId);
        const rootPath = await resolvePath(ssh, searchRoot);

        try {
            const safeQuery = query.replace(/[^a-zA-Z0-9._\-\s]/g, '');
            const safeExt = extension?.replace(/[^a-zA-Z0-9]/g, '');

            let cmd = `find "${rootPath}" -maxdepth 10`;
            if (safeExt) cmd += ` -name "*.${safeExt}"`;
            else if (safeQuery) cmd += ` -iname "*${safeQuery}*"`;
            cmd += ` -ls 2>/dev/null | head -100`;

            const result = await ssh.execute(cmd);
            return result.stdout.trim().split('\n').filter(Boolean).map((line) => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 11) return null;
                const perms = parts[2];
                const size = parseInt(parts[6], 10) || 0;
                const absPath = parts[parts.length - 1];
                return {
                    path: absPath,
                    name: path.basename(absPath),
                    type: perms.startsWith('d') ? 'directory' : 'file',
                    size,
                };
            }).filter(Boolean) as any[];
        } finally {
            ssh.disconnect();
        }
    }

    static async downloadFile(userId: string, vpsId: string, clientPath: string): Promise<{ content: string; size: number; mimeType: string; filename: string }> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);
        const filename = path.basename(filePath);

        try {
            const stat = await ssh.execute(`stat -c "%s %F" "${filePath}" 2>/dev/null || echo "NOT_FOUND"`);
            if (stat.stdout.trim() === 'NOT_FOUND') throw new FileManagerError('File not found', 'NOT_FOUND', 404);
            const [sizeStr, ...tp] = stat.stdout.trim().split(' ');
            if (tp.join(' ').includes('directory')) throw new FileManagerError('Use ZIP download for directories', 'IS_DIRECTORY', 400);
            const size = parseInt(sizeStr, 10) || 0;
            if (size > 100 * 1024 * 1024) throw new FileManagerError('File too large (max 100MB)', 'FILE_TOO_LARGE', 413);

            const result = await ssh.execute(`base64 -w 0 "${filePath}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to read file', 'DOWNLOAD_ERROR', 500);
            return { content: result.stdout.trim(), size, mimeType: getMimeType(filename), filename };
        } finally {
            ssh.disconnect();
        }
    }

    static async downloadZip(userId: string, vpsId: string, clientPath: string): Promise<{ content: string; filename: string }> {
        const { ssh } = await connectToVps(userId, vpsId);
        const filePath = await resolvePath(ssh, clientPath);
        const zipName = `${path.basename(filePath) || 'archive'}.zip`;
        const tmp = `/tmp/df_${Date.now()}.zip`;

        try {
            const zipResult = await ssh.execute(`cd "${path.dirname(filePath)}" && zip -r "${tmp}" "${path.basename(filePath)}" 2>/dev/null`);
            if (zipResult.code !== 0) throw new FileManagerError('Failed to create ZIP', 'ZIP_ERROR', 500);
            const result = await ssh.execute(`base64 -w 0 "${tmp}"`);
            await ssh.execute(`rm -f "${tmp}"`);
            if (result.code !== 0) throw new FileManagerError('Failed to read ZIP', 'ZIP_ERROR', 500);
            return { content: result.stdout.trim(), filename: zipName };
        } finally {
            ssh.disconnect();
        }
    }

    static async uploadFile(userId: string, vpsId: string, clientDir: string, filename: string, contentBase64: string): Promise<void> {
        const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._\- ()[\]]/g, '_');
        const { ssh } = await connectToVps(userId, vpsId);
        const dirPath = await resolvePath(ssh, clientDir);
        const filePath = `${dirPath}/${safeFilename}`.replace(/\/\/+/g, '/');

        try {
            await ssh.execute(`mkdir -p "${dirPath}"`);
            const result = await ssh.execute(`printf '%s' "${contentBase64}" | base64 -d > "${filePath}"`);
            if (result.code !== 0) throw new FileManagerError('Upload failed', 'UPLOAD_ERROR', 500);
        } finally {
            ssh.disconnect();
        }
    }

    static async compress(userId: string, vpsId: string, parentDir: string, paths: string[], archiveName: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const resolvedParent = await resolvePath(ssh, parentDir);
        const safeArchiveName = path.basename(archiveName).replace(/[^a-zA-Z0-9._\- ()[\]]/g, '_');
        if (!safeArchiveName.endsWith('.zip')) {
            throw new FileManagerError('Archive must end with .zip', 'INVALID_ARCHIVE', 400);
        }
        const archivePath = path.join(resolvedParent, safeArchiveName);

        try {
            const exists = await ssh.execute(`test -e "${archivePath}" && echo "EXISTS" || echo "OK"`);
            if (exists.stdout.trim() === 'EXISTS') throw new FileManagerError('Archive file already exists', 'ALREADY_EXISTS', 409);

            const resolvedPaths: string[] = [];
            for (const p of paths) {
                const resolved = await resolvePath(ssh, p);
                resolvedPaths.push(resolved);
            }

            const relativeItems = resolvedPaths.map(p => {
                return `"${path.relative(resolvedParent, p)}"`;
            }).join(' ');

            const cmd = `cd "${resolvedParent}" && zip -r "${safeArchiveName}" ${relativeItems}`;
            const result = await ssh.execute(cmd);
            if (result.code !== 0) {
                throw new FileManagerError(`Failed to compress: ${result.stderr.trim() || result.stdout.trim() || 'zip failed'}`, 'COMPRESS_ERROR', 500);
            }
        } finally {
            ssh.disconnect();
        }
    }

    static async decompress(userId: string, vpsId: string, zipFilePath: string, destDir?: string): Promise<void> {
        const { ssh } = await connectToVps(userId, vpsId);
        const resolvedZipPath = await resolvePath(ssh, zipFilePath);

        try {
            if (!resolvedZipPath.endsWith('.zip')) {
                throw new FileManagerError('Only .zip files can be decompressed', 'INVALID_FILE', 400);
            }

            const exists = await ssh.execute(`test -f "${resolvedZipPath}" && echo "EXISTS" || echo "OK"`);
            if (exists.stdout.trim() !== 'EXISTS') throw new FileManagerError('Zip file not found', 'NOT_FOUND', 404);

            const resolvedDestDir = destDir 
                ? await resolvePath(ssh, destDir) 
                : path.dirname(resolvedZipPath);

            await ssh.execute(`mkdir -p "${resolvedDestDir}"`);

            const cmd = `unzip -o "${resolvedZipPath}" -d "${resolvedDestDir}"`;
            const result = await ssh.execute(cmd);
            if (result.code !== 0) {
                throw new FileManagerError(`Failed to unzip: ${result.stderr.trim() || result.stdout.trim() || 'unzip failed'}`, 'DECOMPRESS_ERROR', 500);
            }
        } finally {
            ssh.disconnect();
        }
    }

    static async getVpsInfo(userId: string, vpsId: string): Promise<{ id: string; name: string; ipAddress: string; username: string }> {
        const vps = await prisma.vPS.findFirst({
            where: { id: vpsId, userId },
            select: { id: true, name: true, ipAddress: true, username: true },
        });
        if (!vps) throw new FileManagerError('VPS not found', 'VPS_NOT_FOUND', 404);
        return vps;
    }
}
