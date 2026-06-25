import type { FileEntry } from '@/lib/api/types';

// ─── File size formatter ───────────────────────────────────────────────────────
export function formatSize(bytes: number): string {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Date formatter ───────────────────────────────────────────────────────────
export function formatDate(value?: string): string {
    if (!value) return '—';
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────
export function joinPath(...parts: string[]): string {
    return parts
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '') || '/';
}

export function parentPath(p: string): string {
    if (!p || p === '/') return '/';
    const parts = p.replace(/\/+$/, '').split('/');
    parts.pop();
    return parts.join('/') || '/';
}

export function basename(p: string): string {
    return p.replace(/\/+$/, '').split('/').pop() || p;
}

// ─── File type helpers ────────────────────────────────────────────────────────
export function isImage(entry: FileEntry): boolean {
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(entry.extension?.toLowerCase());
}

export function isText(entry: FileEntry): boolean {
    const ext = entry.extension?.toLowerCase() || '';
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

export function isPdf(entry: FileEntry): boolean {
    return entry.extension?.toLowerCase() === 'pdf';
}

export function isPreviewable(entry: FileEntry): boolean {
    return entry.type === 'file' && (isImage(entry) || isText(entry));
}

// ─── Language mapping for syntax highlighting ─────────────────────────────────
export function getLanguage(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        js: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', mts: 'typescript',
        jsx: 'jsx', tsx: 'tsx',
        html: 'html', htm: 'html',
        css: 'css', scss: 'scss', sass: 'sass', less: 'less',
        json: 'json', jsonc: 'json',
        yaml: 'yaml', yml: 'yaml',
        md: 'markdown', mdx: 'markdown',
        py: 'python', rb: 'ruby', go: 'go',
        java: 'java', cs: 'csharp', rs: 'rust',
        php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash',
        sql: 'sql', xml: 'xml', toml: 'toml', ini: 'ini',
        graphql: 'graphql', gql: 'graphql', prisma: 'prisma',
        vue: 'html', svelte: 'html', astro: 'html',
        dockerfile: 'dockerfile', env: 'ini', txt: 'plaintext',
        log: 'plaintext', gitignore: 'plaintext',
    };
    return map[ext] || 'plaintext';
}

// ─── File icon color ──────────────────────────────────────────────────────────
export function getFileColor(entry: FileEntry): string {
    if (entry.type === 'directory') return 'text-cyan-300';
    const ext = entry.extension?.toLowerCase();
    if (!ext) return 'text-slate-400';
    if (['js', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-300';
    if (['ts', 'tsx'].includes(ext)) return 'text-blue-400';
    if (['jsx'].includes(ext)) return 'text-cyan-400';
    if (['py'].includes(ext)) return 'text-green-400';
    if (['go'].includes(ext)) return 'text-sky-400';
    if (['rs'].includes(ext)) return 'text-orange-400';
    if (['php'].includes(ext)) return 'text-purple-400';
    if (['css', 'scss', 'sass'].includes(ext)) return 'text-pink-400';
    if (['html', 'htm'].includes(ext)) return 'text-rose-400';
    if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return 'text-amber-300';
    if (['md', 'mdx'].includes(ext)) return 'text-slate-300';
    if (['sh', 'bash'].includes(ext)) return 'text-emerald-400';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'text-violet-400';
    if (['pdf'].includes(ext)) return 'text-red-400';
    if (['zip', 'tar', 'gz', '7z'].includes(ext)) return 'text-yellow-500';
    return 'text-slate-400';
}

// ─── Validate names ───────────────────────────────────────────────────────────
export function validateName(name: string): string | null {
    if (!name.trim()) return 'Name cannot be empty';
    if (name.length > 255) return 'Name is too long (max 255 chars)';
    if (/[<>:"|?*\x00-\x1f]/.test(name)) return 'Name contains invalid characters';
    if (name === '.' || name === '..') return 'Name is reserved';
    return null;
}

// ─── Clipboard item type ──────────────────────────────────────────────────────
export type FMClipboard = {
    paths: string[];
    operation: 'copy' | 'cut';
};
