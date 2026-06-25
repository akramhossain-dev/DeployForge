'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/client';
import { useToastStore } from '@/lib/store/useToastStore';
import type { DirectoryListing, FileReadResult, FileDownloadResult, ZipDownloadResult, FileProperties, FileSearchResult } from '@/lib/api/types';

function toast(title: string, description: string, severity: 'success' | 'error' = 'success') {
    useToastStore.getState().addToast({ title, description, severity });
}

const BASE = (vpsId: string) => `/file-manager/${vpsId}`;

export const fmKeys = {
    all: (vpsId: string) => ['fm', vpsId] as const,
    listing: (vpsId: string, path: string) => ['fm', vpsId, 'list', path] as const,
    file: (vpsId: string, path: string) => ['fm', vpsId, 'read', path] as const,
    props: (vpsId: string, path: string) => ['fm', vpsId, 'props', path] as const,
    search: (vpsId: string, q: string, ext?: string) => ['fm', vpsId, 'search', q, ext ?? ''] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useDirectoryListing(vpsId: string, path: string, enabled = true) {
    return useQuery({
        queryKey: fmKeys.listing(vpsId, path),
        queryFn: () => api.get<DirectoryListing>(`${BASE(vpsId)}/list?path=${encodeURIComponent(path)}`),
        enabled: enabled && !!vpsId,
        staleTime: 10000,
        retry: false,
    });
}

export function useFileContent(vpsId: string, path: string, enabled = true) {
    return useQuery({
        queryKey: fmKeys.file(vpsId, path),
        queryFn: () => api.get<FileReadResult>(`${BASE(vpsId)}/read?path=${encodeURIComponent(path)}`),
        enabled: enabled && !!vpsId && !!path,
        staleTime: 30000,
        retry: false,
    });
}

export function useFileProperties(vpsId: string, path: string, enabled = true) {
    return useQuery({
        queryKey: fmKeys.props(vpsId, path),
        queryFn: () => api.get<FileProperties>(`${BASE(vpsId)}/properties?path=${encodeURIComponent(path)}`),
        enabled: enabled && !!vpsId && !!path,
        staleTime: 15000,
        retry: false,
    });
}

export function useFileSearch(vpsId: string, rootPath: string, query: string, extension?: string, enabled = true) {
    return useQuery({
        queryKey: fmKeys.search(vpsId, query, extension),
        queryFn: () => {
            const p = new URLSearchParams({ path: rootPath });
            if (query) p.set('query', query);
            if (extension) p.set('extension', extension);
            return api.get<FileSearchResult[]>(`${BASE(vpsId)}/search?${p.toString()}`);
        },
        enabled: enabled && !!vpsId && (!!query || !!extension),
        staleTime: 5000,
        retry: false,
    });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateEntry(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ path, type }: { path: string; type: 'file' | 'directory' }) =>
            api.post<{ message: string }>(`${BASE(vpsId)}/create`, { path, type }),
        onSuccess: (_, { type }) => {
            toast(`${type === 'directory' ? 'Folder' : 'File'} Created`, 'Created successfully');
            qc.invalidateQueries({ queryKey: fmKeys.all(vpsId) });
        },
        onError: (e: any) => toast('Create Failed', e?.message || 'Failed', 'error'),
    });
}

export function useSaveFile(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ path, content }: { path: string; content: string }) =>
            api.put<{ message: string }>(`${BASE(vpsId)}/save`, { path, content }),
        onSuccess: (_d, { path }) => {
            toast('Saved', 'File saved successfully');
            qc.invalidateQueries({ queryKey: fmKeys.file(vpsId, path) });
        },
        onError: (e: any) => toast('Save Failed', e?.message || 'Failed', 'error'),
    });
}

export function useRenameEntry(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
            api.put<{ message: string }>(`${BASE(vpsId)}/rename`, { oldPath, newPath }),
        onSuccess: () => {
            toast('Renamed', 'Renamed successfully');
            qc.invalidateQueries({ queryKey: fmKeys.all(vpsId) });
        },
        onError: (e: any) => toast('Rename Failed', e?.message || 'Failed', 'error'),
    });
}

export function useCopyEntry(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ srcPath, dstPath }: { srcPath: string; dstPath: string }) =>
            api.put<{ message: string }>(`${BASE(vpsId)}/copy`, { srcPath, dstPath }),
        onSuccess: () => {
            toast('Copied', 'Copied successfully');
            qc.invalidateQueries({ queryKey: fmKeys.all(vpsId) });
        },
        onError: (e: any) => toast('Copy Failed', e?.message || 'Failed', 'error'),
    });
}

export function useDeleteEntries(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (paths: string[]) =>
            api.delete<{ message: string }>(`${BASE(vpsId)}/delete`, { paths }),
        onSuccess: (_d, paths) => {
            toast('Deleted', `${paths.length} item${paths.length > 1 ? 's' : ''} deleted`);
            qc.invalidateQueries({ queryKey: fmKeys.all(vpsId) });
        },
        onError: (e: any) => toast('Delete Failed', e?.message || 'Failed', 'error'),
    });
}

export function useUploadFile(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ file, path }: { file: File; path: string }) => {
            const form = new FormData();
            form.set('file', file);
            return api.post<{ message: string; filename: string }>(
                `${BASE(vpsId)}/upload?path=${encodeURIComponent(path)}`,
                form
            );
        },
        onSuccess: (_d, { path }) => {
            toast('Uploaded', 'File uploaded');
            qc.invalidateQueries({ queryKey: fmKeys.listing(vpsId, path) });
        },
        onError: (e: any) => toast('Upload Failed', e?.message || 'Failed', 'error'),
    });
}

export function useCompress(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ parentDir, paths, archiveName }: { parentDir: string; paths: string[]; archiveName: string }) =>
            api.post<{ message: string }>(`${BASE(vpsId)}/compress`, { parentDir, paths, archiveName }),
        onSuccess: () => {
            toast('Compressed', 'Files compressed to ZIP successfully');
            qc.invalidateQueries({ queryKey: fmKeys.all(vpsId) });
        },
        onError: (e: any) => toast('Compression Failed', e?.message || 'Failed', 'error'),
    });
}

export function useDecompress(vpsId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ zipFilePath, destDir }: { zipFilePath: string; destDir?: string }) =>
            api.post<{ message: string }>(`${BASE(vpsId)}/decompress`, { zipFilePath, destDir }),
        onSuccess: () => {
            toast('Decompressed', 'ZIP file unzipped successfully');
            qc.invalidateQueries({ queryKey: fmKeys.all(vpsId) });
        },
        onError: (e: any) => toast('Decompression Failed', e?.message || 'Failed', 'error'),
    });
}

// ─── Download helpers ─────────────────────────────────────────────────────────

export async function downloadFile(vpsId: string, clientPath: string): Promise<void> {
    const filename = clientPath.split('/').pop() || 'file';
    useToastStore.getState().addToast({
        title: 'Download Started',
        description: `Downloading ${filename} from VPS...`,
        severity: 'success',
    });
    try {
        const data = await api.get<FileDownloadResult>(`${BASE(vpsId)}/download?path=${encodeURIComponent(clientPath)}`);
        const bytes = Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: data.mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = data.filename; a.click();
        URL.revokeObjectURL(url);
        useToastStore.getState().addToast({
            title: 'Download Complete',
            description: `Successfully downloaded ${data.filename}`,
            severity: 'success',
        });
    } catch (e: any) {
        useToastStore.getState().addToast({
            title: 'Download Failed',
            description: e?.message || `Failed to download ${filename}`,
            severity: 'error',
        });
    }
}

export async function downloadZip(vpsId: string, clientPath: string): Promise<void> {
    const filename = (clientPath.split('/').pop() || 'folder') + '.zip';
    useToastStore.getState().addToast({
        title: 'Download Started',
        description: `Compressing and downloading ${filename}...`,
        severity: 'success',
    });
    try {
        const data = await api.get<ZipDownloadResult>(`${BASE(vpsId)}/download-zip?path=${encodeURIComponent(clientPath)}`);
        const bytes = Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = data.filename; a.click();
        URL.revokeObjectURL(url);
        useToastStore.getState().addToast({
            title: 'Download Complete',
            description: `Successfully downloaded ${data.filename}`,
            severity: 'success',
        });
    } catch (e: any) {
        useToastStore.getState().addToast({
            title: 'Download Failed',
            description: e?.message || `Failed to download ${filename}`,
            severity: 'error',
        });
    }
}
