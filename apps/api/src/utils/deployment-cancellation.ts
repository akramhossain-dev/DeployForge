export const deploymentCancellationKey = (deploymentId: string) => `deployment-cancel:${deploymentId}`;

export class DeploymentCancellationError extends Error {
    readonly code = 'DEPLOYMENT_CANCELED';
    readonly errorCode = 'DEPLOYMENT_CANCELED';
    readonly stage = 'cancellation';

    constructor(message = 'Deployment was cancelled by the user') {
        super(message);
        this.name = 'DeploymentCancellationError';
    }
}

export function isDeploymentCancellation(error: unknown): boolean {
    if (error instanceof DeploymentCancellationError) return true;
    if (!error || typeof error !== 'object') return false;
    const value = error as { code?: unknown; errorCode?: unknown };
    return value.code === 'DEPLOYMENT_CANCELED' || value.errorCode === 'DEPLOYMENT_CANCELED';
}
