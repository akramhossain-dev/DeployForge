export type RetentionRelease = { id: string; projectId: string; status: string; createdAt: Date; retentionPinnedAt?: Date | null };

export function retentionCandidates(releases: RetentionRelease[], activeIds: Set<string>, candidateIds: Set<string>, now = new Date()) {
    const protectedIds = new Set([...activeIds, ...candidateIds]);
    const byProject = new Map<string, RetentionRelease[]>();
    for (const release of releases) {
        const items = byProject.get(release.projectId) || [];
        items.push(release);
        byProject.set(release.projectId, items);
        if (release.retentionPinnedAt) protectedIds.add(release.id);
    }
    const result: string[] = [];
    const successCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const failedCutoff = now.getTime() - 24 * 60 * 60 * 1000;
    for (const items of byProject.values()) {
        const successful = items.filter((release) => ['ACTIVE', 'SUPERSEDED'].includes(release.status)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        successful.forEach((release, index) => {
            if (!protectedIds.has(release.id) && (index >= 5 || release.createdAt.getTime() < successCutoff)) result.push(release.id);
        });
        for (const release of items) {
            if (release.status === 'FAILED' && release.createdAt.getTime() < failedCutoff && !protectedIds.has(release.id)) result.push(release.id);
        }
    }
    return [...new Set(result)];
}
