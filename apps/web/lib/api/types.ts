export type User = {
    id: string;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    githubId?: string | null;
    githubUsername?: string | null;
    githubAvatar?: string | null;
    googleId?: string | null;
    googleEmail?: string | null;
    googleAvatar?: string | null;
    provider?: 'email' | 'github' | 'google' | string;
    authProvider?: 'local' | 'github' | 'google' | string;
    connectedProviders?: {
        google: boolean;
        github: boolean;
        local: boolean;
    };
    isVerified?: boolean;
    role?: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER' | string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | string;
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

export type DeploymentState = 'idle' | 'pending' | 'cloning' | 'uploading' | 'building' | 'deploying' | 'running' | 'paused' | 'failed' | 'rolled_back' | 'stopped' | 'deleting' | 'deleted' | string;

export type VpsHealth = {
    id?: string;
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime?: number;
    dockerInstalled?: boolean;
    nginxInstalled?: boolean;
    runningContainers?: string[];
    checkedAt?: string;
};

export type Vps = {
    id: string;
    name: string;
    ipAddress: string;
    port: number;
    username: string;
    authType: 'password' | 'key' | string;
    status: 'active' | 'inactive' | 'failed' | 'ACTIVE' | 'INACTIVE' | 'ERROR' | string;
    lastCheckedAt?: string | null;
    healthRecords?: VpsHealth[];
    createdAt: string;
    updatedAt: string;
};

export type Domain = {
    id: string;
    deploymentId: string;
    vpsId: string;
    domainName: string;
    status: string;
    sslStatus?: string;
    nginxConfigPath?: string | null;
    /** Whether the HTTP → HTTPS Auto-HTTPS redirect is currently active on the VPS nginx config. */
    autoHttps?: boolean;
    createdAt: string;
    updatedAt: string;
};


export type VpsConnectionPayload = {
    name?: string;
    ipAddress: string;
    port: number;
    username: string;
    authType: 'password' | 'key';
    password?: string;
    privateKey?: string;
};

export type VpsConnectionResult = {
    success: boolean;
    message: string;
    errorCode?: string;
    readiness?: {
        shell: boolean;
        os?: string;
        dockerInstalled?: boolean;
        nginxInstalled?: boolean;
    };
};

export type VpsServerInfo = {
    hostname: string;
    publicIp: string;
    privateIp: string;
    os: string;
    kernel: string;
    architecture: string;
    cpuModel: string;
    cpuCores: number;
    ramTotal: number;   // kB
    ramUsed: number;    // kB
    ramFree: number;    // kB
    swapTotal: number;  // kB
    swapUsed: number;   // kB
    diskTotal: string;
    diskUsed: string;
    diskFree: string;
    diskPercent: string;
    uptimeSeconds: number;
    uptimeFormatted: string;
    bootTime: string;
    timezone: string;
};

export type VpsLiveMetrics = {
    cpuPercent: number;
    ramPercent: number;
    ramUsedMb: number;
    ramTotalMb: number;
    diskPercent: number;
    diskReadKb: number;
    diskWriteKb: number;
    netRxMb: number;
    netTxMb: number;
    loadAvg1: number;
    loadAvg5: number;
    loadAvg15: number;
    temperature: number | null;
    collectedAt: string;
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
    status: 'PENDING' | 'CLONING' | 'UPLOADING' | 'EXTRACTING' | 'BUILDING' | 'DEPLOYING' | 'RUNNING' | 'PAUSED' | 'FAILED' | 'ROLLED_BACK' | 'STOPPED' | 'DELETING' | 'DELETED' | string;
    framework?: string | null;
    type?: 'STATIC' | 'SERVER' | 'FULLSTACK' | string;
    port?: number | null;
    sourceType?: 'github' | 'upload' | string;
    mode?: 'production' | 'sandbox' | string;
    repoUrl?: string | null;
    branch?: string | null;
    uploadPath?: string | null;
    commitHash?: string | null;
    commitMessage?: string | null;
    lastStableVersion?: string | null;
    project?: Project | null;
    vps?: Vps | null;
    containerId?: string | null;
    buildCommand?: string | null;
    startCommand?: string | null;
    deploymentLogs?: DeploymentLog[];
    domains?: Domain[];
    history?: Array<{ id: string; version: string; imageTag?: string | null; status: string; createdAt: string }>;
    envPreview?: Array<{ key: string; value: string }>;
    hostType?: 'domain' | 'ip';
    domain?: string | null;
    url?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type DeploymentLog = {
    id: string;
    level?: string;
    type?: string;
    message?: string;
    output?: string;
    createdAt?: string;
    timestamp?: string;
};

export type AdminOverview = {
    totals: {
        totalUsers: number;
        totalAdmins: number;
        totalModerators: number;
        activeUsers: number;
        suspendedUsers: number;
        disabledUsers: number;
        totalDeployments: number;
        activeDeployments: number;
        totalVps: number;
        connectedGitHubAccounts: number;
        totalRepositories: number;
    };
    recentRegistrations?: {
        id: string;
        email: string | null;
        name: string | null;
        status: string;
        createdAt: string;
    }[];
    resources: {
        cpuUsage: number;
        memoryUsage: number;
        diskUsage: number;
    };
    queue: {
        recentJobs: number;
        failedJobs: number;
        successRate: number;
    };
    recentActivities: AdminActivity[];
};

export type PublicStats = {
    totalUsers: number;
    totalDeployments: number;
    activeVps: number;
};

export type AdminActivity = {
    id: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    createdAt: string;
    admin?: User | null;
};

export type AdminUser = User & {
    provider?: string;
    createdAt: string;
    updatedAt: string;
    githubAccount?: GitHubProfile & { repositories?: Repository[] };
    deployments?: Deployment[];
    vps?: Vps[];
    _count?: {
        deployments: number;
        vps: number;
        projects: number;
    };
};

export type AdminDeployment = Deployment & {
    user?: User | null;
    deploymentLogs?: DeploymentLog[];
    history?: Array<{ id: string; version: string; status: string; createdAt: string }>;
};

export type AdminVps = Vps & {
    user?: User | null;
    systemMetrics?: Array<{ activeContainers: number; cpuUsage: number; memoryUsage: number; diskUsage: number; timestamp: string }>;
    _count?: { deployments: number };
};

export type AdminGitHubAccount = GitHubProfile & {
    user?: User | null;
    repositories: Repository[];
};

export type AdminMonitoring = {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    activeContainers: number;
    queueStatus: { queued: number; running: number; failed: number };
    deploymentSuccessRate: number;
    jobSuccessRate: number;
    systemUptime: number;
    errorRate: number;
};

export type AdminLog = {
    id: string;
    service: string;
    severity: string;
    message: string;
    user?: User | null;
    createdAt: string;
};

export type FileEntry = {
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink';
    size: number;
    modified: string;
    permissions: string;
    extension: string;
    mimeType: string;
};

export type DirectoryListing = {
    path: string;
    entries: FileEntry[];
};

export type FileReadResult = {
    content: string;
    encoding: 'utf-8' | 'base64';
    mimeType: string;
};

export type FileDownloadResult = {
    content: string;
    size: number;
    mimeType: string;
    filename: string;
};

export type ZipDownloadResult = {
    content: string;
    filename: string;
};

export type FileSearchResult = {
    path: string;
    name: string;
    type: 'file' | 'directory';
    size: number;
    modified: string;
};

export type FileProperties = Record<string, string>;

export type AlertLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type AlertType =
    | 'CPU_HIGH'
    | 'RAM_HIGH'
    | 'DISK_HIGH'
    | 'SWAP_HIGH'
    | 'SERVER_OFFLINE'
    | 'SERVER_RECONNECTED'
    | 'HIGH_LOAD'
    | 'DEPLOYMENT_FAILED'
    | 'DEPLOYMENT_COMPLETED'
    | 'SSL_EXPIRING'
    | 'BACKUP_FAILED'
    | 'BACKUP_COMPLETED';

export type AppNotification = {
    id: string;
    userId: string;
    type: AlertType;
    level: AlertLevel;
    title: string;
    message: string;
    serverName?: string | null;
    resourceValue?: number | null;
    vpsId?: string | null;
    vps?: { id: string; name: string; ipAddress: string } | null;
    isRead: boolean;
    createdAt: string;
};

export type NotificationListResponse = {
    notifications: AppNotification[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

export type AlertSettings = {
    id: string;
    userId: string;
    cpuThreshold: number;
    ramThreshold: number;
    diskThreshold: number;
    swapThreshold: number;
    emailAlerts: boolean;
    browserAlerts: boolean;
    realtimeAlerts: boolean;
    createdAt: string;
    updatedAt: string;
};

export type ProjectAnalytics = {
    projectId: string;
    projectName: string;
    repositoryUrl: string;
    branch: string;
    totalDeployments: number;
    failedDeployments: number;
    successRate: number;
    avgBuildTime: number;
    avgDeployTime: number;
    rollbackCount: number;
    lastDeployment: {
        id: string;
        name: string;
        status: string;
        commitHash: string | null;
        branch: string | null;
        createdAt: string;
    } | null;
};
