export interface User {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
}

export type DeploymentStatus = 'QUEUED' | 'BUILDING' | 'DEPLOYING' | 'SUCCESS' | 'FAILED' | 'ROLLBACK';

export interface Deployment {
    id: string;
    projectId: string;
    status: DeploymentStatus;
    commitHash?: string;
    port?: number;
    createdAt: Date;
}
