import { buildApp } from './app';
import { config } from './config/env';
import './workers/deployment.worker';
import { HardeningService } from './services/hardening.service';

async function start() {
    const app = await buildApp();

    try {
        const address = await app.listen({ port: config.app.port, host: '0.0.0.0' });
        app.log.info({ address }, 'Server listening');

        // Run database data retention cleanup once on startup and then every 24 hours
        void HardeningService.runDataRetentionCleanup();
        setInterval(() => {
            void HardeningService.runDataRetentionCleanup();
        }, 24 * 60 * 60 * 1000);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();
