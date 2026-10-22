import { Worker } from 'bullmq';
import { redisConnection } from '../utils/queue';
import { MaintenanceService } from '../services/maintenance.service';
import { logger } from '../utils/logger';

export const maintenanceWorker = new Worker('maintenance-queue', async (job) => {
    if (job.name !== 'daily-cleanup' || job.data?.operation !== 'cleanup') throw new Error('Invalid maintenance job payload');
    await MaintenanceService.runDaily();
}, { connection: redisConnection as any, concurrency: 1 });

maintenanceWorker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Maintenance job failed'));
