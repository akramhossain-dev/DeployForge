import { ApiError } from '@/lib/api/client';

function mib(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value).toLocaleString()} MiB` : 'unknown';
}

export function DeploymentRequestError({ error, prefix }: { error: unknown; prefix: string }) {
    const apiError = error instanceof ApiError ? error : null;
    const details = apiError?.details as any;
    const isCapacity = Boolean(apiError?.errorCode?.includes('CAPACITY') || apiError?.errorCode === 'DEPLOYMENT_LIMIT_REACHED');

    return (
        <div className="rounded border border-rose-900/50 bg-rose-950/20 p-3 text-rose-300">
            <p className="font-semibold">{prefix}: {(error as Error)?.message || 'Request failed'}</p>
            {isCapacity && details ? (
                <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-rose-200 sm:grid-cols-2">
                    <span>Requested RAM: {mib(details.requested?.memoryMiB)}</span>
                    <span>Available RAM: {mib(details.available?.memoryMiB)}</span>
                    <span>Required RAM reserve: {mib(details.requiredReserve?.memoryMiB)}</span>
                    <span>Required disk reserve: {mib(details.requiredReserve?.diskMiB)}</span>
                </div>
            ) : null}
            {apiError?.requestId ? <p className="mt-2 text-[10px] text-rose-400">Request ID: {apiError.requestId}</p> : null}
        </div>
    );
}
