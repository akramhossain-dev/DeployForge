'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    useDeploymentEnv,
    useDeploymentEnvHistory,
    useRedeploy,
    useUpdateDeploymentEnv,
    type EnvFile,
} from '@/hooks/useDeployForgeData';
import { useToastStore } from '@/lib/store/useToastStore';

export function useDeploymentEnvironmentEditor(deploymentId: string, enabled: boolean) {
    const router = useRouter();
    const addToast = useToastStore((state) => state.addToast);
    const [envModalOpen, setEnvModalOpen] = useState(false);
    const { data: decEnvResponse, isLoading: envLoading } = useDeploymentEnv(deploymentId, enabled);
    const updateEnv = useUpdateDeploymentEnv();
    const envHistory = useDeploymentEnvHistory(deploymentId, enabled);
    const redeploy = useRedeploy();
    const [draftFiles, setDraftFiles] = useState<EnvFile[]>([{ path: '.env', variables: {} }]);
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const [isBulkEdit, setIsBulkEdit] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'none' | 'key'>('none');
    const [newFilePath, setNewFilePath] = useState('');
    const [showAddFile, setShowAddFile] = useState(false);
    const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null);
    const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);
    const [pendingImportVars, setPendingImportVars] = useState<Record<string, string>>({});
    const [historyOpen, setHistoryOpen] = useState(false);
    const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
    const [renamingPath, setRenamingPath] = useState('');

    useEffect(() => {
        if (decEnvResponse?.files?.length) setDraftFiles(structuredClone(decEnvResponse.files));
        else if (envModalOpen && draftFiles.length === 0) setDraftFiles([{ path: '.env', variables: {} }]);
    }, [decEnvResponse, envModalOpen, draftFiles.length]);

    const activeFile = draftFiles[activeFileIndex] || { path: '.env', variables: {} };
    useEffect(() => {
        if (isBulkEdit) setBulkText(Object.entries(activeFile.variables || {}).map(([key, value]) => `${key}=${value}`).join('\n'));
    }, [isBulkEdit, activeFileIndex, activeFile.variables]);

    const validateKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    const validatePath = (filePath: string) => {
        if (!filePath.trim() || filePath.startsWith('/') || filePath.startsWith('\\') || /^[a-zA-Z]:/.test(filePath)) return false;
        if (filePath.split(/[/\\]/).some((part) => part === '..')) return false;
        const normalized = filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        return (normalized.split('/').pop() || '').startsWith('.env');
    };

    const updateActiveFile = (mutate: (variables: Record<string, string>) => Record<string, string>) => {
        setDraftFiles((files) => files.map((file, index) => index === activeFileIndex ? { ...file, variables: mutate({ ...file.variables }) } : file));
    };
    const handleUpdateVarKey = (oldKey: string, newKey: string) => {
        if (oldKey === newKey) return;
        updateActiveFile((variables) => { const value = variables[oldKey]; delete variables[oldKey]; variables[newKey] = value || ''; return variables; });
    };
    const handleUpdateVarValue = (key: string, value: string) => updateActiveFile((variables) => ({ ...variables, [key]: value }));
    const handleDeleteVar = (key: string) => updateActiveFile((variables) => { delete variables[key]; return variables; });
    const uniqueKey = (base: string, variables: Record<string, string>) => {
        let candidate = base;
        let index = 1;
        while (candidate in variables) candidate = `${base}_${index++}`;
        return candidate;
    };
    const handleAddVar = () => updateActiveFile((variables) => ({ ...variables, [uniqueKey('NEW_VARIABLE', variables)]: '' }));
    const handleDuplicateVar = (key: string, value: string) => updateActiveFile((variables) => ({ ...variables, [uniqueKey(`${key}_COPY`, variables)]: value }));

    const handleBulkImport = () => {
        const parsed: Record<string, string> = {};
        for (const line of bulkText.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const separator = trimmed.indexOf('=');
            if (separator <= 0) continue;
            const key = trimmed.slice(0, separator).trim();
            if (validateKey(key)) parsed[key] = trimmed.slice(separator + 1).trim();
        }
        if (Object.keys(parsed).some((key) => key in (activeFile.variables || {}))) {
            setPendingImportVars(parsed);
            setShowConfirmOverwrite(true);
            return;
        }
        updateActiveFile((variables) => ({ ...variables, ...parsed }));
        setIsBulkEdit(false);
    };
    const confirmBulkImport = () => {
        updateActiveFile((variables) => ({ ...variables, ...pendingImportVars }));
        setShowConfirmOverwrite(false);
        setPendingImportVars({});
        setIsBulkEdit(false);
    };
    const handleAddFile = () => {
        if (!validatePath(newFilePath)) return addToast({ title: 'Invalid Path', description: 'File path must be relative and start with .env (e.g. apps/client/.env).', severity: 'error' });
        if (draftFiles.some((file) => file.path === newFilePath)) return addToast({ title: 'Duplicate Path', description: 'This environment file path already exists.', severity: 'error' });
        setDraftFiles((files) => [...files, { path: newFilePath, variables: {} }]);
        setActiveFileIndex(draftFiles.length);
        setNewFilePath('');
        setShowAddFile(false);
    };
    const handleRenameFile = (index: number) => {
        if (!validatePath(renamingPath)) return addToast({ title: 'Invalid Path', description: 'File path must be relative and start with .env.', severity: 'error' });
        if (draftFiles.some((file, fileIndex) => file.path === renamingPath && fileIndex !== index)) return addToast({ title: 'Duplicate Path', description: 'This environment file path already exists.', severity: 'error' });
        setDraftFiles((files) => files.map((file, fileIndex) => fileIndex === index ? { ...file, path: renamingPath } : file));
        setRenamingIndex(null);
        setRenamingPath('');
    };
    const handleDeleteFile = (index: number) => {
        if (draftFiles[index]?.path === '.env' || draftFiles.length <= 1) return addToast({ title: 'Delete Rejected', description: 'The root .env file and the final environment file cannot be deleted.', severity: 'error' });
        setDraftFiles((files) => files.filter((_, fileIndex) => fileIndex !== index));
        setActiveFileIndex(0);
    };
    const validateDraft = () => {
        for (const file of draftFiles) {
            if (!validatePath(file.path)) { addToast({ title: 'Validation Error', description: `Invalid file path: ${file.path}`, severity: 'error' }); return false; }
            for (const key of Object.keys(file.variables)) {
                if (!validateKey(key)) { addToast({ title: 'Validation Error', description: `Invalid variable key "${key}" in ${file.path}`, severity: 'error' }); return false; }
            }
        }
        return true;
    };
    const save = () => updateEnv.mutateAsync({ deploymentId, env: { version: 2, files: draftFiles } });
    const handleSaveChanges = async () => { if (!validateDraft()) return; try { await save(); setEnvModalOpen(false); } catch {} };
    const handleSaveAndRedeploy = async () => {
        if (!validateDraft()) return;
        try { await save(); const next = await redeploy.mutateAsync({ deploymentId }); setEnvModalOpen(false); router.push(`/deployments/${next.id}`); } catch {}
    };
    const filteredVariables = useMemo(() => {
        const variables = Object.entries(activeFile.variables || {}).filter(([key]) => key.toLowerCase().includes(searchQuery.toLowerCase()));
        if (sortBy === 'key') variables.sort(([left], [right]) => left.localeCompare(right));
        return variables;
    }, [activeFile.variables, searchQuery, sortBy]);

    return {
        envModalOpen, setEnvModalOpen, decEnvResponse, envLoading, updateEnv, envHistory, redeploy,
        draftFiles, setDraftFiles, activeFileIndex, setActiveFileIndex, activeFile,
        isBulkEdit, setIsBulkEdit, bulkText, setBulkText, searchQuery, setSearchQuery, sortBy, setSortBy,
        newFilePath, setNewFilePath, showAddFile, setShowAddFile, historyPreviewId, setHistoryPreviewId,
        showConfirmOverwrite, setShowConfirmOverwrite, historyOpen, setHistoryOpen,
        renamingIndex, setRenamingIndex, renamingPath, setRenamingPath, filteredVariables,
        handleUpdateVarKey, handleUpdateVarValue, handleDeleteVar, handleAddVar, handleDuplicateVar,
        handleBulkImport, confirmBulkImport, handleAddFile, handleRenameFile, handleDeleteFile,
        handleSaveChanges, handleSaveAndRedeploy,
    };
}
