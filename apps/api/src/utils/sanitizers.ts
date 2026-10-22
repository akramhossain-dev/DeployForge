import { DeploymentService } from '../services/deployment.service';

export function sanitizeVps(vps: any) {
    if (!vps) return null;
    const sanitized = { ...vps };
    delete sanitized.sshKey;
    delete sanitized.privateKey;
    delete sanitized.password;
    delete sanitized.sudoPassword;
    delete sanitized.encryptedCredentials;
    delete sanitized.encryptedPassword;
    delete sanitized.encryptedPrivateKey;
    return sanitized;
}

export function sanitizeDomain(domain: any) {
    if (!domain) return null;
    const sanitized = { ...domain };
    delete sanitized.sslKey;
    delete sanitized.sslCert;
    delete sanitized.privateKey;
    return sanitized;
}

export function sanitizeGitHubAccount(account: any) {
    if (!account) return null;
    const sanitized = { ...account };
    delete sanitized.accessToken;
    delete sanitized.githubAccessToken;
    return sanitized;
}

export function sanitizeDeployment(deployment: any) {
    if (!deployment) return null;
    const sanitized = { ...deployment };
    
    delete sanitized.githubAccessToken;
    delete sanitized.githubToken;
    delete sanitized.sshKey;
    delete sanitized.privateKey;
    delete sanitized.password;
    delete sanitized.secret;
    delete sanitized.secrets;
    delete sanitized.envSecrets;
    delete sanitized.encryptedCredentials;
    delete sanitized.privateMetadata;
    delete sanitized.env; 

    if (sanitized.vps) {
        sanitized.vps = sanitizeVps(sanitized.vps);
    }
    
    if (sanitized.domains && Array.isArray(sanitized.domains)) {
        sanitized.domains = sanitized.domains.map(sanitizeDomain);
    }

    if (sanitized.project) {
        const proj = { ...sanitized.project };
        delete proj.githubAccessToken;
        delete proj.accessToken;
        if (proj.activeRelease) proj.activeRelease = sanitizeRelease(proj.activeRelease);
        if (proj.candidateRelease) proj.candidateRelease = sanitizeRelease(proj.candidateRelease);
        if (Array.isArray(proj.releases)) proj.releases = proj.releases.map(sanitizeRelease);
        sanitized.project = proj;
    }

    if (deployment.env) {
        sanitized.envPreview = DeploymentService.envPreview(deployment.env);
    }
    
    return sanitized;
}

export function formatDeploymentResponse(deployment: any) {
    const sanitized = sanitizeDeployment(deployment);
    if (!sanitized) return null;

    const activeDomain = sanitized.domains?.find((domain: any) => domain.status === 'ACTIVE') || sanitized.domains?.[0];
    const hostType = sanitized.hostType || (activeDomain ? 'domain' : 'ip');
    const sourceType = sanitized.sourceType || (sanitized.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
    const domainName = sanitized.domain || activeDomain?.domainName || null;
    const effectiveDomain = domainName || (sanitized.vps?.ipAddress
        ? `${(sanitized.project?.name || sanitized.name || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app'}-${sanitized.project?.id?.slice(0, 8) || sanitized.id?.slice(0, 8) || 'preview'}.${sanitized.vps.ipAddress}.sslip.io`
        : null);

    let url: string | null = null;
    if (sanitized.mode === 'sandbox' && sanitized.vps?.ipAddress && sanitized.port) {
        url = `http://${sanitized.vps.ipAddress}:${sanitized.port}`;
    } else if (effectiveDomain) {
        url = `https://${effectiveDomain}`;
    }

    const latestJob = Array.isArray(sanitized.jobs) ? sanitized.jobs[0] : null;
    const operationError = parsePublicJobError(latestJob?.lastError);
    delete sanitized.jobs;

    return {
        ...sanitized,
        activeRelease: sanitized.project?.activeRelease || null,
        candidateRelease: sanitized.project?.candidateRelease || null,
        readiness: sanitized.project?.candidateRelease?.readinessStatus
            || sanitized.project?.activeRelease?.readinessStatus
            || 'UNKNOWN',
        rollbackAvailable: Boolean(sanitized.project?.activeRelease && sanitized.project?.releases?.length),
        operationError,
        hostType,
        sourceType,
        repoUrl: sanitized.repoUrl || (sourceType === 'github' ? sanitized.project?.repositoryUrl : null),
        branch: sanitized.branch || (sourceType === 'github' ? sanitized.project?.branch : null),
        uploadPath: sanitized.uploadPath || (sourceType === 'upload' ? sanitized.project?.repositoryUrl : null),
        url,
        domain: domainName,
        effectiveDomain,
    };
}

function parsePublicJobError(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            message: String(parsed.message || 'Deployment operation failed').slice(0, 500),
            errorCode: String(parsed.errorCode || 'DEPLOYMENT_OPERATION_FAILED').slice(0, 100),
            stage: String(parsed.stage || 'worker').slice(0, 100),
            ...(parsed.details && typeof parsed.details === 'object' ? { details: parsed.details } : {}),
        };
    } catch {
        return { message: value.slice(0, 500), errorCode: 'DEPLOYMENT_OPERATION_FAILED', stage: 'worker' };
    }
}

function sanitizeRelease(release: any) {
    const sanitized = { ...release };
    delete sanitized.env;
    delete sanitized.readinessError;
    return sanitized;
}
