export type DeploymentStatus = 'PENDING' | 'CLONING' | 'UPLOADING' | 'EXTRACTING' | 'BUILDING' | 'DEPLOYING' | 'RUNNING' | 'FAILED' | 'PAUSED' | 'DELETING' | 'ROLLED_BACK' | 'STOPPED' | 'DELETED';
export type ProjectKind = 'DOCKER' | 'NEXTJS' | 'ASTRO' | 'VITE_REACT' | 'NODE_API' | 'NODEJS' | 'STATIC';
export type SourceType = 'github' | 'upload';
export type DeploymentMode = 'production' | 'sandbox';
export type DeploymentRuntimeType = 'STATIC' | 'SERVER' | 'FULLSTACK';

export type StaticHostingResult = {
    url: string;
    port: number | null;
    hostType: 'domain' | 'ip';
    domainActivated: boolean;
};

export type GitHubDeploymentSource = {
    type: 'github_repo';
    projectId: string;
    vpsId: string;
    branch: string;
    commitHash?: string;
    commitMessage?: string;
    accessToken?: string;
    skipWebhookRegistration?: boolean;
    domainName?: string;
    env?: Record<string, string>;
    mode?: DeploymentMode;
};

export type UploadedFileDeploymentSource = {
    type: 'uploaded_file';
    projectId: string;
    vpsId: string;
    uploadPath: string;
    originalFileName: string;
    domainName?: string;
    env?: Record<string, string>;
    mode?: DeploymentMode;
};

export type DeploymentSource = GitHubDeploymentSource | UploadedFileDeploymentSource;

export type DetectedProject = {
    framework: ProjectKind;
    deploymentType: DeploymentRuntimeType;
    buildCommand: string;
    startCommand: string;
    appPort: number;
    dockerfileAlreadyPresent: boolean;
    installCommand?: string;
    lockfile?: string;
};
