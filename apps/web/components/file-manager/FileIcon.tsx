'use client';

import React from 'react';
import {
    File, Folder, FolderOpen, Image, Code, FileText, FileCode,
    Archive, Music, Video, Database,
} from 'lucide-react';
import type { FileEntry } from '@/lib/api/types';
import { getFileColor } from './utils';

interface FileIconProps {
    entry: FileEntry;
    isOpen?: boolean;
    size?: number;
    className?: string;
}

export function FileIcon({ entry, isOpen = false, size = 18, className = '' }: FileIconProps) {
    const color = getFileColor(entry);
    const cls = `${color} ${className} shrink-0`;

    if (entry.type === 'directory') {
        return isOpen
            ? <FolderOpen size={size} className={cls} />
            : <Folder size={size} className={cls} />;
    }

    const ext = entry.extension?.toLowerCase();

    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
        // eslint-disable-next-line @next/next/no-img-element
        return <Image size={size} className={cls} aria-hidden="true" />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'cs', 'php', 'rb', 'sh', 'bash'].includes(ext)) {
        return <Code size={size} className={cls} />;
    }
    if (['html', 'css', 'scss', 'xml', 'vue', 'svelte', 'astro'].includes(ext)) {
        return <FileCode size={size} className={cls} />;
    }
    if (['json', 'yaml', 'yml', 'toml', 'prisma', 'graphql'].includes(ext)) {
        return <Database size={size} className={cls} />;
    }
    if (['md', 'mdx', 'txt', 'log'].includes(ext)) {
        return <FileText size={size} className={cls} />;
    }
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
        return <Archive size={size} className={cls} />;
    }
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
        return <Music size={size} className={cls} />;
    }
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
        return <Video size={size} className={cls} />;
    }

    return <File size={size} className={cls} />;
}
