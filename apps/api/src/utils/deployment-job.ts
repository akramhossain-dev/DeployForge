export type DeploymentJobOperation = 'deploy' | 'rollback' | 'sandbox-cleanup';

export type DeploymentJobPayload = {
    deploymentId: string;
    operation: DeploymentJobOperation;
    correlationId?: string;
    traceContext?: TraceCarrier;
};

export function deploymentJobPayload(
    deploymentId: string,
    operation: DeploymentJobOperation,
    correlationId?: string,
): DeploymentJobPayload {
    const traceContext = currentTraceCarrier();
    return {
        deploymentId,
        operation,
        ...(correlationId ? { correlationId } : {}),
        ...(traceContext ? { traceContext } : {}),
    };
}

export function parseDeploymentJobPayload(value: unknown): DeploymentJobPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid deployment job payload');
    }
    const data = value as Record<string, unknown>;
    const keys = Object.keys(data);
    const allowedKeys = new Set(['deploymentId', 'operation', 'correlationId', 'traceContext']);
    const validTraceContext = data.traceContext === undefined || (
        data.traceContext !== null
        && typeof data.traceContext === 'object'
        && !Array.isArray(data.traceContext)
        && Object.values(data.traceContext as Record<string, unknown>).every((item) => typeof item === 'string')
    );
    if (
        keys.some((key) => !allowedKeys.has(key))
        || !keys.includes('deploymentId')
        || !keys.includes('operation')
        || typeof data.deploymentId !== 'string'
        || !data.deploymentId
        || (data.correlationId !== undefined && typeof data.correlationId !== 'string')
        || !validTraceContext
        || (data.operation !== 'deploy' && data.operation !== 'rollback' && data.operation !== 'sandbox-cleanup')
    ) {
        throw new Error('Invalid deployment job payload');
    }
    return data as DeploymentJobPayload;
}
import { currentTraceCarrier, type TraceCarrier } from './telemetry';
