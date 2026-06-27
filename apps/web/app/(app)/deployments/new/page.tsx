'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CheckCircle2, Github, PackagePlus, Plus, Trash2, UploadCloud, Edit2, Search, ArrowUpDown, Copy, AlertCircle } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, inputClassName, PasswordInput } from '@/components/ui';
import { useCreateGithubDeployment, useCreateUploadDeployment, useRepositories, useVpsList, type EnvFile } from '@/hooks/useDeployForgeData';
import { useToastStore } from '@/lib/store/useToastStore';

type EnvName = 'production' | 'development';
type ExecutionMode = 'production' | 'sandbox';

export default function NewDeploymentPage() {
    const [tab, setTab] = useState<'github' | 'upload'>('github');

    return (
        <div className="space-y-6">
            <PageHeader title="Create Deployment" description="Step 1: select a source, then configure only the features available for that deployment type." />
            <Panel>
                <p className="mb-3 text-xs font-black uppercase text-slate-500">Step 1: Select Source</p>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-1">
                    <button type="button" onClick={() => setTab('github')} className={tab === 'github' ? 'flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300/15 text-sm font-black text-cyan-100' : 'flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black text-slate-400 hover:text-white'}>
                        <Github size={16} /> GitHub Deploy
                    </button>
                    <button type="button" onClick={() => setTab('upload')} className={tab === 'upload' ? 'flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300/15 text-sm font-black text-cyan-100' : 'flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black text-slate-400 hover:text-white'}>
                        <UploadCloud size={16} /> File Upload Deploy
                    </button>
                </div>
            </Panel>
            {tab === 'github' ? <GithubDeployForm /> : <UploadDeployForm />}
        </div>
    );
}

function GithubDeployForm() {
    const router = useRouter();
    const repositories = useRepositories();
    const vps = useVpsList();
    const deploy = useCreateGithubDeployment();

    const repositoryRef = useRef<HTMLSelectElement>(null);
    const vpsRef = useRef<HTMLSelectElement>(null);
    const branchRef = useRef<HTMLSelectElement>(null);

    const [errors, setErrors] = useState<Record<string, string>>({});

    const [repositoryId, setRepositoryId] = useState('');
    const [branch, setBranch] = useState('main');
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
            newErrors.vps = 'Please select a deployment target';
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
                    if (path.split(/[/\\]/).some(p => p === '..')) return false;
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
                    const invalidKey = keys.find(k => !validateKey(k));
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
        } catch (err) {
            
        }
    }

    if (repositories.isLoading || vps.isLoading) return <Panel><SkeletonBlock className="h-80" /></Panel>;
    if (!repositories.data?.length) return <EmptyState title="No synced repositories" description="Connect GitHub and sync repositories before creating a GitHub deployment." />;
    if (!vps.data?.length) return <EmptyState title="No VPS targets" description="Add a VPS before creating a deployment." />;

    return (
        <Panel className="space-y-5">
            {deploy.isError ? <ErrorState title="GitHub deployment failed" message={(deploy.error as Error)?.message} /> : null}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="Repository" error={errors.repository}>
                    <select
                        ref={repositoryRef}
                        value={repositoryId}
                        onChange={(event) => {
                            setRepositoryId(event.target.value);
                            const repo = repositories.data?.find((item) => item.id === event.target.value);
                            if (repo) setBranch(repo.defaultBranch);
                            if (errors.repository) setErrors({ ...errors, repository: '' });
                        }}
                        className={clsx(
                            inputClassName,
                            "transition-colors",
                            errors.repository ? "border-rose-500 focus:border-rose-400" : "border-white/10"
                        )}
                        disabled={isSubmitting}
                    >
                        <option value="">Select repository</option>
                        {repositories.data.map((repo) => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}
                    </select>
                </Field>
                <Field label="Deployment target" error={errors.vps}>
                    <select
                        ref={vpsRef}
                        value={vpsId}
                        onChange={(event) => {
                            setVpsId(event.target.value);
                            if (errors.vps) setErrors({ ...errors, vps: '' });
                        }}
                        className={clsx(
                            inputClassName,
                            "transition-colors",
                            errors.vps ? "border-rose-500 focus:border-rose-400" : "border-white/10"
                        )}
                        disabled={isSubmitting}
                    >
                        <option value="">Select VPS</option>
                        {vps.data.map((server) => <option key={server.id} value={server.id}>{server.name} ({server.ipAddress})</option>)}
                    </select>
                </Field>
                <Field label="Branch" error={errors.branch}>
                    <select
                        ref={branchRef}
                        value={branch}
                        onChange={(event) => {
                            setBranch(event.target.value);
                            if (errors.branch) setErrors({ ...errors, branch: '' });
                        }}
                        className={clsx(
                            inputClassName,
                            "transition-colors",
                            errors.branch ? "border-rose-500 focus:border-rose-400" : "border-white/10"
                        )}
                        disabled={isSubmitting}
                    >
                        {branchOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                </Field>
                <Field label="Environment">
                    <select
                        value={environment}
                        onChange={(event) => setEnvironment(event.target.value as EnvName)}
                        className={inputClassName}
                        disabled={isSubmitting}
                    >
                        <option value="production">Production</option>
                        <option value="development">Development</option>
                    </select>
                </Field>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-black text-white">Webhook status</p>
                    <p className="mt-1 text-sm text-slate-400">{selectedRepo?.webhookId ? 'Connected for push events' : 'Not connected yet'}</p>
                    {!selectedRepo?.webhookId && autoDeploy ? (
                        <p className="mt-2 text-xs leading-5 text-amber-200/80">GitHub requires a public HTTPS API URL for webhook registration. The deploy will still run if webhook setup is rejected.</p>
                    ) : null}
                </div>
                <StatusBadge status={selectedRepo?.webhookId ? 'RUNNING' : 'PENDING'} />
            </div>
            <ExecutionModeSelector mode={mode} setMode={setMode} />
            <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.05] p-4">
                <span>
                    <span className="block font-black text-white">Auto Deploy on Push</span>
                    <span className="mt-1 block text-sm text-slate-400">Register a GitHub webhook when this deployment starts.</span>
                </span>
                <input
                    type="checkbox"
                    checked={autoDeploy && mode === 'production'}
                    disabled={mode === 'sandbox' || isSubmitting}
                    onChange={(event) => setAutoDeploy(event.target.checked)}
                    className="h-5 w-5 accent-cyan-300"
                />
            </label>
            <div className={mode === 'sandbox' ? 'rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100' : 'rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100'}>
                {mode === 'sandbox' ? 'Temporary environment: no webhook, domain binding, rollback, or permanent container commitment.' : 'Rollback enabled: GitHub deployments keep commit and image version history for CI/CD recovery.'}
            </div>
            {mode === 'production' ? (
                <HostingConfiguration
                    hostType={hostType}
                    setHostType={setHostType}
                    domainName={domainName}
                    setDomainName={setDomainName}
                    ipPreview={selectedVps ? `http://${selectedVps.ipAddress}:auto` : 'Select a VPS to preview IP hosting'}
                    error={errors.domain}
                />
            ) : (
                <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                    <p className="font-black text-white">Sandbox Networking</p>
                    <p className="mt-1">Sandbox runs use direct ephemeral port access and skip Nginx/domain routing.</p>
                </div>
            )}
            <EnvironmentVariablesEditor enabled={useEnv} setEnabled={setUseEnv} files={envFiles} setFiles={setEnvFiles} error={errors.env} />
            <Button onClick={submit} loading={deploy.isPending} disabled={isSubmitting}>
                <Github size={16} /> {mode === 'sandbox' ? 'Run sandbox' : 'Deploy repository'}
            </Button>
        </Panel>
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
    const [envFiles, setEnvFiles] = useState<EnvFile[]>([
        { path: '.env', variables: {} }
    ]);

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
            newErrors.vps = 'Please select a deployment target';
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
                    if (path.split(/[/\\]/).some(p => p === '..')) return false;
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
                    const invalidKey = keys.find(k => !validateKey(k));
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
        } catch (err) {
            
        }
    }

    if (vps.isLoading) return <Panel><SkeletonBlock className="h-80" /></Panel>;
    if (!vps.data?.length) return <EmptyState title="No VPS targets" description="Add a VPS before uploading a deployment archive." />;

    return (
        <Panel className="space-y-5">
            {deploy.isError ? <ErrorState title="Upload deployment failed" message={(deploy.error as Error)?.message} /> : null}
            <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    if (isSubmitting) return;
                    event.preventDefault();
                    setFile(event.dataTransfer.files?.[0] || null);
                    setErrors({ ...errors, file: '' });
                }}
                className={clsx(
                    "flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition-colors",
                    isSubmitting ? "cursor-not-allowed opacity-50 bg-slate-950/20" : "cursor-pointer hover:bg-cyan-300/[0.12]",
                    errors.file ? "border-rose-500 bg-rose-500/[0.04]" : "border-cyan-300/30 bg-cyan-300/[0.08]"
                )}
            >
                <UploadCloud size={28} className={errors.file ? "text-rose-400" : "text-cyan-200"} />
                <span className="mt-3 font-black text-white">{file ? file.name : 'Drop archive here or browse'}</span>
                <span className="mt-1 text-sm text-slate-400">Supported formats: .zip, .tar.gz</span>
                <input
                    type="file"
                    accept=".zip,.tar.gz,.tgz"
                    className="hidden"
                    onChange={(event) => {
                        setFile(event.target.files?.[0] || null);
                        setErrors({ ...errors, file: '' });
                    }}
                    disabled={isSubmitting}
                />
            </label>
            {errors.file && <p className="text-xs font-semibold text-rose-400">{errors.file}</p>}
            <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={16} className={isValid ? 'text-emerald-300' : 'text-slate-600'} />
                <span className={isValid ? 'text-emerald-200' : 'text-slate-500'}>{isValid ? 'Archive validated' : 'Waiting for a valid .zip or .tar.gz archive'}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Field label="Project name" error={errors.projectName}>
                    <input
                        ref={projectNameRef}
                        value={projectName}
                        onChange={(event) => {
                            setProjectName(event.target.value);
                            if (errors.projectName) setErrors({ ...errors, projectName: '' });
                        }}
                        placeholder="my-service"
                        className={clsx(
                            inputClassName,
                            "transition-colors",
                            errors.projectName ? "border-rose-500 focus:border-rose-400" : "border-white/10"
                        )}
                        disabled={isSubmitting}
                    />
                </Field>
                <Field label="Deployment target" error={errors.vps}>
                    <select
                        ref={vpsRef}
                        value={vpsId}
                        onChange={(event) => {
                            setVpsId(event.target.value);
                            if (errors.vps) setErrors({ ...errors, vps: '' });
                        }}
                        className={clsx(
                            inputClassName,
                            "transition-colors",
                            errors.vps ? "border-rose-500 focus:border-rose-400" : "border-white/10"
                        )}
                        disabled={isSubmitting}
                    >
                        <option value="">Select VPS</option>
                        {vps.data.map((server) => <option key={server.id} value={server.id}>{server.name} ({server.ipAddress})</option>)}
                    </select>
                </Field>
                <Field label="Environment">
                    <select
                        value={environment}
                        onChange={(event) => setEnvironment(event.target.value as EnvName)}
                        className={inputClassName}
                        disabled={isSubmitting}
                    >
                        <option value="production">Production</option>
                        <option value="development">Development</option>
                    </select>
                </Field>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                <p className="font-black text-white">Manual Deployment</p>
                <p className="mt-1">Upload deployments support logs, restart, and restoring the last container snapshot. Git commit rollback, webhooks, and branch switching are disabled.</p>
            </div>
            <ExecutionModeSelector mode={mode} setMode={setMode} />
            {mode === 'production' ? (
                <HostingConfiguration
                    hostType={hostType}
                    setHostType={setHostType}
                    domainName={domainName}
                    setDomainName={setDomainName}
                    ipPreview={selectedVps ? `http://${selectedVps.ipAddress}:auto` : 'Select a VPS to preview IP hosting'}
                    error={errors.domain}
                />
            ) : (
                <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-400">
                    <p className="font-black text-white">Sandbox Networking</p>
                    <p className="mt-1">Sandbox runs use direct ephemeral port access and skip Nginx/domain routing.</p>
                </div>
            )}
            <EnvironmentVariablesEditor enabled={useEnv} setEnabled={setUseEnv} files={envFiles} setFiles={setEnvFiles} error={errors.env} />
            <Button onClick={submit} loading={deploy.isPending} disabled={isSubmitting}>
                <PackagePlus size={16} /> {mode === 'sandbox' ? 'Run sandbox' : 'Deploy upload'}
            </Button>
        </Panel>
    );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
    return (
        <label className="space-y-2 block">
            <span className="block text-xs font-black uppercase text-slate-500">{label}</span>
            {children}
            {error && <p className="text-xs font-semibold text-rose-400">{error}</p>}
        </label>
    );
}

function HostingConfiguration({
    hostType,
    setHostType,
    domainName,
    setDomainName,
    ipPreview,
    error,
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
        <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4">
            <p className="font-black text-white">Hosting Configuration</p>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label className={hostType === 'ip' ? 'rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-4' : 'rounded-lg border border-white/10 bg-white/[0.04] p-4'}>
                    <span className="flex items-center gap-3 font-black text-white">
                        <input type="radio" checked={hostType === 'ip'} onChange={() => setHostType('ip')} className="accent-cyan-300" />
                        Use IP Hosting
                    </span>
                    <span className="mt-2 block text-sm text-slate-400">{ipPreview}</span>
                </label>
                <label className={hostType === 'domain' ? 'rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-4' : 'rounded-lg border border-white/10 bg-white/[0.04] p-4'}>
                    <span className="flex items-center gap-3 font-black text-white">
                        <input type="radio" checked={hostType === 'domain'} onChange={() => setHostType('domain')} className="accent-cyan-300" />
                        Use Custom Domain
                    </span>
                    <input
                        value={domainName}
                        onChange={(event) => setDomainName(event.target.value.trim().toLowerCase())}
                        disabled={hostType !== 'domain'}
                        placeholder="example.com or app.example.com"
                        className={clsx(
                            inputClassName,
                            "mt-3 transition-colors",
                            error ? "border-rose-500 focus:border-rose-400" : "border-white/10"
                        )}
                    />
                    <span className={clsx("mt-2 block text-sm", error ? "text-rose-400 font-semibold" : "text-slate-400")}>
                        {error || (domainInvalid ? 'Enter a valid domain without http://, spaces, or paths.' : domainName ? `http://${domainName}` : 'Root domains and subdomains are supported.')}
                    </span>
                </label>
            </div>
        </div>
    );
}

function ExecutionModeSelector({ mode, setMode }: { mode: ExecutionMode; setMode: (mode: ExecutionMode) => void }) {
    return (
        <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4">
            <p className="font-black text-white">Execution Mode</p>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label className={mode === 'production' ? 'rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-4' : 'rounded-lg border border-white/10 bg-white/[0.04] p-4'}>
                    <span className="flex items-center gap-3 font-black text-white">
                        <input type="radio" checked={mode === 'production'} onChange={() => setMode('production')} className="accent-cyan-300" />
                        Production Deployment
                    </span>
                    <span className="mt-2 block text-sm text-slate-400">Persistent container, domain routing, rollback, and lifecycle controls.</span>
                </label>
                <label className={mode === 'sandbox' ? 'rounded-lg border border-amber-300/30 bg-amber-300/10 p-4' : 'rounded-lg border border-white/10 bg-white/[0.04] p-4'}>
                    <span className="flex items-center gap-3 font-black text-white">
                        <input type="radio" checked={mode === 'sandbox'} onChange={() => setMode('sandbox')} className="accent-cyan-300" />
                        Sandbox Run
                    </span>
                    <span className="mt-2 block text-sm text-slate-400">Temporary test container with direct port access and auto cleanup.</span>
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
    error,
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
        if (path.split(/[/\\]/).some(p => p === '..')) return false;
        const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        const fileName = normalized.split('/').pop() || '';
        return fileName.startsWith('.env');
    };

    const handleAddFile = () => {
        const path = newFilePath.trim();
        if (!validatePath(path)) {
            useToastStore.getState().addToast({
                title: 'Invalid File Path',
                description: 'Path must end with a file starting with .env (e.g. apps/client/.env) and contain no traversal.',
                severity: 'error'
            });
            return;
        }
        if (files.some(f => f.path === path)) {
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
        const hasConflicts = keys.some(k => k in (activeFile.variables || {}));
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
        <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4 space-y-4">
            <label className="flex items-center justify-between gap-4">
                <span>
                    <span className="block font-black text-white">Environment Variables <span className="text-slate-500">(Optional)</span></span>
                    <span className="mt-1 block text-sm text-slate-400">Scoped multi-file configurations. Values are encrypted and securely masked.</span>
                </span>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-5 w-5 accent-cyan-300" />
            </label>

            {enabled && (
                <div className="border border-white/10 rounded-lg overflow-hidden bg-slate-950/80">
                    <div className="flex flex-col lg:flex-row min-h-[400px]">
                        {/* Sidebar: Files List */}
                        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-white/[0.08] p-4 bg-white/[0.01]">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Env Files</span>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setShowAddFile(!showAddFile)}
                                >
                                    <Plus size={12} /> Add
                                </Button>
                            </div>

                            {showAddFile && (
                                <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                                    <p className="text-[10px] font-bold text-cyan-300">File path (relative to repo root)</p>
                                    <input
                                        value={newFilePath}
                                        onChange={(e) => setNewFilePath(e.target.value)}
                                        placeholder="apps/server/.env"
                                        className={inputClassName}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                        <Button type="button" variant="secondary" className="h-7 px-2 text-xs" onClick={() => { setShowAddFile(false); setNewFilePath(''); }}>Cancel</Button>
                                        <Button type="button" variant="primary" className="h-7 px-2 text-xs" onClick={handleAddFile}>Create</Button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 terminal-scrollbar max-h-[220px] lg:max-h-none">
                                {files.map((file, idx) => {
                                    const isActive = idx === activeFileIndex;
                                    const isRenaming = renamingIndex === idx;

                                    return (
                                        <div
                                            key={file.path}
                                            onClick={() => !isRenaming && setActiveFileIndex(idx)}
                                            className={clsx(
                                                'group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer border transition-colors',
                                                isActive
                                                    ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-200'
                                                    : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:bg-white/[0.04] hover:text-white'
                                            )}
                                        >
                                            {isRenaming ? (
                                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        value={renamingPath}
                                                        onChange={(e) => setRenamingPath(e.target.value)}
                                                        className={clsx(inputClassName, 'h-7 py-0 px-2 text-xs')}
                                                    />
                                                    <Button type="button" variant="primary" className="h-7 w-7 p-0 shrink-0 text-xs" onClick={() => handleRenameFile(idx)}>✓</Button>
                                                    <Button type="button" variant="secondary" className="h-7 w-7 p-0 shrink-0 text-xs" onClick={() => { setRenamingIndex(null); setRenamingPath(''); }}>✕</Button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="truncate font-mono">{file.path}</span>
                                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRenamingIndex(idx);
                                                                setRenamingPath(file.path);
                                                            }}
                                                            className="p-1 hover:text-white"
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
                                                                className="p-1 hover:text-rose-400"
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

                            <div className="text-[10px] text-slate-500 border-t border-white/[0.08] pt-2">
                                {files.length}/20 files. Total variables: {totalVariables}/200.
                            </div>
                        </div>

                        {/* Editor Panel */}
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden p-4">
                            <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                                <div className="flex flex-col">
                                    <h4 className="text-sm font-bold text-white font-mono">{activeFile.path}</h4>
                                    <span className="text-[10px] text-slate-500">
                                        {Object.keys(activeFile.variables || {}).length} variables
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setIsBulkEdit(!isBulkEdit)}
                                    >
                                        {isBulkEdit ? 'Table Editor' : 'Bulk Edit / Text'}
                                    </Button>
                                </div>
                            </div>

                            {isBulkEdit ? (
                                // Bulk Text Area Editor
                                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                    <p className="text-xs text-slate-400">
                                        Paste key-value pairs formatted as <code>KEY=VALUE</code>, one per line.
                                    </p>
                                    <textarea
                                        value={bulkText}
                                        onChange={(e) => setBulkText(e.target.value)}
                                        className={clsx(
                                            inputClassName,
                                            'min-h-[200px] flex-1 font-mono text-xs p-3 leading-relaxed resize-none bg-slate-950/80 border-white/[0.08] focus:border-cyan-500/50 terminal-scrollbar'
                                        )}
                                        placeholder="API_KEY=supersecretkey&#10;DEBUG=true"
                                    />
                                    <div className="flex justify-end gap-2 shrink-0">
                                        <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setIsBulkEdit(false)}>Cancel</Button>
                                        <Button type="button" variant="primary" className="h-8 px-3 text-xs" onClick={handleBulkImport}>Import & Merge</Button>
                                    </div>
                                </div>
                            ) : (
                                // Table Editor
                                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                                    {/* Filters */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="relative flex-1">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search keys..."
                                                className={clsx(inputClassName, 'pl-9 h-9')}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="h-9 shrink-0 px-2 text-xs"
                                            onClick={() => setSortBy(v => v === 'none' ? 'key' : 'none')}
                                            title="Sort A-Z"
                                        >
                                            <ArrowUpDown size={14} className={sortBy === 'key' ? 'text-cyan-300' : 'text-slate-500'} />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="primary"
                                            className="h-9 shrink-0 px-3 text-xs"
                                            onClick={handleAddVar}
                                        >
                                            <Plus size={14} /> Add Variable
                                        </Button>
                                    </div>

                                    {/* Variables List */}
                                    <div className="flex-1 overflow-y-auto border border-white/[0.06] rounded-lg divide-y divide-white/[0.05] bg-white/[0.01] pr-1 terminal-scrollbar max-h-[300px]">
                                        {filteredVariables.length === 0 ? (
                                            <div className="py-12 text-center text-xs text-slate-500 italic">
                                                {searchQuery ? 'No matching variables found.' : 'No environment variables configured.'}
                                            </div>
                                        ) : (
                                            filteredVariables.map(([key, val]) => {
                                                const isKeyValid = validateKey(key);
                                                return (
                                                    <div key={key} className="flex flex-col sm:flex-row gap-3 p-3 items-start sm:items-center">
                                                        {/* Key Input */}
                                                        <div className="flex-1 w-full space-y-1">
                                                            <input
                                                                defaultValue={key}
                                                                onBlur={(e) => handleUpdateVarKey(key, e.target.value)}
                                                                placeholder="VARIABLE_KEY"
                                                                className={clsx(
                                                                    inputClassName,
                                                                    'font-mono text-xs h-8',
                                                                    !isKeyValid && 'border-rose-500/50 bg-rose-500/5 focus:border-rose-500'
                                                                )}
                                                            />
                                                            {!isKeyValid && (
                                                                <p className="text-[10px] font-semibold text-rose-400">
                                                                    Must start with letter/underscore and contain only A-Z, 0-9, _.
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* Value Input */}
                                                        <div className="flex-1 w-full">
                                                            <PasswordInput
                                                                value={val}
                                                                onChange={(e) => handleUpdateVarValue(key, e.target.value)}
                                                                placeholder="variable_value"
                                                                className={clsx(inputClassName, 'font-mono text-xs h-8 pr-12')}
                                                            />
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                className="h-8 w-8 p-0 text-xs"
                                                                onClick={() => handleDuplicateVar(key, val)}
                                                                title="Duplicate"
                                                            >
                                                                <Copy size={12} />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                className="h-8 w-8 p-0 hover:text-rose-400 text-xs"
                                                                onClick={() => handleDeleteVar(key)}
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
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

            {error && <p className="text-xs font-semibold text-rose-400">{error}</p>}

            {/* Overwrite Confirmation */}
            {showConfirmOverwrite && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
                    <p className="text-xs text-yellow-200">
                        Some variables you are importing already exist in this file. Importing will overwrite their current values.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" className="h-7 px-3 text-xs" onClick={() => setShowConfirmOverwrite(false)}>Cancel</Button>
                        <Button type="button" variant="primary" className="h-7 px-3 text-xs" onClick={confirmBulkImport}>Overwrite & Merge</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function isValidDomainInput(value: string) {
    const clean = value.trim().toLowerCase();
    if (!clean || /^https?:\/\//i.test(clean) || clean.includes('/') || clean.includes(' ') || clean.includes('_') || clean.includes('..') || !clean.includes('.')) return false;
    const labels = clean.split('.');
    if (labels.length < 2) return false;
    if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1])) return false;
    return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
