export type User = {
    id: string;
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
    isVerified?: boolean;
};

export type GitHubProfile = {
    id: string;
    username: string;
    email?: string | null;
    avatarUrl?: string | null;
    connectedAt?: string;
};

export type Repository = {
    id: string;
    repoId: string;
    name: string;
    fullName: string;
    description?: string | null;
    private: boolean;
    defaultBranch: string;
    webhookId?: string | null;
    updatedAt: string;
    createdAt: string;
};

export type VpsHealth = {
    id?: string;
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime?: number;
    dockerInstalled?: boolean;
    nginxInstalled?: boolean;
    checkedAt?: string;
};

export type Vps = {
    id: string;
    name: string;
    ipAddress: string;
    port: number;
    username: string;
    authType: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | string;
    healthRecords?: VpsHealth[];
    createdAt: string;
    updatedAt: string;
};

export type Project = {
    id: string;
    name: string;
    repositoryUrl: string;
    branch: string;
    framework?: string | null;
};

export type Deployment = {
    id: string;
    name?: string | null;
    status: 'PENDING' | 'BUILDING' | 'RUNNING' | 'FAILED' | 'STOPPED' | string;
    framework?: string | null;
    port?: number | null;
    commitHash?: string | null;
    commitMessage?: string | null;
    project?: Project | null;
    vps?: Vps | null;
    createdAt: string;
    updatedAt: string;
};

export type DeploymentLog = {
    id: string;
    level?: string;
    message?: string;
    output?: string;
    createdAt?: string;
    timestamp?: string;
};
