import { describe, expect, it } from 'vitest';
import { ComposePolicyError, ComposePolicyService } from '../compose-policy.service';
import { RESOURCE_DEFAULTS } from '../../resource-policy';

function rejection(yaml: string) {
    try {
        ComposePolicyService.sanitize(yaml);
        throw new Error('Expected Compose policy rejection');
    } catch (error) {
        expect(error).toBeInstanceOf(ComposePolicyError);
        return error as ComposePolicyError;
    }
}

describe('ComposePolicyService', () => {
    it('replaces user resource and logging settings with managed limits', () => {
        const result = ComposePolicyService.sanitize(`services:\n  web:\n    image: nginx\n    expose: [80]\n    cpus: 9\n    mem_limit: 20g\n    pids_limit: 9999\n    logging:\n      driver: none\n  redis:\n    image: redis\n`, { composeService: 'web', composePort: 80 }, 'df-test', RESOURCE_DEFAULTS.FULLSTACK);
        expect(result.candidateYaml).toContain('max-size: 10m');
        expect(result.candidateYaml).toContain('com.deployforge.managed');
        expect(result.yaml).not.toContain('20g');
        expect(result.yaml).not.toContain('9999');
    });

    it('does not apply fixed resource limits when no policy is selected', () => {
        const result = ComposePolicyService.sanitize(`services:\n  web:\n    image: nginx\n    expose: [80]\n`, { composeService: 'web', composePort: 80 });
        expect(result.yaml).not.toContain('cpus:');
        expect(result.yaml).not.toContain('mem_limit:');
        expect(result.yaml).not.toContain('pids_limit:');
        expect(result.yaml).not.toContain('max-size:');
    });
    it.each([
        ['privileged mode', 'services:\n  web:\n    image: nginx\n    privileged: true\n'],
        ['host networking', 'services:\n  web:\n    image: nginx\n    network_mode: host\n'],
        ['bind mount', 'services:\n  web:\n    image: nginx\n    volumes: ["/etc:/host"]\n'],
        ['docker socket', 'services:\n  web:\n    image: nginx\n    volumes: ["sock:/var/run/docker.sock"]\nvolumes:\n  sock: {}\n'],
        ['host device', 'services:\n  web:\n    image: nginx\n    devices: ["/dev/kvm:/dev/kvm"]\n'],
        ['capability addition', 'services:\n  web:\n    image: nginx\n    cap_add: [SYS_ADMIN]\n'],
        ['namespace sharing', 'services:\n  web:\n    image: nginx\n    pid: host\n'],
        ['external network', 'services:\n  web:\n    image: nginx\nnetworks:\n  edge:\n    external: true\n'],
        ['compose include', 'include: [other.yml]\nservices:\n  web:\n    image: nginx\n'],
    ])('rejects %s', (_label, yaml) => {
        rejection(yaml);
    });

    it('returns candidates when ingress is ambiguous', () => {
        const error = rejection(`
services:
  portal:
    image: example/portal
    expose: [3000]
  api:
    image: example/api
    expose: [8080]
  db:
    image: postgres:16
`);
        expect(error.errorCode).toBe('COMPOSE_INGRESS_AMBIGUOUS');
        expect(error.statusCode).toBe(422);
        expect(error.candidates).toEqual([
            { service: 'portal', ports: [3000] },
            { service: 'api', ports: [8080] },
        ]);
    });

    it('sanitizes a safe multi-service compose file', () => {
        const result = ComposePolicyService.sanitize(`
services:
  web:
    build: .
    expose: [3000]
    labels:
      - traefik.enable=true
    volumes:
      - uploads:/app/uploads
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    healthcheck:
      test: [CMD-SHELL, pg_isready]
volumes:
  uploads: {}
`, { composeService: 'web', composePort: 3000 });

        expect(result.service).toBe('web');
        expect(result.port).toBe(3000);
        expect(result.yaml).not.toContain('traefik.enable');
        expect(result.yaml).toContain('no-new-privileges:true');
        expect(result.yaml).not.toContain('internal: true');
        expect(result.yaml).toContain('uploads:/app/uploads');
        expect(result.candidateYaml).toContain('web:');
        expect(result.candidateYaml).not.toContain('db:');
        expect(result.candidateYaml).not.toContain('depends_on');
        expect(result.candidateYaml).toContain('deployforge-managed-dependencies_default');
        expect(result.dependencyYaml).toContain('db:');
        expect(result.dependencyYaml).not.toContain('web:');
        expect(result.dependencyFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(result.hasDependencies).toBe(true);
    });

    it('normalizes standard published ports and safe host gateway entries', () => {
        const result = ComposePolicyService.sanitize(`
services:
  api:
    image: example/api
    ports: ["\${API_HOST_PORT:-4000}:4000"]
    extra_hosts:
      - host.docker.internal:host-gateway
  web:
    image: example/web
    ports: ["\${WEB_HOST_PORT:-3000}:3000"]
    extra_hosts:
      - host.docker.internal:host-gateway
      - example.test:host-gateway
`);

        expect(result.service).toBe('web');
        expect(result.port).toBe(3000);
        expect(result.yaml).not.toContain('ports:');
        expect(result.yaml).not.toContain('example.test');
        expect(result.yaml).toContain('host.docker.internal:host-gateway');
        expect(result.candidateYaml).toContain('expose:');
    });

    it('changes the stable dependency fingerprint when dependency definitions change', () => {
        const base = `services:\n  web:\n    image: example/web\n    expose: [3000]\n  db:\n    image: postgres:16\n`;
        const changed = base.replace('postgres:16', 'postgres:17');
        const first = ComposePolicyService.sanitize(base, { composeService: 'web', composePort: 3000 }, 'df-project');
        const second = ComposePolicyService.sanitize(changed, { composeService: 'web', composePort: 3000 }, 'df-project');
        expect(first.dependencyFingerprint).not.toBe(second.dependencyFingerprint);
    });

});
