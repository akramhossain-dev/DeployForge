export type DeploymentJobOperation = 'deploy' | 'rollback' | 'sandbox-cleanup';

export type DeploymentJobPayload = {
    deploymentId: string;
    operation: DeploymentJobOperation;
};

export function deploymentJobPayload(
    deploymentId: string,
    operation: DeploymentJobOperation,
): DeploymentJobPayload {
    return { deploymentId, operation };
}

export function parseDeploymentJobPayload(value: unknown): DeploymentJobPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid deployment job payload');
    }
    const data = value as Record<string, unknown>;
    const keys = Object.keys(data);
    if (
        keys.length !== 2
        || !keys.includes('deploymentId')
        || !keys.includes('operation')
        || typeof data.deploymentId !== 'string'
        || !data.deploymentId
        || (data.operation !== 'deploy' && data.operation !== 'rollback' && data.operation !== 'sandbox-cleanup')
    ) {
        throw new Error('Invalid deployment job payload');
    }
    return data as DeploymentJobPayload;
}
