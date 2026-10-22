import { describe, expect, it } from 'vitest';
import { retentionCandidates } from './maintenance-policy';

describe('release retention selection', () => {
    it('protects active, candidate and pinned releases', () => {
        const now = new Date('2026-10-12T00:00:00Z');
        const old = new Date('2026-08-01T00:00:00Z');
        const releases = [
            { id: 'active', projectId: 'p', status: 'ACTIVE', createdAt: old },
            { id: 'candidate', projectId: 'p', status: 'FAILED', createdAt: old },
            { id: 'pinned', projectId: 'p', status: 'SUPERSEDED', createdAt: old, retentionPinnedAt: now },
            { id: 'eligible', projectId: 'p', status: 'SUPERSEDED', createdAt: old },
        ];
        expect(retentionCandidates(releases, new Set(['active']), new Set(['candidate']), now)).toEqual(['eligible']);
    });

    it('keeps at most five successful releases and expires failed releases after 24h', () => {
        const now = new Date('2026-10-12T00:00:00Z');
        const releases = Array.from({ length: 7 }, (_, index) => ({
            id: `r${index}`,
            projectId: 'p',
            status: 'SUPERSEDED',
            createdAt: new Date(now.getTime() - index * 60_000),
        }));
        releases.push({ id: 'failed', projectId: 'p', status: 'FAILED', createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) });
        expect(retentionCandidates(releases, new Set(), new Set(), now)).toEqual(['r5', 'r6', 'failed']);
    });
});
