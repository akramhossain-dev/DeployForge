import {
    context,
    propagation,
    SpanStatusCode,
    trace,
    type Span,
    type TextMapGetter,
} from '@opentelemetry/api';

export type TraceCarrier = Record<string, string>;

const carrierGetter: TextMapGetter<TraceCarrier> = {
    keys: (carrier) => Object.keys(carrier),
    get: (carrier, key) => carrier[key],
};

export function currentTraceCarrier(): TraceCarrier | undefined {
    const carrier: TraceCarrier = {};
    propagation.inject(context.active(), carrier);
    return Object.keys(carrier).length > 0 ? carrier : undefined;
}

export function extractedTraceContext(carrier?: TraceCarrier) {
    return carrier ? propagation.extract(context.active(), carrier, carrierGetter) : context.active();
}

export function annotateActiveSpan(attributes: Record<string, string | number | boolean | undefined>) {
    const span = trace.getSpan(context.active());
    if (!span) return;
    for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined) span.setAttribute(key, value);
    }
}

export async function withTraceSpan<T>(
    name: string,
    attributes: Record<string, string | number | boolean | undefined>,
    operation: (span: Span) => Promise<T>,
    carrier?: TraceCarrier,
): Promise<T> {
    const tracer = trace.getTracer('deployforge-api');
    return tracer.startActiveSpan(name, {}, extractedTraceContext(carrier), async (span) => {
        for (const [key, value] of Object.entries(attributes)) {
            if (value !== undefined) span.setAttribute(key, value);
        }
        try {
            return await operation(span);
        } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
            throw error;
        } finally {
            span.end();
        }
    });
}
