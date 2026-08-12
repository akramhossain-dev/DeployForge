'use client';

import { useMemo, useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
    CheckCircle2,
    Github,
    PackagePlus,
    Plus,
    Trash2,
    UploadCloud,
    Edit2,
    Search,
    ArrowUpDown,
    ArrowLeft,
    Loader2,
    Eye,
    EyeOff,
    Check,
    X,
    Terminal,
    AlertCircle,
    Info,
    Copy
} from 'lucide-react';
import {
    useCreateGithubDeployment,
    useCreateUploadDeployment,
    useRepositories,
    useVpsList,
    type EnvFile
} from '@/hooks/useDeployForgeData';
import { useToastStore } from '@/lib/store/useToastStore';
import { StatusBadge } from '@/components/ui';

type EnvName = 'production' | 'development';
type ExecutionMode = 'production' | 'sandbox';

const INPUT_STYLE =
    'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function isValidDomainInput(input: string): boolean {
    if (!input || input.trim().length === 0) return false;
    const clean = input.trim().toLowerCase();
    if (clean.includes('://') || clean.includes('/') || clean.includes(' ') || clean.includes(':')) return false;
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i.test(clean);
}

function PasswordInput({
    value,
    onChange,
    placeholder,
    className
}: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
}) {
    const [show, setShow] = useState(false);

    return (
        <div className="relative w-full">
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={className || INPUT_STYLE}
            />
            <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666666] hover:text-white transition-colors"
                title={show ? 'Hide value' : 'Show value'}
            >
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
        </div>
    );
}

export default function NewDeploymentPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                    <Loader2 size={16} className="animate-spin mr-2" /> Loading deployment setup wizard...
                </div>
            }
        >
            <NewDeploymentPageContent />
        </Suspense>
    );
}

function NewDeploymentPageContent() {
    const [tab, setTab] = useState<'github' | 'upload'>('github');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div className="flex items-center gap-3">
                    <Link href="/deployments">
                        <button className="flex h-8 w-8 items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] text-[#A1A1A1] hover:text-white transition-colors">
                            <ArrowLeft size={14} />
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                            Create Deployment
                        </h1>
                        <p className="mt-1 text-xs text-[#A1A1A1]">
                            Select a release source, choose your VPS host node, and configure execution parameters.
                        </p>
                    </div>
                </div>
            </div>

            {/* Source Tab Selector */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4 space-y-3 font-mono text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                    Step 1: Select Release Source
                </p>
                <div className="grid grid-cols-2 gap-2 rounded border border-[#1F1F1F] bg-[#000000] p-1">
                    <button
                        type="button"
                        onClick={() => setTab('github')}
                        className={clsx(
                            'flex h-9 items-center justify-center gap-2 rounded font-semibold transition-colors',
                            tab === 'github' ? 'bg-[#111111] text-white' : 'text-[#A1A1A1] hover:text-white'
                        )}
                    >
                        <Github size={14} />
                        <span>GitHub Repository</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('upload')}
                        className={clsx(
                            'flex h-9 items-center justify-center gap-2 rounded font-semibold transition-colors',
                            tab === 'upload' ? 'bg-[#111111] text-white' : 'text-[#A1A1A1] hover:text-white'
                        )}
                    >
                        <UploadCloud size={14} />
                        <span>File Archive Upload</span>
                    </button>
                </div>
            </div>

            {tab === 'github' ? <GithubDeployForm /> : <UploadDeployForm />}
        </div>
    );
}

function GithubDeployForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const repoParam = searchParams.get('repo');
    const branchParam = searchParams.get('branch');

    const repositories = useRepositories();
    const vps = useVpsList();
    const deploy = useCreateGithubDeployment();

    const repositoryRef = useRef<HTMLSelectElement>(null);
    const vpsRef = useRef<HTMLSelectElement>(null);
    const branchRef = useRef<HTMLSelectElement>(null);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [repositoryId, setRepositoryId] = useState('');
    const [branch, setBranch] = useState('main');

    useEffect(() => {
        if (repositories.data && repoParam) {
            const matchedRepo = repositories.data.find(
                (r) => r.fullName.toLowerCase() === repoParam.toLowerCase() || r.id === repoParam
            );
            if (matchedRepo) {
                setRepositoryId(matchedRepo.id);
                setBranch(branchParam || matchedRepo.defaultBranch || 'main');
            }
        }
    }, [repositories.data, repoParam, branchParam]);

    const [environment, setEnvironment] = useState<EnvName>('production');
    const [vpsId, setVpsId] = useState('');
    const [autoDeploy, setAutoDeploy] = useState(true);
    const [hostType, setHostType] = useState<'ip' | 'domain'>('ip');
    const [domainName, setDomainName] = useState('');
    const [mode, setMode] = useState<ExecutionMode>('production');
    const [useEnv, setUseEnv] = useState(false);
    const [envFiles, setEnvFiles] = useState<EnvFile[]>([{ path: '.env', variables: {} }]);

    const selectedRepo = repositories.data?.find((repo) => repo.id === repositoryId);
    const selectedVps = vps.data?.find((server) => server.id === vpsId);
    const branchOptions = useMemo(
        () => Array.from(new Set(['main', 'master', selectedRepo?.defaultBranch].filter(Boolean) as string[])),
        [selectedRepo?.defaultBranch]
    );
    const domainInvalid = hostType === 'domain' && !isValidDomainInput(domainName);
    const isSubmitting = deploy.isPending;

    function validate(): boolean {
        const newErrors: Record<string, string> = {};
        let isValid = true;

        if (!repositoryId) {
            newErrors.repository = 'Please select a repository';
            isValid = false;
        }
        if (!vpsId) {
            newErrors.vps = 'Please select a deployment target node';
            isValid = false;
        }
        if (!branch) {
            newErrors.branch = 'Please select a branch';
            isValid = false;
        }
        if (mode === 'production' && hostType === 'domain') {
            if (!domainName) {
                newErrors.domain = 'Domain name is required when using Custom Domain';
                isValid = false;
            } else if (domainInvalid) {
                newErrors.domain = 'Please enter a valid domain (e.g. app.example.com)';
                isValid = false;
            }
        }

        if (useEnv) {
            const totalVars = envFiles.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0);
            if (envFiles.length > 20) {
                newErrors.env = 'Maximum limit of 20 environment files exceeded';
                isValid = false;
            } else if (totalVars > 200) {
                newErrors.env = 'Maximum limit of 200 environment variables exceeded';
                isValid = false;
            } else {
                const validateKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
                const validatePath = (path: string) => {
                    if (!path.trim()) return false;
                    if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
                    if (path.split(/[/\\]/).some((p) => p === '..')) return false;
                    const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
                    const fileName = normalized.split('/').pop() || '';
                    return fileName.startsWith('.env');
                };
                for (const file of envFiles) {
                    if (!validatePath(file.path)) {
                        newErrors.env = `Invalid path: ${file.path}. Must end with a file starting with .env and contain no traversal.`;
                        isValid = false;
                        break;
                    }
                    const keys = Object.keys(file.variables || {});
                    const invalidKey = keys.find((k) => !validateKey(k));
                    if (invalidKey) {
                        newErrors.env = `Invalid variable key "${invalidKey}" in ${file.path}. Must start with a letter/underscore and contain only A-Z, 0-9, _.`;
                        isValid = false;
                        break;
                    }
                }
            }
        }

        setErrors(newErrors);

        if (!isValid) {
            if (newErrors.repository) repositoryRef.current?.focus();
            else if (newErrors.vps) vpsRef.current?.focus();
            else if (newErrors.branch) branchRef.current?.focus();
        }

        return isValid;
    }

    async function submit() {
        if (!validate()) return;
        try {
            const deployment = await deploy.mutateAsync({
                repositoryId,
                vpsId,
                branch,
                environment,
                autoDeploy,
                domainName: mode === 'production' && hostType === 'domain' ? domainName : undefined,
                env: useEnv ? { version: 2, files: envFiles } : { version: 2, files: [] },
                mode
            });
            router.push(`/deployments/${deployment.id}`);
        } catch (err) {}
    }

    if (repositories.isLoading || vps.isLoading) {
        return (
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mx-auto mb-2 text-[#A1A1A1]" /> Loading synchronized repositories and VPS targets...
            </div>
        );
    }

    if (!repositories.data?.length) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <Github size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">No synced repositories found</p>
                <p className="mt-1">Connect your GitHub account and sync repositories before creating a deployment.</p>
                <Link
                    href="/repositories"
                    className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-3 font-semibold text-black hover:bg-[#E5E5E5] transition-colors"
                >
                    Sync GitHub Repositories
                </Link>
            </div>
        );
    }

    if (!vps.data?.length) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <PackagePlus size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">No VPS target nodes available</p>
                <p className="mt-1">Register an Ubuntu VPS server node before creating a deployment.</p>
                <Link
                    href="/vps"
                    className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-3 font-semibold text-black hover:bg-[#E5E5E5] transition-colors"
                >
                    Add VPS Server Node
                </Link>
            </div>
        );
    }

    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-6 font-mono text-xs">
            {deploy.isError && (
                <div className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                    Deployment trigger failed: {(deploy.error as Error)?.message}
                </div>
            )}

            {/* Grid Fields */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Repository
                    </label>
                    <select
                        ref={repositoryRef}
                        value={repositoryId}
                        onChange={(e) => {
                            setRepositoryId(e.target.value);
                            const repo = repositories.data?.find((item) => item.id === e.target.value);
                            if (repo) setBranch(repo.defaultBranch);
                            if (errors.repository) setErrors({ ...errors, repository: '' });
                        }}
                        className={clsx(INPUT_STYLE, errors.repository && 'border-rose-500')}
                        disabled={isSubmitting}
                    >
                        <option value="">Select GitHub repository</option>
                        {repositories.data.map((repo) => (
                            <option key={repo.id} value={repo.id}>
                                {repo.fullName}
                            </option>
                        ))}
                    </select>
                    {errors.repository && <p className="mt-1 text-xs text-rose-400">{errors.repository}</p>}
                </div>

                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Deployment Target Node (VPS)
                    </label>
                    <select
                        ref={vpsRef}
                        value={vpsId}
                        onChange={(e) => {
                            setVpsId(e.target.value);
                            if (errors.vps) setErrors({ ...errors, vps: '' });
                        }}
                        className={clsx(INPUT_STYLE, errors.vps && 'border-rose-500')}
                        disabled={isSubmitting}
                    >
                        <option value="">Select VPS Server Node</option>
                        {vps.data.map((server) => (
                            <option key={server.id} value={server.id}>
                                {server.name} ({server.ipAddress})
                            </option>
                        ))}
                    </select>
                    {errors.vps && <p className="mt-1 text-xs text-rose-400">{errors.vps}</p>}
                </div>

                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Branch
                    </label>
                    <select
                        ref={branchRef}
                        value={branch}
                        onChange={(e) => {
                            setBranch(e.target.value);
                            if (errors.branch) setErrors({ ...errors, branch: '' });
                        }}
                        className={clsx(INPUT_STYLE, errors.branch && 'border-rose-500')}
                        disabled={isSubmitting}
                    >
                        {branchOptions.map((item) => (
                            <option key={item} value={item}>
                                {item}
                            </option>
                        ))}
                    </select>
                    {errors.branch && <p className="mt-1 text-xs text-rose-400">{errors.branch}</p>}
                </div>

                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Environment
                    </label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value as EnvName)}
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    >
                        <option value="production">Production</option>
                        <option value="development">Development</option>
                    </select>
                </div>
            </div>

            {/* Webhook Status Panel */}
            <div className="flex flex-col gap-3 rounded-md border border-[#1F1F1F] bg-[#111111] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-semibold text-white">GitHub Webhook Status</p>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        {selectedRepo?.webhookId ? 'Connected for real-time push events' : 'Not connected yet'}
                    </p>
                    {!selectedRepo?.webhookId && autoDeploy ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-amber-400/90">
                            GitHub requires a public HTTPS API URL for automated webhook registration. The deployment will proceed regardless.
                        </p>
                    ) : null}
                </div>
                <StatusBadge status={selectedRepo?.webhookId ? 'RUNNING' : 'PENDING'} />
            </div>

            {/* Auto Deploy Checkbox */}
            <label className="flex items-center justify-between gap-4 rounded-md border border-[#1F1F1F] bg-[#111111] p-4 cursor-pointer">
                <div>
                    <span className="block font-semibold text-white">Auto Deploy on Push</span>
                    <span className="mt-1 block text-xs text-[#A1A1A1]">
                        Automatically trigger a rebuild and redeploy whenever commits are pushed to the selected branch.
                    </span>
                </div>
                <input
                    type="checkbox"
                    checked={autoDeploy && mode === 'production'}
                    disabled={mode === 'sandbox' || isSubmitting}
                    onChange={(e) => setAutoDeploy(e.target.checked)}
                    className="h-4 w-4 accent-white rounded border-[#1F1F1F]"
                />
            </label>

            {/* Execution Mode Selector */}
            <ExecutionModeSelector mode={mode} setMode={setMode} />

            {/* Mode Banner */}
            <div
                className={clsx(
                    'rounded-md border p-3 text-xs leading-relaxed',
                    mode === 'sandbox'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                )}
            >
                {mode === 'sandbox'
                    ? 'Temporary Sandbox Environment: Ephemeral container, direct port access, no domain binding, and automatic cleanup.'
                    : 'Production Environment: Persistent container release with rollback history, domain routing, and health checks.'}
            </div>

            {/* Hosting Configuration */}
            {mode === 'production' ? (
                <HostingConfiguration
                    hostType={hostType}
                    setHostType={setHostType}
                    domainName={domainName}
                    setDomainName={setDomainName}
                    ipPreview={selectedVps ? `http://${selectedVps.ipAddress}:auto` : 'Select a VPS to preview IP host binding'}
                    error={errors.domain}
                />
            ) : (
                <div className="rounded-md border border-[#1F1F1F] bg-[#111111] p-4 text-xs text-[#A1A1A1]">
                    <p className="font-semibold text-white">Sandbox Ephemeral Networking</p>
                    <p className="mt-1">Sandbox runs use direct host port routing and bypass Nginx proxying and domain attachments.</p>
                </div>
            )}

            {/* Environment Variables Setup Flow */}
            <EnvironmentVariablesEditor
                enabled={useEnv}
                setEnabled={setUseEnv}
                files={envFiles}
                setFiles={setEnvFiles}
                error={errors.env}
            />

            {/* Submit Action */}
            <div className="border-t border-[#1F1F1F] pt-4 flex justify-end">
                <button
                    type="button"
                    onClick={submit}
                    disabled={isSubmitting}
                    className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                >
                    {isSubmitting ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <>
                            <Github size={14} />
                            <span>{mode === 'sandbox' ? 'Run Sandbox Test' : 'Trigger Release'}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function UploadDeployForm() {
    const router = useRouter();
    const vps = useVpsList();
    const deploy = useCreateUploadDeployment();

    const vpsRef = useRef<HTMLSelectElement>(null);
    const projectNameRef = useRef<HTMLInputElement>(null);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [file, setFile] = useState<File | null>(null);
    const [projectName, setProjectName] = useState('');
    const [environment, setEnvironment] = useState<EnvName>('production');
    const [vpsId, setVpsId] = useState('');
    const [hostType, setHostType] = useState<'ip' | 'domain'>('ip');
    const [domainName, setDomainName] = useState('');
    const [mode, setMode] = useState<ExecutionMode>('production');
    const [useEnv, setUseEnv] = useState(false);
    const [envFiles, setEnvFiles] = useState<EnvFile[]>([{ path: '.env', variables: {} }]);

    const isValid = !!file && /\.(zip|tar\.gz|tgz)$/i.test(file.name);
    const progress = deploy.isPending ? 75 : deploy.isSuccess ? 100 : file ? 35 : 0;
    const selectedVps = vps.data?.find((server) => server.id === vpsId);
    const domainInvalid = hostType === 'domain' && !isValidDomainInput(domainName);
    const isSubmitting = deploy.isPending;

    function validate(): boolean {
        const newErrors: Record<string, string> = {};
        let isValidForm = true;

        if (!file) {
            newErrors.file = 'Please upload a deployment archive';
            isValidForm = false;
        } else if (!isValid) {
            newErrors.file = 'Invalid archive format. Only .zip, .tar.gz and .tgz are allowed';
            isValidForm = false;
        }
        if (!vpsId) {
            newErrors.vps = 'Please select a deployment target node';
            isValidForm = false;
        }
        if (mode === 'production' && hostType === 'domain') {
            if (!domainName) {
                newErrors.domain = 'Domain name is required when using Custom Domain';
                isValidForm = false;
            } else if (domainInvalid) {
                newErrors.domain = 'Please enter a valid domain (e.g. app.example.com)';
                isValidForm = false;
            }
        }

        if (useEnv) {
            const totalVars = envFiles.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0);
            if (envFiles.length > 20) {
                newErrors.env = 'Maximum limit of 20 environment files exceeded';
                isValidForm = false;
            } else if (totalVars > 200) {
                newErrors.env = 'Maximum limit of 200 environment variables exceeded';
                isValidForm = false;
            } else {
                const validateKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
                const validatePath = (path: string) => {
                    if (!path.trim()) return false;
                    if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
                    if (path.split(/[/\\]/).some((p) => p === '..')) return false;
                    const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
                    const fileName = normalized.split('/').pop() || '';
                    return fileName.startsWith('.env');
                };
                for (const file of envFiles) {
                    if (!validatePath(file.path)) {
                        newErrors.env = `Invalid path: ${file.path}. Must end with a file starting with .env and contain no traversal.`;
                        isValidForm = false;
                        break;
                    }
                    const keys = Object.keys(file.variables || {});
                    const invalidKey = keys.find((k) => !validateKey(k));
                    if (invalidKey) {
                        newErrors.env = `Invalid variable key "${invalidKey}" in ${file.path}. Must start with a letter/underscore and contain only A-Z, 0-9, _.`;
                        isValidForm = false;
                        break;
                    }
                }
            }
        }

        setErrors(newErrors);

        if (!isValidForm) {
            if (newErrors.vps) vpsRef.current?.focus();
            else if (newErrors.projectName) projectNameRef.current?.focus();
        }

        return isValidForm;
    }

    async function submit() {
        if (!file || !validate()) return;
        try {
            const deployment = await deploy.mutateAsync({
                file,
                vpsId,
                name: projectName || file.name.replace(/\.(zip|tar\.gz|tgz)$/i, ''),
                environment,
                domainName: mode === 'production' && hostType === 'domain' ? domainName : undefined,
                env: useEnv ? { version: 2, files: envFiles } : { version: 2, files: [] },
                mode
            });
            router.push(`/deployments/${deployment.id}`);
        } catch (err) {}
    }

    if (vps.isLoading) {
        return (
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mx-auto mb-2 text-[#A1A1A1]" /> Loading VPS targets...
            </div>
        );
    }

    return (
        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-6 space-y-6 font-mono text-xs">
            {deploy.isError && (
                <div className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
                    Upload deployment failed: {(deploy.error as Error)?.message}
                </div>
            )}

            {/* Drag & Drop Box */}
            <div>
                <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        if (isSubmitting) return;
                        e.preventDefault();
                        setFile(e.dataTransfer.files?.[0] || null);
                        setErrors({ ...errors, file: '' });
                    }}
                    className={clsx(
                        'flex min-h-36 flex-col items-center justify-center rounded border border-dashed p-6 text-center transition-colors',
                        isSubmitting ? 'cursor-not-allowed opacity-50 bg-[#0A0A0A]' : 'cursor-pointer hover:bg-[#111111]',
                        errors.file ? 'border-rose-500 bg-rose-950/10' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <UploadCloud size={24} className="text-[#A1A1A1] mb-2" />
                    <span className="font-semibold text-white">
                        {file ? file.name : 'Drop ZIP or TAR.GZ archive here or click to browse'}
                    </span>
                    <span className="mt-1 text-[11px] text-[#666666]">Supported formats: .zip, .tar.gz, .tgz</span>
                    <input
                        type="file"
                        accept=".zip,.tar.gz,.tgz"
                        className="hidden"
                        onChange={(e) => {
                            setFile(e.target.files?.[0] || null);
                            setErrors({ ...errors, file: '' });
                        }}
                        disabled={isSubmitting}
                    />
                </label>
                {errors.file && <p className="mt-1 text-xs text-rose-400">{errors.file}</p>}
            </div>

            {/* Upload Progress Bar & Archive Validation Check */}
            <div className="space-y-2">
                <div className="h-1.5 overflow-hidden rounded bg-[#111111] border border-[#1F1F1F]">
                    <div className="h-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 size={14} className={isValid ? 'text-emerald-400' : 'text-[#666666]'} />
                    <span className={isValid ? 'text-white' : 'text-[#666666]'}>
                        {isValid ? 'Archive file format validated' : 'Waiting for a valid .zip or .tar.gz archive'}
                    </span>
                </div>
            </div>

            {/* Grid Fields */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Project Name
                    </label>
                    <input
                        ref={projectNameRef}
                        value={projectName}
                        onChange={(e) => {
                            setProjectName(e.target.value);
                            if (errors.projectName) setErrors({ ...errors, projectName: '' });
                        }}
                        placeholder="my-app-service"
                        className={clsx(INPUT_STYLE, errors.projectName && 'border-rose-500')}
                        disabled={isSubmitting}
                    />
                    {errors.projectName && <p className="mt-1 text-xs text-rose-400">{errors.projectName}</p>}
                </div>

                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Deployment Target Node (VPS)
                    </label>
                    <select
                        ref={vpsRef}
                        value={vpsId}
                        onChange={(e) => {
                            setVpsId(e.target.value);
                            if (errors.vps) setErrors({ ...errors, vps: '' });
                        }}
                        className={clsx(INPUT_STYLE, errors.vps && 'border-rose-500')}
                        disabled={isSubmitting}
                    >
                        <option value="">Select VPS Server Node</option>
                        {vps.data?.map((server) => (
                            <option key={server.id} value={server.id}>
                                {server.name} ({server.ipAddress})
                            </option>
                        ))}
                    </select>
                    {errors.vps && <p className="mt-1 text-xs text-rose-400">{errors.vps}</p>}
                </div>

                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Environment
                    </label>
                    <select
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value as EnvName)}
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    >
                        <option value="production">Production</option>
                        <option value="development">Development</option>
                    </select>
                </div>
            </div>

            {/* Info Callout */}
            <div className="rounded-md border border-[#1F1F1F] bg-[#111111] p-4 text-xs text-[#A1A1A1]">
                <p className="font-semibold text-white">Manual Archive Deployment</p>
                <p className="mt-1">
                    Upload deployments support real-time logs, container restarts, and snapshot restoration. Webhooks, automatic push builds, and branch switching are not applicable.
                </p>
            </div>

            {/* Execution Mode Selector */}
            <ExecutionModeSelector mode={mode} setMode={setMode} />

            {/* Hosting Configuration */}
            {mode === 'production' ? (
                <HostingConfiguration
                    hostType={hostType}
                    setHostType={setHostType}
                    domainName={domainName}
                    setDomainName={setDomainName}
                    ipPreview={selectedVps ? `http://${selectedVps.ipAddress}:auto` : 'Select a VPS to preview IP host binding'}
                    error={errors.domain}
                />
            ) : (
                <div className="rounded-md border border-[#1F1F1F] bg-[#111111] p-4 text-xs text-[#A1A1A1]">
                    <p className="font-semibold text-white">Sandbox Ephemeral Networking</p>
                    <p className="mt-1">Sandbox runs use direct host port routing and bypass Nginx proxying and domain attachments.</p>
                </div>
            )}

            {/* Environment Variables Setup Flow */}
            <EnvironmentVariablesEditor
                enabled={useEnv}
                setEnabled={setUseEnv}
                files={envFiles}
                setFiles={setEnvFiles}
                error={errors.env}
            />

            {/* Submit Action */}
            <div className="border-t border-[#1F1F1F] pt-4 flex justify-end">
                <button
                    type="button"
                    onClick={submit}
                    disabled={isSubmitting || !file}
                    className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                >
                    {isSubmitting ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <>
                            <PackagePlus size={14} />
                            <span>Deploy Archive Package</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function HostingConfiguration({
    hostType,
    setHostType,
    domainName,
    setDomainName,
    ipPreview,
    error
}: {
    hostType: 'ip' | 'domain';
    setHostType: (value: 'ip' | 'domain') => void;
    domainName: string;
    setDomainName: (value: string) => void;
    ipPreview: string;
    error?: string;
}) {
    const domainInvalid = hostType === 'domain' && domainName.trim().length > 0 && !isValidDomainInput(domainName);

    return (
        <div className="space-y-3 border-t border-[#1F1F1F] pt-4 font-mono text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Hosting & Domain Routing</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label
                    className={clsx(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        hostType === 'ip' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <span className="flex items-center gap-2 font-semibold text-white">
                        <input
                            type="radio"
                            checked={hostType === 'ip'}
                            onChange={() => setHostType('ip')}
                            className="accent-white"
                        />
                        Use IP Direct Hosting
                    </span>
                    <span className="mt-1 block text-[11px] text-[#A1A1A1]">{ipPreview}</span>
                </label>
                <label
                    className={clsx(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        hostType === 'domain' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <span className="flex items-center gap-2 font-semibold text-white">
                        <input
                            type="radio"
                            checked={hostType === 'domain'}
                            onChange={() => setHostType('domain')}
                            className="accent-white"
                        />
                        Use Custom Domain
                    </span>
                    <input
                        value={domainName}
                        onChange={(e) => setDomainName(e.target.value.trim().toLowerCase())}
                        disabled={hostType !== 'domain'}
                        placeholder="app.example.com"
                        className={clsx(INPUT_STYLE, 'mt-2', error && 'border-rose-500')}
                    />
                    {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
                    {!error && domainInvalid && (
                        <p className="mt-1 text-xs text-rose-400">Enter a valid domain without http://, spaces, or paths.</p>
                    )}
                </label>
            </div>
        </div>
    );
}

function ExecutionModeSelector({ mode, setMode }: { mode: ExecutionMode; setMode: (mode: ExecutionMode) => void }) {
    return (
        <div className="space-y-2 border-t border-[#1F1F1F] pt-4 font-mono text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Execution Mode</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label
                    className={clsx(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        mode === 'production' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <span className="flex items-center gap-2 font-semibold text-white">
                        <input
                            type="radio"
                            checked={mode === 'production'}
                            onChange={() => setMode('production')}
                            className="accent-white"
                        />
                        Production Release
                    </span>
                    <span className="mt-1 block text-[11px] text-[#A1A1A1]">
                        Persistent container, Blue-Green routing, domain mapping, and rollback safety.
                    </span>
                </label>
                <label
                    className={clsx(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        mode === 'sandbox' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]'
                    )}
                >
                    <span className="flex items-center gap-2 font-semibold text-white">
                        <input
                            type="radio"
                            checked={mode === 'sandbox'}
                            onChange={() => setMode('sandbox')}
                            className="accent-white"
                        />
                        Sandbox Test Run
                    </span>
                    <span className="mt-1 block text-[11px] text-[#A1A1A1]">
                        Temporary container with direct host port access and automatic cleanup.
                    </span>
                </label>
            </div>
        </div>
    );
}

function EnvironmentVariablesEditor({
    enabled,
    setEnabled,
    files,
    setFiles,
    error
}: {
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    files: EnvFile[];
    setFiles: (files: EnvFile[]) => void;
    error?: string;
}) {
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const [showAddFile, setShowAddFile] = useState(false);
    const [newFilePath, setNewFilePath] = useState('');
    const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
    const [renamingPath, setRenamingPath] = useState('');
    const [isBulkEdit, setIsBulkEdit] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'none' | 'key'>('none');
    const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);

    const activeFile = files[activeFileIndex] || { path: '.env', variables: {} };

    useEffect(() => {
        if (isBulkEdit) {
            const text = Object.entries(activeFile.variables || {})
                .map(([k, v]) => `${k}=${v}`)
                .join('\n');
            setBulkText(text);
        }
    }, [isBulkEdit, activeFileIndex, activeFile.variables]);

    const validateKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    const validatePath = (path: string) => {
        if (!path.trim()) return false;
        if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
        if (path.split(/[/\\]/).some((p) => p === '..')) return false;
        const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        const fileName = normalized.split('/').pop() || '';
        return fileName.startsWith('.env');
    };

    const handleAddFile = () => {
        const path = newFilePath.trim();
        if (!validatePath(path)) {
            useToastStore.getState().addToast({
                title: 'Invalid File Path',
                description:
                    'Path must end with a file starting with .env (e.g. apps/server/.env) and contain no traversal.',
                severity: 'error'
            });
            return;
        }
        if (files.some((f) => f.path === path)) {
            useToastStore.getState().addToast({
                title: 'Duplicate File',
                description: 'This environment file already exists.',
                severity: 'warning'
            });
            return;
        }
        const updated = [...files, { path, variables: {} }];
        setFiles(updated);
        setActiveFileIndex(updated.length - 1);
        setNewFilePath('');
        setShowAddFile(false);
    };

    const handleRenameFile = (index: number) => {
        const path = renamingPath.trim();
        if (!validatePath(path)) {
            useToastStore.getState().addToast({
                title: 'Invalid File Path',
                description: 'Path must end with a file starting with .env and contain no traversal.',
                severity: 'error'
            });
            return;
        }
        if (files.some((f, idx) => f.path === path && idx !== index)) {
            useToastStore.getState().addToast({
                title: 'Duplicate File',
                description: 'An environment file with that path already exists.',
                severity: 'warning'
            });
            return;
        }
        const updated = [...files];
        updated[index] = { ...updated[index], path };
        setFiles(updated);
        setRenamingIndex(null);
        setRenamingPath('');
    };

    const handleDeleteFile = (index: number) => {
        if (files[index].path === '.env') return;
        const updated = files.filter((_, idx) => idx !== index);
        setFiles(updated);
        setActiveFileIndex(0);
    };

    const handleUpdateVarKey = (oldKey: string, newKey: string) => {
        if (oldKey === newKey) return;
        const trimmedNewKey = newKey.trim();
        const variables = { ...activeFile.variables };
        const val = variables[oldKey];
        delete variables[oldKey];
        if (trimmedNewKey) {
            variables[trimmedNewKey] = val || '';
        }
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleUpdateVarValue = (key: string, value: string) => {
        const variables = { ...activeFile.variables, [key]: value };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleAddVar = () => {
        let baseKey = 'NEW_VAR';
        let counter = 1;
        let finalKey = baseKey;
        while (finalKey in (activeFile.variables || {})) {
            finalKey = `${baseKey}_${counter}`;
            counter++;
        }
        const variables = { ...activeFile.variables, [finalKey]: '' };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleDuplicateVar = (key: string, value: string) => {
        let baseKey = `${key}_COPY`;
        let counter = 1;
        let finalKey = baseKey;
        while (finalKey in (activeFile.variables || {})) {
            finalKey = `${baseKey}_${counter}`;
            counter++;
        }
        const variables = { ...activeFile.variables, [finalKey]: value };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleDeleteVar = (key: string) => {
        const variables = { ...activeFile.variables };
        delete variables[key];
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
    };

    const handleBulkImport = () => {
        const lines = bulkText.split('\n');
        const parsed: Record<string, string> = {};
        for (const line of lines) {
            const index = line.indexOf('=');
            if (index !== -1) {
                const k = line.substring(0, index).trim();
                const v = line.substring(index + 1);
                if (k) parsed[k] = v;
            }
        }

        const keys = Object.keys(parsed);
        const hasConflicts = keys.some((k) => k in (activeFile.variables || {}));
        if (hasConflicts) {
            setShowConfirmOverwrite(true);
            return;
        }

        const variables = { ...activeFile.variables, ...parsed };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
        setIsBulkEdit(false);
    };

    const confirmBulkImport = () => {
        const lines = bulkText.split('\n');
        const parsed: Record<string, string> = {};
        for (const line of lines) {
            const index = line.indexOf('=');
            if (index !== -1) {
                const k = line.substring(0, index).trim();
                const v = line.substring(index + 1);
                if (k) parsed[k] = v;
            }
        }
        const variables = { ...activeFile.variables, ...parsed };
        const updated = [...files];
        updated[activeFileIndex] = { ...activeFile, variables };
        setFiles(updated);
        setShowConfirmOverwrite(false);
        setIsBulkEdit(false);
    };

    const filteredVariables = Object.entries(activeFile.variables || {})
        .filter(([k]) => k.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'key') return a[0].localeCompare(b[0]);
            return 0;
        });

    const totalVariables = files.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0);

    return (
        <div className="space-y-4 border-t border-[#1F1F1F] pt-4 font-mono text-xs">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                    <span className="block font-semibold text-white">
                        Environment Setup & Variables <span className="text-[#666666]">(Optional)</span>
                    </span>
                    <span className="mt-1 block text-xs text-[#A1A1A1]">
                        Configure multi-file scoped environment variables. All secrets are encrypted in transit and at rest.
                    </span>
                </div>
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-4 w-4 accent-white rounded border-[#1F1F1F]"
                />
            </label>

            {enabled && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#000000] overflow-hidden">
                    <div className="flex flex-col lg:flex-row min-h-[400px]">
                        {/* Sidebar: Files List */}
                        <div className="hidden lg:flex w-64 shrink-0 flex-col gap-3 border-r border-[#1F1F1F] p-4 bg-[#0A0A0A]">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                                    Env Files
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowAddFile(!showAddFile)}
                                    className="flex h-6 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-2 text-[11px] text-white hover:bg-[#1F1F1F] transition-colors"
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>

                            {showAddFile && (
                                <div className="space-y-2 rounded border border-[#1F1F1F] bg-[#111111] p-3">
                                    <p className="text-[10px] text-[#A1A1A1]">File path (relative to repo root)</p>
                                    <input
                                        value={newFilePath}
                                        onChange={(e) => setNewFilePath(e.target.value)}
                                        placeholder="apps/server/.env"
                                        className={INPUT_STYLE}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowAddFile(false);
                                                setNewFilePath('');
                                            }}
                                            className="h-6 rounded border border-[#1F1F1F] px-2 text-[11px] text-[#A1A1A1] hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddFile}
                                            className="h-6 rounded border border-[#1F1F1F] bg-white px-2 text-[11px] font-semibold text-black hover:bg-[#E5E5E5]"
                                        >
                                            Create
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px] lg:max-h-none">
                                {files.map((file, idx) => {
                                    const isActive = idx === activeFileIndex;
                                    const isRenaming = renamingIndex === idx;

                                    return (
                                        <div
                                            key={file.path}
                                            onClick={() => !isRenaming && setActiveFileIndex(idx)}
                                            className={clsx(
                                                'group flex items-center justify-between rounded px-3 py-2 text-xs font-mono cursor-pointer border transition-colors',
                                                isActive
                                                    ? 'bg-[#111111] border-white text-white font-semibold'
                                                    : 'bg-[#000000] border-[#1F1F1F] text-[#A1A1A1] hover:text-white'
                                            )}
                                        >
                                            {isRenaming ? (
                                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        value={renamingPath}
                                                        onChange={(e) => setRenamingPath(e.target.value)}
                                                        className={clsx(INPUT_STYLE, 'h-6 py-0 px-1.5 text-xs')}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRenameFile(idx)}
                                                        className="flex h-6 w-6 items-center justify-center rounded bg-white text-black hover:bg-[#E5E5E5]"
                                                    >
                                                        <Check size={11} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRenamingIndex(null);
                                                            setRenamingPath('');
                                                        }}
                                                        className="flex h-6 w-6 items-center justify-center rounded border border-[#1F1F1F] text-[#A1A1A1] hover:text-white"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="truncate">{file.path}</span>
                                                    <div className="flex items-center gap-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRenamingIndex(idx);
                                                                setRenamingPath(file.path);
                                                            }}
                                                            className="p-1 text-[#666666] hover:text-white"
                                                            title="Rename file"
                                                        >
                                                            <Edit2 size={11} />
                                                        </button>
                                                        {file.path !== '.env' && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteFile(idx);
                                                                }}
                                                                className="p-1 text-[#666666] hover:text-rose-400"
                                                                title="Delete file"
                                                            >
                                                                <Trash2 size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="text-[10px] text-[#666666] border-t border-[#1F1F1F] pt-2">
                                {files.length}/20 files. Total variables: {totalVariables}/200.
                            </div>
                        </div>

                        {/* Editor Panel */}
                        <div className="flex-1 flex flex-col gap-4 p-4">
                            <div className="flex flex-col gap-3 border-b border-[#1F1F1F] pb-3">
                                {/* Mobile file selector */}
                                <div className="flex lg:hidden flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={activeFileIndex}
                                            onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                                            className={clsx(INPUT_STYLE, 'flex-1')}
                                        >
                                            {files.map((file, idx) => (
                                                <option key={file.path} value={idx}>
                                                    {file.path} ({Object.keys(file.variables || {}).length} vars)
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddFile(!showAddFile)}
                                            className="flex h-9 items-center gap-1 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white"
                                        >
                                            <Plus size={14} /> Add File
                                        </button>
                                    </div>
                                    {showAddFile && (
                                        <div className="space-y-2 rounded border border-[#1F1F1F] bg-[#111111] p-3">
                                            <p className="text-[10px] text-[#A1A1A1]">File path (relative to repo root)</p>
                                            <input
                                                value={newFilePath}
                                                onChange={(e) => setNewFilePath(e.target.value)}
                                                placeholder="apps/server/.env"
                                                className={INPUT_STYLE}
                                            />
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowAddFile(false);
                                                        setNewFilePath('');
                                                    }}
                                                    className="h-6 rounded border border-[#1F1F1F] px-2 text-[11px] text-[#A1A1A1]"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleAddFile}
                                                    className="h-6 rounded border border-[#1F1F1F] bg-white px-2 text-[11px] font-semibold text-black"
                                                >
                                                    Create
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Active File Header */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                {renamingIndex === activeFileIndex ? (
                                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            value={renamingPath}
                                                            onChange={(e) => setRenamingPath(e.target.value)}
                                                            className={clsx(INPUT_STYLE, 'h-7 py-0 px-2 text-xs w-40 sm:w-48')}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRenameFile(activeFileIndex)}
                                                            className="flex h-7 w-7 items-center justify-center rounded bg-white text-black"
                                                        >
                                                            <Check size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setRenamingIndex(null);
                                                                setRenamingPath('');
                                                            }}
                                                            className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] text-[#A1A1A1]"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <h4
                                                            className="text-xs font-bold text-white font-mono truncate max-w-[150px] sm:max-w-[280px]"
                                                            title={activeFile.path}
                                                        >
                                                            {activeFile.path}
                                                        </h4>
                                                        {activeFile.path !== '.env' && (
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setRenamingIndex(activeFileIndex);
                                                                        setRenamingPath(activeFile.path);
                                                                    }}
                                                                    className="p-1 text-[#666666] hover:text-white"
                                                                    title="Rename file"
                                                                >
                                                                    <Edit2 size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteFile(activeFileIndex);
                                                                    }}
                                                                    className="p-1 text-[#666666] hover:text-rose-400"
                                                                    title="Delete file"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-[#666666]">
                                                {Object.keys(activeFile.variables || {}).length} variables configured
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setIsBulkEdit(!isBulkEdit)}
                                        className="h-8 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1F1F1F] transition-colors shrink-0 font-mono"
                                    >
                                        {isBulkEdit ? 'Table Editor' : 'Bulk Edit / Text'}
                                    </button>
                                </div>
                            </div>

                            {isBulkEdit ? (
                                /* Bulk Text Editor */
                                <div className="flex-1 flex flex-col gap-3">
                                    <p className="text-xs text-[#A1A1A1]">
                                        Paste key-value pairs formatted as <code className="text-white">KEY=VALUE</code>, one per line.
                                    </p>
                                    <textarea
                                        value={bulkText}
                                        onChange={(e) => setBulkText(e.target.value)}
                                        className={clsx(
                                            INPUT_STYLE,
                                            'min-h-[220px] flex-1 p-3 leading-relaxed resize-none'
                                        )}
                                        placeholder={`API_KEY=supersecretkey\nPORT=3000\nDATABASE_URL=postgres://user:pass@host:5432/db`}
                                    />
                                    <div className="flex justify-end gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsBulkEdit(false)}
                                            className="h-8 rounded border border-[#1F1F1F] px-3 text-xs text-[#A1A1A1] hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleBulkImport}
                                            className="h-8 rounded border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black hover:bg-[#E5E5E5]"
                                        >
                                            Import & Merge
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Table Editor */
                                <div className="flex-1 flex flex-col gap-3">
                                    {/* Filters & Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="relative flex-1">
                                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" />
                                            <input
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search variable keys..."
                                                className={clsx(INPUT_STYLE, 'pl-8 h-8')}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSortBy((v) => (v === 'none' ? 'key' : 'none'))}
                                            className="flex h-8 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] px-2.5 text-xs text-[#A1A1A1] hover:text-white transition-colors shrink-0"
                                            title="Sort A-Z by key"
                                        >
                                            <ArrowUpDown size={13} className={sortBy === 'key' ? 'text-white' : 'text-[#666666]'} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddVar}
                                            className="flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-[#111111] px-3 text-xs text-white hover:bg-[#1F1F1F] transition-colors shrink-0 font-mono"
                                        >
                                            <Plus size={13} /> Add Variable
                                        </button>
                                    </div>

                                    {/* Variables List */}
                                    <div className="flex-1 overflow-y-auto border border-[#1F1F1F] rounded divide-y divide-[#1F1F1F] bg-[#000000] max-h-[300px]">
                                        {filteredVariables.length === 0 ? (
                                            <div className="py-12 text-center text-xs text-[#666666] italic">
                                                {searchQuery ? 'No matching variables found.' : 'No environment variables configured.'}
                                            </div>
                                        ) : (
                                            filteredVariables.map(([key, val]) => {
                                                const isKeyValid = validateKey(key);
                                                return (
                                                    <div
                                                        key={key}
                                                        className={clsx(
                                                            'grid grid-cols-1 sm:grid-cols-[1.5fr_2fr_auto] gap-2 p-2.5 items-start sm:items-center hover:bg-[#0A0A0A] transition-colors',
                                                            !isKeyValid && 'bg-rose-950/10'
                                                        )}
                                                    >
                                                        {/* Key Input */}
                                                        <div className="w-full space-y-1">
                                                            <input
                                                                defaultValue={key}
                                                                onBlur={(e) => handleUpdateVarKey(key, e.target.value)}
                                                                placeholder="VARIABLE_KEY"
                                                                className={clsx(
                                                                    INPUT_STYLE,
                                                                    'h-8',
                                                                    !isKeyValid && 'border-rose-500 text-rose-300'
                                                                )}
                                                            />
                                                            {!isKeyValid && (
                                                                <p className="text-[10px] text-rose-400">
                                                                    Key must start with letter/underscore (A-Z, 0-9, _).
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* Value Input */}
                                                        <div className="w-full">
                                                            <PasswordInput
                                                                value={val}
                                                                onChange={(e) => handleUpdateVarValue(key, e.target.value)}
                                                                placeholder="variable_value"
                                                                className={clsx(INPUT_STYLE, 'h-8 pr-8')}
                                                            />
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-1 shrink-0 justify-end">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDuplicateVar(key, val)}
                                                                className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-white transition-colors"
                                                                title="Duplicate variable"
                                                            >
                                                                <Copy size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteVar(key)}
                                                                className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#111111] text-[#A1A1A1] hover:text-rose-400 transition-colors"
                                                                title="Delete variable"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {/* Overwrite Confirmation Modal Banner */}
            {showConfirmOverwrite && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-xs text-amber-200">
                        Some variables being imported already exist in this file. Merging will overwrite their existing values.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowConfirmOverwrite(false)}
                            className="h-7 rounded border border-[#1F1F1F] px-3 text-xs text-[#A1A1A1] hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmBulkImport}
                            className="h-7 rounded border border-[#1F1F1F] bg-white px-3 text-xs font-semibold text-black hover:bg-[#E5E5E5]"
                        >
                            Overwrite & Merge
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
