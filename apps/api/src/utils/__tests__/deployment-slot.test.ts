import { describe, expect, it } from 'vitest';
import { DeploymentSlotBusyError, deploymentQueueState } from '../deployment-slot';

describe('deploymentQueueState', () => {
    it('exposes VPS and project waits without adding deployment statuses', () => {
        expect(deploymentQueueState('QUEUED', 'VPS_BUSY')).toBe('WAITING_FOR_VPS');
        expect(deploymentQueueState('QUEUED', 'PROJECT_BUSY')).toBe('WAITING_FOR_PROJECT');
        expect(deploymentQueueState('QUEUED', null)).toBe('QUEUED');
    });

    it('preserves terminal and running states', () => {
        expect(deploymentQueueState('RUNNING')).toBe('RUNNING');
        expect(deploymentQueueState('SUCCESS')).toBe('SUCCESS');
        expect(deploymentQueueState('FAILED')).toBe('FAILED');
        expect(deploymentQueueState()).toBe('IDLE');
    });
});

describe('DeploymentSlotBusyError', () => {
    it('carries a stable scope and error code', () => {
        const error = new DeploymentSlotBusyError('VPS');
        expect(error.code).toBe('DEPLOYMENT_SLOT_BUSY');
        expect(error.scope).toBe('VPS');
        expect(error.message).toContain('VPS build slot');
    });
});
