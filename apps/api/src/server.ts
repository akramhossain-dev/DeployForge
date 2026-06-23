import { buildApp } from './app';
import { config } from './config/env';
import './workers/deployment.worker';
import { HardeningService } from './services/hardening.service';
import { BackupService } from './services/backup.service';
import { SuperAdminService } from './services/superadmin.service';
import { VPSService } from './services/vps.service';

async function start() {
    // Sync/ensure Super Admin exists on startup
    await SuperAdminService.ensureSuperAdmin();

    const app = await buildApp();

    try {
        const address = await app.listen({ port: config.app.port, host: '0.0.0.0' });
        app.log.info({ address }, 'Server listening');

        // Run database data retention cleanup once on startup and then every 24 hours
        void HardeningService.runDataRetentionCleanup();
        setInterval(() => {
            void HardeningService.runDataRetentionCleanup();
        }, 24 * 60 * 60 * 1000);

        // Run automated backup every 24 hours
        setInterval(() => {
            void BackupService.runScheduledBackup();
        }, 24 * 60 * 60 * 1000);

        // Start automated VPS health checks (runs on startup + every 5 mins)
        VPSService.startScheduledHealthChecks();
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();
