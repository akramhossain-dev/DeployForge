import { EventEmitter } from 'events';

class MonitoringEventEmitter extends EventEmitter {}

export const monitoringEventEmitter = new MonitoringEventEmitter();

export const MONITORING_EVENTS = {
    ALERT_CREATED: 'monitoring:alert_created',
    METRICS_COLLECTED: 'monitoring:metrics_collected',
    SERVER_STATUS_CHANGED: 'monitoring:server_status_changed',
} as const;
