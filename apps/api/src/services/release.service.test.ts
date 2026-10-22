import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test'; });
import { ReleaseService } from './release.service';
import { parseDocument } from 'yaml';

describe('ReleaseService', () => {
    it('renders a stable high-priority route without a canary', () => {
        const yaml = ReleaseService.renderRoute('project-1', 'app.example.com', 'df-rel-abc', 3000);
        expect(yaml).toContain('priority: 10000');
        expect(yaml).toContain('Host(`app.example.com`)');
        expect(yaml).toContain('http://df-rel-abc:3000');
        expect(yaml).not.toContain('X-DeployForge-Probe');
        expect(parseDocument(yaml).errors).toHaveLength(0);
    });

    it('adds an isolated canary router when a probe token is supplied', () => {
        const yaml = ReleaseService.renderRoute('project-1', 'app.example.com', 'df-rel-abc', 3000, 'probe-token', { alias: 'df-rel-old', port: 8080 });
        expect(yaml).toContain('priority: 11000');
        expect(yaml).toContain('Header(`X-DeployForge-Probe`, `probe-token`)');
        expect(yaml).toContain('service: df-project-1-stable');
        expect(yaml).toContain('http://df-rel-old:8080');
        expect(yaml).toContain('http://df-rel-abc:3000');
        expect(parseDocument(yaml).errors).toHaveLength(0);
    });

    it('creates DNS-safe bounded release aliases', () => {
        expect(ReleaseService.alias('123e4567-e89b-12d3-a456-426614174000')).toMatch(/^df-rel-[a-z0-9]{20}$/);
    });
});
