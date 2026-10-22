export class DeploymentError extends Error {
    stage: string;
    errorCode: string;
    statusCode?: number;
    details?: Record<string, unknown>;

    constructor(stage: string, message: string, errorCode: string, statusCode?: number, details?: Record<string, unknown>) {
        super(message);
        this.name = 'DeploymentError';
        this.stage = stage;
        this.errorCode = errorCode;
        this.statusCode = statusCode;
        this.details = details;
    }
}
