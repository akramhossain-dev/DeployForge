export class DeploymentError extends Error {
    stage: string;
    errorCode: string;

    constructor(stage: string, message: string, errorCode: string) {
        super(message);
        this.name = 'DeploymentError';
        this.stage = stage;
        this.errorCode = errorCode;
    }
}
