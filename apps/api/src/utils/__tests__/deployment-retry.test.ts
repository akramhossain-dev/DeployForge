import { describe, expect, it } from 'vitest';
import { classifyDeploymentError, deploymentRetryDecision } from '../deployment-retry';

describe('deployment retry policy', () => {
    it.each([
        'SSH_TIMEOUT',
        'HOST_UNREACHABLE',
        'CONNECTION_RESET',
        'SSH_COMMAND_FAILED',
        'VPS_CAPACITY_BUSY',
        'ETIMEDOUT',
    ])('retries transient error %s', (code) => {
        expect(classifyDeploymentError({ code }).retryable).toBe(true);
    });

    it.each([
        'COMPOSE_FORBIDDEN_OPTION',
        'INVALID_ENV_KEY',
        'DEPENDENCY_INSTALL_FAILED',
        'DOCKER_BUILD_FAILED',
        'INVALID_CREDENTIALS',
    ])('does not retry permanent error %s', (errorCode) => {
        expect(classifyDeploymentError({ errorCode }).retryable).toBe(false);
    });

    it('retries a busy deployment slot without treating it as permanent', () => {
        expect(classifyDeploymentError(new Error('The VPS build slot is currently busy')).retryable).toBe(true);
    });

    it('stops after the configured attempt count', () => {
        expect(deploymentRetryDecision({ code: 'SSH_TIMEOUT' }, 0, 3)).toMatchObject({ attempt: 1, shouldRetry: true, isFinalFailure: false });
        expect(deploymentRetryDecision({ code: 'SSH_TIMEOUT' }, 2, 3)).toMatchObject({ attempt: 3, shouldRetry: false, isFinalFailure: true });
    });

    it('marks permanent errors final on the first attempt', () => {
        expect(deploymentRetryDecision({ errorCode: 'COMPOSE_FORBIDDEN_OPTION' }, 0, 3)).toMatchObject({ attempt: 1, shouldRetry: false, isFinalFailure: true });
    });
});
