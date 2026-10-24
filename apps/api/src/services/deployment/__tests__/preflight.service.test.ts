import { describe, expect, it } from 'vitest';
import {
    isPlaceholderEnvValue,
    referencedEnvironmentCheck,
    requiredEnvironmentCheck,
    summarizePreflight,
} from '../preflight.service';

describe('deployment preflight helpers', () => {
    it('detects empty and explicit placeholder values without flagging real secrets', () => {
        expect(isPlaceholderEnvValue('')).toBe(true);
        expect(isPlaceholderEnvValue('change-me')).toBe(true);
        expect(isPlaceholderEnvValue('your_api_key')).toBe(true);
        expect(isPlaceholderEnvValue('sk_live_abc123')).toBe(false);
    });

    it('summarizes pass, warning and blocked checks', () => {
        expect(summarizePreflight([
            { code: 'a', category: 'x', title: 'A', status: 'PASS', message: 'ok' },
            { code: 'b', category: 'x', title: 'B', status: 'WARNING', message: 'warn' },
            { code: 'c', category: 'x', title: 'C', status: 'BLOCKED', message: 'stop' },
        ])).toEqual({ passed: 1, warnings: 1, blocked: 1 });
    });

    it('blocks a missing required database URL without exposing configured secret values', () => {
        const check = requiredEnvironmentCheck(
            ['DATABASE_URL', 'REDIS_URL'],
            { REDIS_URL: 'redis://:private-password@redis.internal:6379' },
        );

        expect(check.status).toBe('BLOCKED');
        expect(check.message).toContain('DATABASE_URL');
        expect(check.message).not.toContain('private-password');
    });

    it('keeps source-only environment references overridable warnings', () => {
        const check = referencedEnvironmentCheck(['NEXT_PUBLIC_API_URL'], {});

        expect(check.status).toBe('WARNING');
        expect(check.message).toContain('NEXT_PUBLIC_API_URL');
    });
});
