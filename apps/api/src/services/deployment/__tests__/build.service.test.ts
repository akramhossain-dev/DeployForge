import { describe, expect, it } from 'vitest';
import { buildKitImageCommand, generatedDockerfile } from '../build.service';
import { DetectedProject } from '../types';

describe('BuildKit image command', () => {
    it('persists a local layer cache and loads the image into Docker', () => {
        const command = buildKitImageCommand('/srv/work', 'deployforge/app:next', 'deployment-1', '/srv/cache');
        expect(command).toContain('docker buildx build --load');
        expect(command).toContain("[ -f '/srv/cache/buildkit/index.json' ]");
        expect(command).toContain("--cache-from type=local,src='/srv/cache/buildkit'");
        expect(command).toContain("--cache-to type=local,dest='/srv/cache/buildkit-next',mode=max");
        expect(command).toContain('DOCKER_BUILDKIT=1 docker build');
    });
});

describe('generated Dockerfile', () => {
    const nextProject: DetectedProject = {
        framework: 'NEXTJS',
        deploymentType: 'FULLSTACK',
        buildCommand: 'npm ci && npm run build',
        startCommand: 'npm run start',
        appPort: 3000,
        dockerfileAlreadyPresent: false,
        installCommand: 'npm ci',
        lockfile: 'package-lock.json',
    };

    it('installs dependencies from manifests before copying the source tree', () => {
        const dockerfile = generatedDockerfile(nextProject);
        const manifestCopy = dockerfile.indexOf('COPY package.json package-lock.json ./');
        const install = dockerfile.indexOf('RUN npm ci');
        const sourceCopy = dockerfile.indexOf('COPY . .');

        expect(manifestCopy).toBeGreaterThan(-1);
        expect(install).toBeGreaterThan(manifestCopy);
        expect(sourceCopy).toBeGreaterThan(install);
        expect(dockerfile).not.toContain('if [ ! -d node_modules ]');
    });

    it('copies source before a repository-wide install script', () => {
        const dockerfile = generatedDockerfile({
            ...nextProject,
            installCommand: 'npm run install:all',
        });

        expect(dockerfile.indexOf('COPY . .')).toBeLessThan(dockerfile.indexOf('RUN npm run install:all'));
        expect(dockerfile).not.toContain('COPY package.json package-lock.json ./');
    });
});
