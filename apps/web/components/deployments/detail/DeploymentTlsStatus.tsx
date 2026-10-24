import clsx from 'clsx';
import type { Domain } from '@/lib/api/types';

type Props = {
    domain?: Domain | null;
    hostname?: string | null;
    compact?: boolean;
};

const statusStyles: Record<string, string> = {
    ISSUED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    FAILED: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    NONE: 'border-[#333333] bg-[#111111] text-[#A1A1A1]',
};

export function DeploymentTlsStatus({ domain, hostname, compact = false }: Props) {
    const status = String(domain?.sslStatus || (hostname ? 'PENDING' : 'NONE')).toUpperCase();
    const label = status === 'ISSUED' ? 'TLS issued' : status === 'FAILED' ? 'TLS failed' : status === 'PENDING' ? 'TLS pending' : 'TLS not configured';

    if (compact) {
        return <span className={clsx('font-mono text-[10px]', status === 'ISSUED' ? 'text-emerald-400' : status === 'FAILED' ? 'text-rose-400' : status === 'PENDING' ? 'text-amber-300' : 'text-[#666666]')}>{label}</span>;
    }

    return (
        <div className={clsx('rounded-md border p-3 font-mono text-xs', statusStyles[status] || statusStyles.NONE)}>
            <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Certificate status</span>
                <span className="rounded border border-current/30 px-2 py-0.5 text-[10px] font-bold uppercase">{label}</span>
            </div>
            <p className="mt-2 text-[11px] opacity-80">
                {status === 'ISSUED' && `Application is running and HTTPS is active${domain?.sslIssuer ? ` via ${domain.sslIssuer}` : ''}.`}
                {status === 'PENDING' && 'Application deployment succeeded; certificate verification is still in progress.'}
                {status === 'FAILED' && `Application deployment may still be healthy, but HTTPS provisioning failed${domain?.sslError ? `: ${domain.sslError}` : '.'}`}
                {status === 'NONE' && 'No custom-domain certificate has been requested.'}
            </p>
        </div>
    );
}
