import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';

export function sanitizeName(name: string) {
    const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return clean || 'project';
}

export function sanitizeFileName(name: string) {
    return name.replace(/[^A-Za-z0-9._-]/g, '');
}

export function normalizedArchiveName(name: string) {
    const clean = sanitizeFileName(name).toLowerCase();
    if (clean.endsWith('.tar.gz')) return 'upload.tar.gz';
    if (clean.endsWith('.tgz')) return 'upload.tgz';
    return 'upload.zip';
}

export function shellQuote(value: string | number) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function shellPath(value: string) {
    return value.replace(/[^A-Za-z0-9._-]/g, '');
}

export function extractRepoFullName(repositoryUrl: string) {
    const match = repositoryUrl.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s.]+)(?:\.git)?/i);
    if (!match?.groups) return null;
    return `${match.groups.owner}/${match.groups.repo}`;
}

export function sanitizeDomain(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9.-]/g, '');
}

export function computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

export function safeExtractCommand(archivePath: string, destination: string) {
    return `python3 - <<'PY'\nimport os, tarfile, zipfile, pathlib, sys\narchive = ${JSON.stringify(archivePath)}\ndest = pathlib.Path(${JSON.stringify(destination)}).resolve()\ndest.mkdir(parents=True, exist_ok=True)\nmax_depth = 12\nmax_entries = 20000\n\ndef safe_target(name):\n    target = (dest / name).resolve()\n    if not str(target).startswith(str(dest) + os.sep) and target != dest:\n        raise Exception('unsafe archive path: ' + name)\n    if len(pathlib.PurePosixPath(name).parts) > max_depth:\n        raise Exception('archive nesting is too deep: ' + name)\n\nif archive.endswith('.zip'):\n    with zipfile.ZipFile(archive) as z:\n        infos = z.infolist()\n        if len(infos) > max_entries:\n            raise Exception('archive contains too many files')\n        for info in infos:\n            safe_target(info.filename)\n        z.extractall(dest)\nelif archive.endswith('.tar.gz') or archive.endswith('.tgz'):\n    with tarfile.open(archive, 'r:gz') as t:\n        members = t.getmembers()\n        if len(members) > max_entries:\n            raise Exception('archive contains too many files')\n        for member in members:\n            safe_target(member.name)\n        t.extractall(dest)\nelse:\n    raise Exception('unsupported archive type')\nPY`;
}

