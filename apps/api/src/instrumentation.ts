import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, '');
const enabled = process.env.OTEL_ENABLED === 'true' || Boolean(endpoint);
let sdk: NodeSDK | undefined;

if (enabled) {
    sdk = new NodeSDK({
        serviceName: process.env.OTEL_SERVICE_NAME || 'deployforge-api',
        traceExporter: new OTLPTraceExporter(endpoint ? { url: `${endpoint}/v1/traces` } : undefined),
        instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
}

export async function shutdownTelemetry() {
    await sdk?.shutdown();
}
