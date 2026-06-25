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
    const url = hostType === 'domain' && domainName
        ? `http://${domainName}`
        : sanitized.vps?.ipAddress && sanitized.type === 'STATIC'
          ? sanitized.port
            ? `http://${sanitized.vps.ipAddress}:${sanitized.port}/site/${sanitized.id}/`
            : `http://${sanitized.vps.ipAddress}/site/${sanitized.id}/`
        : sanitized.vps?.ipAddress && sanitized.port
          ? `http://${sanitized.vps.ipAddress}:${sanitized.port}`
          : null;

    return {
        ...sanitized,
        hostType,
        sourceType,
        repoUrl: sanitized.repoUrl || (sourceType === 'github' ? sanitized.project?.repositoryUrl : null),
        branch: sanitized.branch || (sourceType === 'github' ? sanitized.project?.branch : null),
        uploadPath: sanitized.uploadPath || (sourceType === 'upload' ? sanitized.project?.repositoryUrl : null),
        url,
        domain: domainName,
    };
}
