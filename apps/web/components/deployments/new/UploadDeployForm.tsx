'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
    CheckCircle2, Loader2, UploadCloud
} from 'lucide-react';
import {
    useCreateUploadDeployment,
    useVpsList,
    type EnvFile
} from '@/hooks/useDeployForgeData';
import { INPUT_STYLE } from '@/components/ui';
import { validateEnvFiles } from '@/lib/utils/envValidation';
import { ExecutionModeSelector } from './ExecutionModeSelector';
import { HostingConfiguration, isValidDomainInput } from './HostingConfiguration';
import { EnvironmentVariablesEditor } from './EnvironmentVariablesEditor';

type EnvName = 'production' | 'development';
type ExecutionMode = 'production' | 'sandbox';

export function UploadDeployForm() {
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
            const check = validateEnvFiles(envFiles);
            if (!check.valid && check.error) {
                newErrors.env = check.error;
                isValidForm = false;
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
                    disabled={isSubmitting}
                    className="flex h-9 items-center gap-2 rounded-md border border-[#1F1F1F] bg-white px-5 text-xs font-semibold text-black transition-colors hover:bg-[#E5E5E5] disabled:opacity-50"
                >
                    {isSubmitting ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <>
                            <UploadCloud size={14} />
                            <span>{mode === 'sandbox' ? 'Run Sandbox Test' : 'Upload & Trigger Release'}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
