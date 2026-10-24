export type DeploymentSlotScope = 'PROJECT' | 'VPS';

export class DeploymentSlotBusyError extends Error {
    readonly code = 'DEPLOYMENT_SLOT_BUSY';

    constructor(readonly scope: DeploymentSlotScope) {
        super(scope === 'VPS'
            ? 'The VPS build slot is currently busy'
            : 'Another deployment for this project is already running');
        this.name = 'DeploymentSlotBusyError';
    }
}

export type DeploymentQueueState =
    | 'IDLE'
    | 'QUEUED'
    | 'WAITING_FOR_VPS'
    | 'WAITING_FOR_PROJECT'
    | 'RUNNING'
    | 'SUCCESS'
    | 'FAILED';

export function deploymentQueueState(status?: string | null, waitReason?: string | null): DeploymentQueueState {
    if (!status) return 'IDLE';
    if (status === 'QUEUED' && waitReason === 'VPS_BUSY') return 'WAITING_FOR_VPS';
    if (status === 'QUEUED' && waitReason === 'PROJECT_BUSY') return 'WAITING_FOR_PROJECT';
    if (status === 'QUEUED') return 'QUEUED';
    if (status === 'RUNNING') return 'RUNNING';
    if (status === 'SUCCESS') return 'SUCCESS';
    if (status === 'FAILED') return 'FAILED';
    return 'IDLE';
}
