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
    
    // Remove sensitive fields
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
    delete sanitized.env; // Ensure raw env containing secrets is not leaked

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

    // Include friendly preview properties
    if (deployment.env) {
        sanitized.envPreview = DeploymentService.envPreview(deployment.env);
    }
    
    return sanitized;
}
