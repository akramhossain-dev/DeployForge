import { buildApp } from './app';
import { config } from './config/env';

async function start() {
    const app = await buildApp();

    try {
        const address = await app.listen({ port: config.PORT, host: '0.0.0.0' });
        console.log(`🚀 Server listening at ${address}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();
