export type DeploymentRetryClassification = {
    retryable: boolean;
    errorCode: string;
    reason: string;
};

const RETRYABLE_ERROR_CODES = new Set([
    'SSH_TIMEOUT',
    'HOST_UNREACHABLE',
    'CONNECTION_RESET',
    'SSH_COMMAND_FAILED',
    'SSH_CONNECTION_FAILED',
    'VPS_CAPACITY_BUSY',
    'VPS_CAPACITY_UNAVAILABLE',
]);

const RETRYABLE_SYSTEM_CODES = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
]);

function normalizedCode(error: any) {
    return String(error?.errorCode || error?.code || 'DEPLOYMENT_OPERATION_FAILED').trim().toUpperCase();
}

export function classifyDeploymentError(error: unknown): DeploymentRetryClassification {
    const value = error as any;
    const errorCode = normalizedCode(value);
    const message = String(value?.message || '').toLowerCase();

    if (RETRYABLE_ERROR_CODES.has(errorCode) || RETRYABLE_SYSTEM_CODES.has(errorCode)) {
        return { retryable: true, errorCode, reason: 'transient infrastructure failure' };
    }

    if (message.includes('another deployment for this project is already running')
        || message.includes('vps build slot is currently busy')) {
        return { retryable: true, errorCode: 'DEPLOYMENT_SLOT_BUSY', reason: 'deployment slot is temporarily busy' };
    }

    return { retryable: false, errorCode, reason: 'permanent deployment failure' };
}

export function deploymentRetryDecision(error: unknown, attemptsMade: number, maxAttempts: number) {
    const classification = classifyDeploymentError(error);
    const attempt = Math.max(0, attemptsMade) + 1;
    const attempts = Math.max(1, maxAttempts);
    const shouldRetry = classification.retryable && attempt < attempts;
    return {
        ...classification,
        attempt,
        maxAttempts: attempts,
        shouldRetry,
        isFinalFailure: !shouldRetry,
    };
}
