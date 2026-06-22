import { EventEmitter } from 'events';

class DeploymentEventEmitter extends EventEmitter {}

export const deploymentEventEmitter = new DeploymentEventEmitter();

export const DEPLOYMENT_EVENTS = {
    LOG_ADDED: 'deployment:log_added',
    STATUS_UPDATED: 'deployment:status_updated',
} as const;
