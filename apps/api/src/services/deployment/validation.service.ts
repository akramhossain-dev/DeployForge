import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LoggingService } from '../logging.service';
import { DeploymentError } from './error';
import { StaticHostingResult } from './types';
import { runCommand } from './runner';
import { shellQuote, sanitizeFileName, sanitizeDomain } from './utils';

export class ValidationService {
    static normalizeCustomDomain(domainName?: string | null) {
        const clean = String(domainName || '').trim().toLowerCase();
        if (!clean) return null;
        if (/^https?:\/\//i.test(clean) || clean.includes('/') || clean.includes(' ') || clean.includes('_')) {
            throw new DeploymentError('domain_validation', 'Domain must not include protocol, paths, spaces, or invalid characters', 'INVALID_DOMAIN_FORMAT');
        }
        if (clean.length > 253 || clean.includes('..') || !clean.includes('.')) {
            throw new DeploymentError('domain_validation', 'Enter a valid root domain or subdomain, for example example.com or app.example.com', 'INVALID_DOMAIN_FORMAT');
        }
        const labels = clean.split('.');
        if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
            throw new DeploymentError('domain_validation', 'Domain format is invalid', 'INVALID_DOMAIN_FORMAT');
        }
        const tld = labels[labels.length - 1];
        if (!/^[a-z]{2,63}$/.test(tld)) {
            throw new DeploymentError('domain_validation', 'Domain top-level extension is invalid', 'INVALID_DOMAIN_FORMAT');
        }
        return clean;
    }

    static async validateDomainSelection(userId: string, domainName?: string) {
        const clean = this.normalizeCustomDomain(domainName);
        if (!clean) return undefined;
        const existing = await prisma.domain.findFirst({
            where: {
                domainName: clean,
                deployment: { status: { not: 'DELETED' } },
            },
        });
        if (existing) throw new DeploymentError('domain_validation', 'Domain is already assigned to another deployment', 'DOMAIN_ALREADY_EXISTS');
        return clean;
    }

    static validateUploadFile(fileName: string) {
        const clean = sanitizeFileName(fileName);
        if (clean !== fileName) throw new DeploymentError('uploading', 'Upload file name contains unsafe characters', 'UNSAFE_UPLOAD_NAME');
        if (!/\.zip$/i.test(clean) && !/\.tar\.gz$/i.test(clean) && !/\.tgz$/i.test(clean)) {
            throw new DeploymentError('uploading', 'Only .zip, .tar.gz, and .tgz uploads are supported', 'UNSUPPORTED_UPLOAD_TYPE');
        }
    }

    static async verifyLocalUploadWorkspace(archivePath: string) {
        const workspace = path.dirname(archivePath);
        await fs.access(path.join(workspace, '.upload.lock')).catch(() => {
            throw new DeploymentError('upload_extract', 'Deployment upload lock is missing', 'WORKSPACE_NOT_FOUND');
        });
        await fs.access(path.join(workspace, 'workspace')).catch(() => {
            throw new DeploymentError('upload_extract', 'Deployment workspace directory is missing', 'WORKSPACE_NOT_FOUND');
        });
        await fs.access(archivePath).catch(() => {
            throw new DeploymentError('upload_extract', 'Uploaded archive is missing from deployment workspace', 'UPLOAD_FILE_MISSING');
        });
    }

    static async healthCheck(ssh: SSHService, deploymentId: string, port: number) {
        await runCommand(ssh, deploymentId, 'system', `for i in $(seq 1 15); do if wget -qO- --timeout=2 --tries=1 http://127.0.0.1:${port}/health >/dev/null 2>&1 || wget -qO- --timeout=2 --tries=1 http://127.0.0.1:${port}/ >/dev/null 2>&1; then exit 0; fi; sleep 2; done; exit 1`, 'deploying', 'HEALTH_CHECK_FAILED');
    }

    static async healthCheckStatic(ssh: SSHService, deploymentId: string, hosting: StaticHostingResult) {
        const url = hosting.port
            ? `http://127.0.0.1:${hosting.port}/site/${deploymentId}/index.html`
            : hosting.hostType === 'domain'
              ? 'http://127.0.0.1/index.html'
              : `http://127.0.0.1/site/${deploymentId}/index.html`;
        const hostHeader = new URL(hosting.url).host;
        await runCommand(ssh, deploymentId, 'system', `for i in $(seq 1 10); do if wget -qO- --timeout=2 --tries=1 --header=${shellQuote(`Host: ${hostHeader}`)} ${shellQuote(url)} >/dev/null 2>&1; then exit 0; fi; sleep 1; done; exit 1`, 'static_hosting', 'STATIC_HEALTH_CHECK_FAILED');
    }

    static async validateStaticAssets(ssh: SSHService, deploymentId: string, staticHosting: StaticHostingResult, vps: any, domainName?: string) {
        let localBaseUrl = staticHosting.url;
        if (domainName && localBaseUrl.includes(domainName)) {
            localBaseUrl = localBaseUrl.replace(domainName, '127.0.0.1');
        } else if (localBaseUrl.includes(vps.ipAddress)) {
            localBaseUrl = localBaseUrl.replace(vps.ipAddress, '127.0.0.1');
        }
        await LoggingService.log(deploymentId, `Validating static assets against local endpoint: ${localBaseUrl}`, 'build');
        
        const validateScript = `
import urllib.request
import re
import sys
import urllib.parse

target_input = ${shellQuote(localBaseUrl)}

def normalize_url(target):
    target = target.strip()
    match = re.search(r'https?://.*', target, re.IGNORECASE)
    if match:
        target = match.group(0)
    else:
        target = "http://" + target
    return target

def validate_url(url):
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        if not parsed.netloc:
            return False
        return True
    except Exception:
        return False

# Normalize URL
base_url = normalize_url(target_input)

# Log validation URL
print(f"VALIDATION_URL={base_url}")

# Validate URL format before request
if not validate_url(base_url):
    print("INVALID_VALIDATION_URL")
    sys.exit(3)

index_url = urllib.parse.urljoin(base_url, 'index.html')

try:
    req = urllib.request.Request(index_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=5) as response:
        html = response.read().decode('utf-8', errors='ignore')
except Exception as e:
    print(f"FAILED_INDEX: {e}")
    sys.exit(1)

links = re.findall(r'<link[^>]+href=["\\'](.*?)["\\']', html, re.IGNORECASE)
scripts = re.findall(r'<script[^>]+src=["\\'](.*?)["\\']', html, re.IGNORECASE)
imgs = re.findall(r'<img[^>]+src=["\\'](.*?)["\\']', html, re.IGNORECASE)

stylesheets = []
for l in links:
    if '.css' in l.lower() or 'stylesheet' in html.lower():
        stylesheets.append(l)

assets = list(set(stylesheets + scripts + imgs))
failed_assets = []

for asset in assets:
    if not asset or asset.startswith('http://') or asset.startswith('https://') or asset.startswith('data:') or asset.startswith('//'):
        continue
    
    asset_url = urllib.parse.urljoin(base_url, asset)
    try:
        req = urllib.request.Request(asset_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status != 200:
                failed_assets.append((asset, response.status))
    except Exception as e:
        failed_assets.append((asset, str(e)))

if failed_assets:
    print("FAILED_ASSETS:")
    for asset, err in failed_assets:
        print(f"  - {asset}: {err}")
    sys.exit(2)

print("ALL_ASSETS_OK")
sys.exit(0)
`;
        const result = await ssh.execute(`python3 - <<'PY'\n${validateScript}\nPY`);
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        
        if (result.code === 0) {
            await LoggingService.log(deploymentId, 'Static asset validation succeeded. All assets loaded successfully (200 OK).', 'build');
        } else if (result.code === 2) {
            await LoggingService.log(deploymentId, `Static asset validation failed (broken assets found):\n${output}`, 'error', 'error');
            throw new DeploymentError('static_hosting', `Asset validation failed: ${output}`, 'STATIC_ASSET_VALIDATION_FAILED');
        } else {
            await LoggingService.log(deploymentId, `Static asset validation skipped or could not complete (non-critical error):\n${output}`, 'system', 'warn');
        }
    }
}
