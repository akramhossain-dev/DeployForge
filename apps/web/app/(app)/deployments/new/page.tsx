'use client';

import { useMemo, useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckCircle2, Github, PackagePlus, Plus, Trash2, UploadCloud, Edit2, Search, ArrowUpDown, Copy, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useCreateGithubDeployment, useCreateUploadDeployment, useRepositories, useVpsList, type EnvFile } from '@/hooks/useDeployForgeData';
import { useToastStore } from '@/lib/store/useToastStore';

type EnvName = 'production' | 'development';
type ExecutionMode = 'production' | 'sandbox';

const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function isValidDomainInput(input: string): boolean {
    if (!input || input.trim().length === 0) return false;
    const clean = input.trim().toLowerCase();
    if (clean.includes('://') || clean.includes('/') || clean.includes(' ') || clean.includes(':')) return false;
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i.test(clean);
}

export default function NewDeploymentPage() {
    return (
        <Suspense fallback={
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading deployment setup wizard...
            </div>
        }>
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Step 1: Select Release Source</p>
                <div className="grid grid-cols-2 gap-2 rounded border border-[#1F1F1F] bg-[#000000] p-1">
                    <button
                        type="button"
                        onClick={() => setTab('github')}
                        className={clsx(
                            'flex h-9 items-center justify-center gap-2 rounded font-semibold transition-colors',
                            tab === 'github'
                                ? 'bg-[#111111] text-white border-l-2 border-white'
                                : 'text-[#A1A1A1] hover:text-white'
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
                            tab === 'upload'
                                ? 'bg-[#111111] text-white border-l-2 border-white'
                                : 'text-[#A1A1A1] hover:text-white'
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
    const [envFiles, setEnvFiles] = useState<EnvFile[]>([
        { path: '.env', variables: {} }
    ]);

    const selectedRepo = repositories.data?.find((repo) => repo.id === repositoryId);
    const selectedVps = vps.data?.find((server) => server.id === vpsId);
    const branchOptions = useMemo(() => Array.from(new Set(['main', 'master', selectedRepo?.defaultBranch].filter(Boolean) as string[])), [selectedRepo?.defaultBranch]);
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
            newErrors.vps = 'Please select a deployment host node';
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
        setErrors(newErrors);
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
                <Loader2 size={16} className="animate-spin mx-auto mb-2" /> Loading synchronized repositories and VPS targets...
            </div>
        );
    }

    if (!repositories.data?.length) {
        return (
            <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center font-mono text-xs text-[#666666]">
                <Github size={24} className="mx-auto mb-2 text-[#666666]" />
                <p className="text-white font-semibold">No synced repositories found</p>
                <p className="mt-1">Connect your GitHub account and sync repositories before creating a deployment.</p>
                <Link href="/repositories" className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-3 font-semibold text-black hover:bg-[#E5E5E5]">
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
                <Link href="/vps" className="mt-4 inline-flex h-8 items-center gap-1.5 rounded border border-[#1F1F1F] bg-white px-3 font-semibold text-black hover:bg-[#E5E5E5]">
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
                        }}
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    >
                        <option value="">Select GitHub repository</option>
                        {repositories.data.map((repo) => (
                            <option key={repo.id} value={repo.id}>{repo.fullName}</option>
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
                        onChange={(e) => setVpsId(e.target.value)}
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    >
                        <option value="">Select VPS Server Node</option>
                        {vps.data.map((server) => (
                            <option key={server.id} value={server.id}>{server.name} ({server.ipAddress})</option>
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
                        onChange={(e) => setBranch(e.target.value)}
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    >
                        {branchOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
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

            {/* Execution Mode Selector */}
            <div className="space-y-2 border-t border-[#1F1F1F] pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Execution Mode</p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <label className={clsx('rounded border p-3 cursor-pointer transition-colors', mode === 'production' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]')}>
                        <span className="flex items-center gap-2 font-bold text-white">
                            <input type="radio" checked={mode === 'production'} onChange={() => setMode('production')} className="accent-white" />
                            Production Release
                        </span>
                        <span className="mt-1 block text-[11px] text-[#A1A1A1]">Persistent container, Blue-Green routing, domain mapping, and rollback safety.</span>
                    </label>
                    <label className={clsx('rounded border p-3 cursor-pointer transition-colors', mode === 'sandbox' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]')}>
                        <span className="flex items-center gap-2 font-bold text-white">
                            <input type="radio" checked={mode === 'sandbox'} onChange={() => setMode('sandbox')} className="accent-white" />
                            Sandbox Test Run
                        </span>
                        <span className="mt-1 block text-[11px] text-[#A1A1A1]">Temporary container with direct host port access and automatic cleanup.</span>
                    </label>
                </div>
            </div>

            {/* Hosting Configuration */}
            {mode === 'production' && (
                <div className="space-y-3 border-t border-[#1F1F1F] pt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">Hosting & Domain Routing</p>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label className={clsx('rounded border p-3 cursor-pointer transition-colors', hostType === 'ip' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]')}>
                            <span className="flex items-center gap-2 font-bold text-white">
                                <input type="radio" checked={hostType === 'ip'} onChange={() => setHostType('ip')} className="accent-white" />
                                Use IP Direct Hosting
                            </span>
                            <span className="mt-1 block text-[11px] text-[#A1A1A1]">
                                {selectedVps ? `http://${selectedVps.ipAddress}:auto` : 'Select a VPS to preview IP host binding'}
                            </span>
                        </label>
                        <label className={clsx('rounded border p-3 cursor-pointer transition-colors', hostType === 'domain' ? 'border-white bg-[#111111]' : 'border-[#1F1F1F] bg-[#000000]')}>
                            <span className="flex items-center gap-2 font-bold text-white">
                                <input type="radio" checked={hostType === 'domain'} onChange={() => setHostType('domain')} className="accent-white" />
                                Use Custom Domain
                            </span>
                            <input
                                value={domainName}
                                onChange={(e) => setDomainName(e.target.value.trim().toLowerCase())}
                                disabled={hostType !== 'domain'}
                                placeholder="app.example.com"
                                className={clsx(INPUT_STYLE, 'mt-2')}
                            />
                            {errors.domain && <p className="mt-1 text-xs text-rose-400">{errors.domain}</p>}
                        </label>
                    </div>
                </div>
            )}

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
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [file, setFile] = useState<File | null>(null);
    const [projectName, setProjectName] = useState('');
    const [environment, setEnvironment] = useState<EnvName>('production');
    const [vpsId, setVpsId] = useState('');
    const [hostType, setHostType] = useState<'ip' | 'domain'>('ip');
    const [domainName, setDomainName] = useState('');
    const [mode, setMode] = useState<ExecutionMode>('production');

    const isValid = !!file && /\.(zip|tar\.gz|tgz)$/i.test(file.name);
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
        setErrors(newErrors);
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
                env: { version: 2, files: [] },
                mode
            });
            router.push(`/deployments/${deployment.id}`);
        } catch (err) {}
    }

    if (vps.isLoading) {
        return (
            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mx-auto mb-2" /> Loading VPS targets...
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
                        'flex min-h-36 flex-col items-center justify-center rounded border border-dashed p-6 text-center cursor-pointer transition-colors',
                        errors.file ? 'border-rose-900/80 bg-rose-950/20' : 'border-[#1F1F1F] bg-[#000000] hover:bg-[#111111]'
                    )}
                >
                    <UploadCloud size={24} className="text-[#A1A1A1] mb-2" />
                    <span className="font-semibold text-white">{file ? file.name : 'Drop ZIP or TAR.GZ archive here or click to browse'}</span>
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

            {/* Grid Fields */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Project Name
                    </label>
                    <input
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="my-app-service"
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Deployment Target Node (VPS)
                    </label>
                    <select
                        ref={vpsRef}
                        value={vpsId}
                        onChange={(e) => setVpsId(e.target.value)}
                        className={INPUT_STYLE}
                        disabled={isSubmitting}
                    >
                        <option value="">Select VPS Server Node</option>
                        {vps.data?.map((server) => (
                            <option key={server.id} value={server.id}>{server.name} ({server.ipAddress})</option>
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
