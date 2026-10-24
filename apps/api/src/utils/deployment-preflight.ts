export type PreflightGateKind = 'WARNING' | 'BLOCKED';

export class PreflightGateError extends Error {
    readonly code: string;
    readonly stage = 'preflight';

    constructor(readonly kind: PreflightGateKind, message: string) {
        super(message);
        this.name = 'PreflightGateError';
        this.code = kind === 'BLOCKED' ? 'PREFLIGHT_BLOCKED' : 'PREFLIGHT_WARNING_APPROVAL_REQUIRED';
    }
}

export function isPreflightGate(error: unknown): error is PreflightGateError {
    return error instanceof PreflightGateError;
}
