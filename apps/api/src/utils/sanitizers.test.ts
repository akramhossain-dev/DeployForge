import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/deployment.service', () => ({
    DeploymentService: { envPreview: vi.fn(() => []) },
}));

describe('formatDeploymentResponse Phase 5 contracts', () => {
    it('exposes structured operation recovery details without raw job data or secrets', async () => {
        const { formatDeploymentResponse } = await import('./sanitizers');
        const response = formatDeploymentResponse({
            id: 'deployment-1',
            status: 'FAILED',
            env: 'encrypted-secret',
            resourceTier: 'FULLSTACK',
            cpuLimitMillis: 2000,
            memoryLimitMiB: 2048,
            pidsLimit: 512,
            storageLimitMiB: 5120,
            jobs: [{
                lastError: JSON.stringify({
                    message: 'Multiple web services found',
                    errorCode: 'COMPOSE_INGRESS_AMBIGUOUS',
                    stage: 'compose_validation',
                    details: { candidates: [{ service: 'web', ports: [3000] }] },
                }),
            }],
            project: { activeRelease: null, candidateRelease: null, releases: [] },
            domains: [],
        });

        expect(response).toMatchObject({
            operationError: {
                errorCode: 'COMPOSE_INGRESS_AMBIGUOUS',
                details: { candidates: [{ service: 'web', ports: [3000] }] },
            },
            resourceTier: 'FULLSTACK',
        });
        expect(response).not.toHaveProperty('env');
        expect(response).not.toHaveProperty('jobs');
    });
});
