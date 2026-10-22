import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test'; });
import { TLSVerificationService } from './tls-verification.service';

const now = new Date('2026-10-12T00:00:00.000Z');

function facts(overrides: Partial<Parameters<typeof TLSVerificationService.validateFacts>[1]> = {}) {
    return {
        validFrom: new Date('2026-10-01T00:00:00.000Z'),
        validTo: new Date('2027-01-01T00:00:00.000Z'),
        issuer: 'Example Public CA',
        subjectAltName: 'DNS:example.com, DNS:*.example.com',
        authorized: true,
        ...overrides,
    };
}

describe('TLSVerificationService', () => {
    it('accepts a trusted matching certificate with more than 24 hours remaining', () => {
        expect(TLSVerificationService.validateFacts('app.example.com', facts(), now).issuer).toBe('Example Public CA');
    });

    it('rejects untrusted and wrong-host certificates', () => {
        expect(() => TLSVerificationService.validateFacts('app.example.com', facts({ authorized: false }), now)).toThrow(/trusted/i);
        expect(() => TLSVerificationService.validateFacts('other.test', facts(), now)).toThrow(/hostname/i);
    });

    it('rejects expired and near-expiry certificates', () => {
        expect(() => TLSVerificationService.validateFacts('example.com', facts({ validTo: new Date('2026-10-11T00:00:00.000Z') }), now)).toThrow(/expired/i);
        expect(() => TLSVerificationService.validateFacts('example.com', facts({ validTo: new Date('2026-10-12T12:00:00.000Z') }), now)).toThrow(/24 hours/i);
    });

    it('redacts credentials from persisted errors', () => {
        expect(TLSVerificationService.sanitizeError(new Error('token=abc password:xyz'))).toBe('token=[REDACTED] password=[REDACTED]');
    });

    it('keeps bounded retries pending and records terminal failure states', () => {
        const pending = TLSVerificationService.failureState('ACME certificate is not ready', 1, now.getTime());
        expect(pending.sslStatus).toBe('PENDING');
        expect(pending.sslNextRetryAt?.toISOString()).toBe('2026-10-12T00:00:15.000Z');
        expect(TLSVerificationService.failureState('hostname mismatch', 8, now.getTime()).sslStatus).toBe('FAILED');
        expect(TLSVerificationService.failureState('Certificate has expired', 8, now.getTime()).sslStatus).toBe('EXPIRED');
    });
});
