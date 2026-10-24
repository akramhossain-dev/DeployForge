import { describe, expect, it } from 'vitest';
import {
    DeploymentCancellationError,
    deploymentCancellationKey,
    isDeploymentCancellation,
} from '../deployment-cancellation';

describe('deployment cancellation', () => {
    it('uses a deployment-scoped cancellation key', () => {
        expect(deploymentCancellationKey('dep-1')).toBe('deployment-cancel:dep-1');
    });

    it('recognizes typed and serialized cancellation errors', () => {
        expect(isDeploymentCancellation(new DeploymentCancellationError())).toBe(true);
        expect(isDeploymentCancellation({ errorCode: 'DEPLOYMENT_CANCELED' })).toBe(true);
        expect(isDeploymentCancellation(new Error('cancelled'))).toBe(false);
    });
});
