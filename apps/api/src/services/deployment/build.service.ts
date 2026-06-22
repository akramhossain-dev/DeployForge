import { SSHService } from '@deployforge/vps';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LoggingService } from '../logging.service';
import { DeploymentError } from './error';
import { DetectedProject, UploadedFileDeploymentSource } from './types';
import { runCommand } from './runner';
import { shellQuote, sanitizeFileName, safeExtractCommand } from './utils';
import { ValidationService } from './validation.service';

export class BuildService {
    static async normalizeProjectRoot(ssh: SSHService, deploymentId: string, workDir: string) {
        const command = `cd ${shellQuote(workDir)} && if [ ! -f package.json ] && [ ! -f Dockerfile ] && [ ! -f index.html ]; then child_count=$(find . -mindepth 1 -maxdepth 1 -type d | wc -l); file_count=$(find . -mindepth 1 -maxdepth 1 -type f | wc -l); if [ "$child_count" = "1" ] && [ "$file_count" = "0" ]; then child=$(find . -mindepth 1 -maxdepth 1 -type d | head -n 1); mkdir .deployforge-flatten; find "$child" -mindepth 1 -maxdepth 1 -exec mv {} .deployforge-flatten/ \\; ; rmdir "$child"; find .deployforge-flatten -mindepth 1 -maxdepth 1 -exec mv {} . \\; ; rmdir .deployforge-flatten; echo "Normalized single-folder project archive"; fi; fi`;
        await runCommand(ssh, deploymentId, 'build', command, 'building', 'WORKSPACE_NORMALIZE_FAILED');
    }

    static async prepareUploadedSource(ssh: SSHService, deploymentId: string, source: UploadedFileDeploymentSource, workDir: string) {
        ValidationService.validateUploadFile(source.originalFileName);
        await ValidationService.verifyLocalUploadWorkspace(source.uploadPath);
        const archiveName = sanitizeFileName(source.originalFileName);
        const remoteArchive = `${workDir}.archive/${archiveName}`;
        await LoggingService.log(deploymentId, `Uploading ${source.originalFileName}`, 'build');
        await runCommand(ssh, deploymentId, 'build', `rm -rf ${shellQuote(workDir)} ${shellQuote(`${workDir}.archive`)} && mkdir -p ${shellQuote(`${workDir}.archive`)}`);
        await ssh.uploadFile(source.uploadPath, remoteArchive);
        await LoggingService.log(deploymentId, 'Extracting uploaded archive', 'build');
        await runCommand(ssh, deploymentId, 'build', safeExtractCommand(remoteArchive, workDir), 'upload_extract', 'UPLOAD_EXTRACT_FAILED');
        await runCommand(ssh, deploymentId, 'build', `test "$(find ${shellQuote(workDir)} -mindepth 1 -maxdepth 8 | wc -l)" -gt 0`, 'upload_extract', 'UPLOAD_EMPTY');
        await fs.writeFile(path.join(path.dirname(source.uploadPath), '.extracted'), new Date().toISOString(), { mode: 0o600 }).catch(() => undefined);
        await runCommand(ssh, deploymentId, 'build', `rm -f ${shellQuote(remoteArchive)}`, 'upload_extract', 'UPLOAD_REMOTE_CLEANUP_FAILED');
    }

    static async detectProject(ssh: SSHService, deploymentId: string, workDir: string): Promise<DetectedProject> {
        const { stdout } = await runCommand(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && find . -maxdepth 3 -type f | sed 's#^./##'`);
        const files = stdout.split('\n').map((item) => item.trim()).filter(Boolean);
        if (files.length === 0) {
            throw new DeploymentError('building', 'Deployment workspace does not contain project files', 'WORKSPACE_NOT_FOUND');
        }
        const rootFiles = files.filter((file) => !file.includes('/'));
        const rootFileSet = new Set(rootFiles);
        const hasDockerfile = rootFiles.includes('Dockerfile');
        const hasPackageJson = rootFileSet.has('package.json');
        const hasNextConfig = rootFiles.some((file) => /^next\.config\./.test(file));

        if (hasDockerfile) {
            await LoggingService.log(deploymentId, 'Detected Docker project', 'build');
            return { framework: 'DOCKER', deploymentType: 'SERVER', buildCommand: 'docker build', startCommand: 'docker run', appPort: 3000, dockerfileAlreadyPresent: true, installCommand: 'npm install' };
        }

        let lockfile: string | undefined = undefined;
        let installCommand = 'npm install';

        if (rootFileSet.has('bun.lock') || rootFileSet.has('bun.lockb')) {
            lockfile = rootFileSet.has('bun.lock') ? 'bun.lock' : 'bun.lockb';
            installCommand = 'bun install';
        } else if (rootFileSet.has('pnpm-lock.yaml')) {
            lockfile = 'pnpm-lock.yaml';
            installCommand = 'pnpm install';
        } else if (rootFileSet.has('yarn.lock')) {
            lockfile = 'yarn.lock';
            installCommand = 'yarn install';
        } else if (rootFileSet.has('package-lock.json')) {
            lockfile = 'package-lock.json';
            installCommand = 'npm ci';
        }

        if (!hasPackageJson) {
            const hasStaticEntry = rootFileSet.has('index.html') || files.some((file) => /\.html?$/i.test(file));
            if (!hasStaticEntry) {
                throw new DeploymentError('building', 'Project type could not be detected. package.json, Dockerfile, or static HTML entrypoint is required.', 'PROJECT_TYPE_MISMATCH');
            }
            await LoggingService.log(deploymentId, 'Detected static HTML project', 'build');
            return { framework: 'STATIC', deploymentType: 'STATIC', buildCommand: '', startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false, installCommand, lockfile };
        }

        const { stdout: pkgRaw } = await runCommand(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && python3 - <<'PY'\nimport json\nwith open('package.json') as f:\n    p=json.load(f)\ndeps={}\ndeps.update(p.get('dependencies') or {})\ndeps.update(p.get('devDependencies') or {})\nprint(json.dumps({'scripts': p.get('scripts') or {}, 'deps': deps, 'main': p.get('main') or ''}))\nPY`, 'building', 'PACKAGE_PARSE_FAILED');
        let pkg: { scripts: Record<string, string>; deps: Record<string, string>; main?: string };
        try {
            pkg = JSON.parse(pkgRaw.trim());
        } catch {
            throw new DeploymentError('building', 'package.json could not be parsed', 'PACKAGE_PARSE_FAILED');
        }

        const scriptValues = [...Object.keys(pkg.scripts || {}), ...Object.values(pkg.scripts || {})];
        const scriptHasNext = scriptValues.some((script) => /\bnext\b/.test(script));
        
        if (pkg.deps.next || hasNextConfig || scriptHasNext) {
            const startCommand = pkg.scripts.start ? 'npm run start' : 'npx next start -H 0.0.0.0 -p 3000';
            await LoggingService.log(deploymentId, 'Detected Next.js project; using Node runtime', 'build');
            return { framework: 'NEXTJS', deploymentType: 'FULLSTACK', buildCommand: `${installCommand} && npm run build`, startCommand, appPort: 3000, dockerfileAlreadyPresent: false, installCommand, lockfile };
        }

        if (pkg.deps.astro || scriptValues.some((script) => /\bastro\b/.test(script))) {
            const isStatic = !pkg.deps['@astrojs/node'] && !pkg.deps['@astrojs/vercel'];
            if (isStatic) {
                await LoggingService.log(deploymentId, 'Detected Astro static project; using static file runtime', 'build');
                return { framework: 'ASTRO', deploymentType: 'STATIC', buildCommand: pkg.scripts.build ? `${installCommand} && npm run build` : installCommand, startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false, installCommand, lockfile };
            } else {
                await LoggingService.log(deploymentId, 'Detected Astro SSR project; using Node runtime', 'build');
                const startCommand = pkg.scripts.start ? 'npm run start' : 'node ./dist/server/entry.mjs';
                return { framework: 'ASTRO', deploymentType: 'SERVER', buildCommand: `${installCommand} && npm run build`, startCommand, appPort: 3000, dockerfileAlreadyPresent: false, installCommand, lockfile };
            }
        }

        if (pkg.deps.vite || pkg.deps['@vitejs/plugin-react'] || pkg.deps.react) {
            const hasStaticFile = rootFileSet.has('index.html') || files.some((file) => file.endsWith('index.html'));
            if (hasStaticFile) {
                await LoggingService.log(deploymentId, 'Detected Vite/React static project; using static file runtime', 'build');
                return { framework: 'VITE_REACT', deploymentType: 'STATIC', buildCommand: `${installCommand} && npm run build`, startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false, installCommand, lockfile };
            }
        }

        const entryCandidates = ['server.js', 'index.js', 'app.js', 'dist/main.js', 'src/server.ts', 'src/index.ts'];
        if (pkg.main) entryCandidates.unshift(pkg.main);
        
        let resolvedEntry: string | null = null;
        for (const candidate of entryCandidates) {
            if (rootFileSet.has(candidate) || files.some((file) => file === candidate || file.endsWith('/' + candidate))) {
                resolvedEntry = candidate;
                break;
            }
        }

        if (resolvedEntry || pkg.deps.express || pkg.deps.fastify || pkg.scripts.start || pkg.scripts.dev) {
            const framework = pkg.deps.fastify ? 'FASTIFY' : pkg.deps.express ? 'EXPRESS' : 'NODE_API';
            await LoggingService.log(deploymentId, `Detected ${framework.toLowerCase()} project; using Node runtime`, 'build');
            
            let startCommand = 'npm run start';
            if (pkg.scripts.start) {
                startCommand = 'npm run start';
            } else if (resolvedEntry) {
                if (resolvedEntry.endsWith('.ts')) {
                    startCommand = `npx ts-node ${resolvedEntry}`;
                } else {
                    startCommand = `node ${resolvedEntry}`;
                }
            } else {
                throw new DeploymentError('building', 'Node.js server project detected but no start script or entrypoint file was found', 'NO_ENTRYPOINT_FOUND');
            }

            return {
                framework: 'NODE_API',
                deploymentType: 'SERVER',
                buildCommand: pkg.scripts.build ? `${installCommand} && npm run build` : installCommand,
                startCommand,
                appPort: 3000,
                dockerfileAlreadyPresent: false,
                installCommand,
                lockfile
            };
        }

        if (rootFileSet.has('index.html')) {
            await LoggingService.log(deploymentId, 'Detected static project; using static file runtime', 'build');
            return { framework: 'STATIC', deploymentType: 'STATIC', buildCommand: '', startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false, installCommand, lockfile };
        }

        throw new DeploymentError('building', 'Project type is ambiguous. Unable to determine if it is a STATIC site or a NODE server.', 'AMBIGUOUS_PROJECT_TYPE');
    }

    static async buildImage(ssh: SSHService, deploymentId: string, workDir: string, imageTag: string, detected: DetectedProject) {
        if (!detected.dockerfileAlreadyPresent) {
            await runCommand(ssh, deploymentId, 'build', `cat > ${shellQuote(`${workDir}/Dockerfile`)} <<'EOF'\n${generatedDockerfile(detected)}\nEOF`);
        }

        await runCommand(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && docker build --pull -t ${shellQuote(imageTag)} .`, 'building', 'DOCKER_BUILD_FAILED');
    }

    static async buildStaticArtifact(ssh: SSHService, deploymentId: string, workDir: string, staticDir: string, detected: DetectedProject, hasEnv: boolean) {
        const envPrefix = hasEnv ? 'set -a && . ./.env.deployforge && set +a && ' : '';
        const installCommand = detected.installCommand || 'npm install';
        const buildCommand = detected.buildCommand
            ? `if [ -f package.json ]; then command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || { echo "Node.js and npm are required to build this static project on the deployment worker"; exit 42; }; (if [ ! -d node_modules ]; then ${installCommand}; fi) && if node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.build?0:1)" 2>/dev/null; then ${envPrefix}npm run build; fi; fi`
            : 'true';
        const publishCommand = `rm -rf ${shellQuote(staticDir)} && mkdir -p ${shellQuote(staticDir)} && cd ${shellQuote(workDir)} && ${buildCommand} && if [ -d dist ]; then cp -a dist/. ${shellQuote(staticDir)}/; elif [ -d build ]; then cp -a build/. ${shellQuote(staticDir)}/; elif [ -d out ]; then cp -a out/. ${shellQuote(staticDir)}/; elif [ -d public ] && find public -maxdepth 2 -name index.html | grep -q .; then cp -a public/. ${shellQuote(staticDir)}/; elif [ -f index.html ]; then cp -a . ${shellQuote(staticDir)}/; else echo "No static artifact found. Expected dist/, build/, out/, public/index.html, or index.html"; exit 43; fi && test -f ${shellQuote(`${staticDir}/index.html`)}`;
        try {
            await runCommand(ssh, deploymentId, 'build', publishCommand, 'building', 'STATIC_BUILD_FAILED');
        } catch (err: any) {
            if (String(err.message || '').includes('exit code 42')) {
                throw new DeploymentError('building', 'Static build worker is missing Node.js or npm', 'STATIC_BUILD_RUNTIME_MISSING');
            }
            if (String(err.message || '').includes('exit code 43')) {
                throw new DeploymentError('building', 'Static build completed but no deployable artifact was found', 'STATIC_ARTIFACT_NOT_FOUND');
            }
            throw err;
        }
        await LoggingService.log(deploymentId, `Static artifact published to ${staticDir}`, 'build');
    }
}

function generatedDockerfile(detected: DetectedProject) {
    if (detected.framework === 'STATIC') {
        return `FROM nginx:1.27-alpine\nWORKDIR /usr/share/nginx/html\nCOPY . .\nEXPOSE 80`;
    }

    const installCommand = detected.installCommand || 'npm install';
    if (detected.deploymentType === 'STATIC') {
        return `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY . .\nRUN if [ ! -d node_modules ]; then ${installCommand}; fi\nRUN if [ -f .env.deployforge ]; then set -a && . ./.env.deployforge && set +a; fi && ${detected.buildCommand && detected.buildCommand.includes('npm run build') ? 'npm run build' : 'true'}\nRUN mkdir -p /deployforge-static && \\\n    if [ -d dist ]; then cp -a dist/. /deployforge-static/; \\\n    elif [ -d build ]; then cp -a build/. /deployforge-static/; \\\n    elif [ -d out ]; then cp -a out/. /deployforge-static/; \\\n    elif [ -f index.html ]; then cp -a . /deployforge-static/; \\\n    else echo '<!doctype html><title>DeployForge Sandbox</title><h1>No static output detected</h1>' > /deployforge-static/index.html; fi\nFROM nginx:1.27-alpine\nCOPY --from=build /deployforge-static /usr/share/nginx/html\nEXPOSE 80`;
    }

    const command = detected.framework === 'NEXTJS' ? nextRuntimeCommand(detected.startCommand) : detected.startCommand;
    return `FROM node:20-alpine\nWORKDIR /app\nENV HOSTNAME=0.0.0.0\nENV PORT=3000\nCOPY . .\nRUN if [ ! -d node_modules ]; then ${installCommand}; fi\nRUN npm install -g serve\nRUN if [ -f .env.deployforge ]; then set -a && . ./.env.deployforge && set +a; fi && ${detected.buildCommand && detected.buildCommand.includes('npm run build') ? 'npm run build' : 'true'}\nENV NODE_ENV=production\nEXPOSE 3000\nCMD ["sh", "-lc", "${command.replace(/"/g, '\\"')}"]`;
}

function nextRuntimeCommand(startCommand: string) {
    return [
        'for d in out dist build; do if [ -d "$d" ] && find "$d" -maxdepth 2 -name index.html | grep -q .; then exec serve "$d" -l 3000; fi; done',
        startCommand,
    ].join('; ');
}
