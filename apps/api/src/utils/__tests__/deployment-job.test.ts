import { describe, expect, it } from 'vitest';
import { deploymentJobPayload, parseDeploymentJobPayload } from '../deployment-job';

describe('deployment job payload', () => {
    it('contains only the database reference and operation', () => {
        expect(deploymentJobPayload('deployment-1', 'deploy')).toEqual({
            deploymentId: 'deployment-1',
            operation: 'deploy',
        });
    });

    it('rejects secrets and additional queue fields', () => {
        expect(() => parseDeploymentJobPayload({
            deploymentId: 'deployment-1',
            operation: 'deploy',
            accessToken: 'secret',
        })).toThrow('Invalid deployment job payload');
    });

    it('accepts the bounded cleanup operation', () => {
        expect(parseDeploymentJobPayload({
            deploymentId: 'deployment-1',
            operation: 'sandbox-cleanup',
        }).operation).toBe('sandbox-cleanup');
    });

    it('accepts rollback without carrying a target or secret in Redis', () => {
        expect(parseDeploymentJobPayload({ deploymentId: 'deployment-1', operation: 'rollback' })).toEqual({
            deploymentId: 'deployment-1',
            operation: 'rollback',
        });
    });
});
