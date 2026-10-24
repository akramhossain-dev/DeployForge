import { describe, expect, it } from 'vitest';
import { buildKitImageCommand } from '../build.service';

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
