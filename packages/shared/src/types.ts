export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type AuthProvider = 'local' | 'github' | 'google';

export interface User {
    id: string;
    email?: string | null;
    username?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    provider?: 'email' | 'github' | 'google' | string;
    authProvider?: AuthProvider | string;
    isVerified?: boolean;
    role?: Role | string;
    status?: UserStatus | string;
}

export type DeploymentStatus =
    | 'PENDING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'CLONING'
    | 'UPLOADING'
    | 'EXTRACTING'
    | 'RUNNING'
    | 'PAUSED'
    | 'SUCCESS'
    | 'FAILED'
    | 'STOPPED'
    | 'DELETING'
    | 'ROLLED_BACK'
    | 'DELETED';

export type DeploymentType = 'STATIC' | 'SERVER' | 'FULLSTACK';
export type SourceType = 'github' | 'upload';

export interface Deployment {
    id: string;
    projectId?: string;
    status: DeploymentStatus;
    commitHash?: string;
    port?: number | null;
    type?: DeploymentType | string;
    sourceType?: SourceType | string;
    createdAt: Date | string;
    updatedAt?: Date | string;
}

export type VpsStatus = 'active' | 'inactive' | 'failed';
export type VpsAuthType = 'key' | 'password' | 'ssh_key';
