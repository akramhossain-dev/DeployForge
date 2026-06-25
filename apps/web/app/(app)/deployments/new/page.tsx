'use client';

import { useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CheckCircle2, Github, PackagePlus, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Panel, SkeletonBlock, StatusBadge, inputClassName } from '@/components/ui';
import { useCreateGithubDeployment, useCreateUploadDeployment, useRepositories, useVpsList } from '@/hooks/useDeployForgeData';

type EnvName = 'production' | 'development';
type EnvRow = { id: string; key: string; value: string };
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
    const [envRows, setEnvRows] = useState<EnvRow[]>([]);

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
        if (useEnv && hasInvalidEnvRows(envRows)) {
            newErrors.env = 'One or more environment variable keys are invalid';
            isValid = false;
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
                env: useEnv ? envRowsToRecord(envRows) : {},
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
            <EnvironmentVariablesEditor enabled={useEnv} setEnabled={setUseEnv} rows={envRows} setRows={setEnvRows} error={errors.env} />
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
    const [envRows, setEnvRows] = useState<EnvRow[]>([]);

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
        if (useEnv && hasInvalidEnvRows(envRows)) {
            newErrors.env = 'One or more environment variable keys are invalid';
            isValidForm = false;
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
                env: useEnv ? envRowsToRecord(envRows) : {},
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
            <EnvironmentVariablesEditor enabled={useEnv} setEnabled={setUseEnv} rows={envRows} setRows={setEnvRows} error={errors.env} />
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
    rows,
    setRows,
    error,
}: {
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    rows: EnvRow[];
    setRows: (rows: EnvRow[]) => void;
    error?: string;
}) {
    const invalid = enabled && hasInvalidEnvRows(rows);

    function addRow() {
        setRows([...rows, { id: crypto.randomUUID(), key: '', value: '' }]);
    }

    function updateRow(id: string, patch: Partial<EnvRow>) {
        setRows(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
    }

    function removeRow(id: string) {
        setRows(rows.filter((row) => row.id !== id));
    }

    return (
        <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4">
            <label className="flex items-center justify-between gap-4">
                <span>
                    <span className="block font-black text-white">Environment Variables <span className="text-slate-500">(Optional)</span></span>
                    <span className="mt-1 block text-sm text-slate-400">Values are encrypted and masked after deploy.</span>
                </span>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-5 w-5 accent-cyan-300" />
            </label>
            {enabled ? (
                <div className="mt-4 space-y-3">
                    {rows.length === 0 ? (
                        <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-500">No environment variables added.</div>
                    ) : (
                        <div className="space-y-2">
                            {rows.map((row) => (
                                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                                    <input value={row.key} onChange={(event) => updateRow(row.id, { key: event.target.value })} placeholder="KEY" className={inputClassName} />
                                    <input value={row.value} onChange={(event) => updateRow(row.id, { value: event.target.value })} placeholder="Value" className={inputClassName} />
                                    <button type="button" onClick={() => removeRow(row.id)} className="flex h-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 hover:text-rose-200" aria-label="Remove environment variable">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {error ? <p className="text-xs font-bold text-rose-400">{error}</p> : invalid ? <p className="text-xs font-bold text-rose-200">Keys must start with a letter or underscore and contain only letters, numbers, and underscores.</p> : null}
                    <Button type="button" variant="secondary" onClick={addRow}><Plus size={16} /> Add row</Button>
                </div>
            ) : null}
        </div>
    );
}

function envRowsToRecord(rows: EnvRow[]) {
    return rows.reduce<Record<string, string>>((acc, row) => {
        const key = row.key.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) acc[key] = row.value;
        return acc;
    }, {});
}

function hasInvalidEnvRows(rows: EnvRow[]) {
    return rows.some((row) => {
        const key = row.key.trim();
        return key.length > 0 && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    });
}

function isValidDomainInput(value: string) {
    const clean = value.trim().toLowerCase();
    if (!clean || /^https?:\/\//i.test(clean) || clean.includes('/') || clean.includes(' ') || clean.includes('_') || clean.includes('..') || !clean.includes('.')) return false;
    const labels = clean.split('.');
    if (labels.length < 2) return false;
    if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1])) return false;
    return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
