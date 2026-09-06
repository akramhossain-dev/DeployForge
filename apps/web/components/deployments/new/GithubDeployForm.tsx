'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
    Github, Loader2, PackagePlus
} from 'lucide-react';
import {
    useCreateGithubDeployment,
    useRepositories,
    useVpsList,
    type EnvFile
} from '@/hooks/useDeployForgeData';
import { StatusBadge, INPUT_STYLE } from '@/components/ui';
import { validateEnvFiles } from '@/lib/utils/envValidation';
import { ExecutionModeSelector } from './ExecutionModeSelector';
import { HostingConfiguration, isValidDomainInput } from './HostingConfiguration';
import { EnvironmentVariablesEditor } from './EnvironmentVariablesEditor';

type EnvName = 'production' | 'development';
type ExecutionMode = 'production' | 'sandbox';

export function GithubDeployForm() {
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
            const check = validateEnvFiles(envFiles);
            if (!check.valid && check.error) {
                newErrors.env = check.error;
                isValid = false;
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
                    ipPreview={selectedVps ? `${(selectedRepo?.name || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-')}-preview.${selectedVps.ipAddress}.sslip.io` : 'Select a VPS node to preview ingress URL'}
                    error={errors.domain}
                />
            ) : (
                <div className="rounded-md border border-[#1F1F1F] bg-[#111111] p-4 text-xs text-[#A1A1A1]">
                    <p className="font-semibold text-white">Sandbox Ephemeral Networking</p>
                    <p className="mt-1">Sandbox runs use direct host port routing and bypass Traefik Ingress gateway and domain attachments.</p>
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
