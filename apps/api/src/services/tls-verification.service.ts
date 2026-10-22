import tls, { PeerCertificate } from 'node:tls';
import prisma from '@deployforge/database';

export type CertificateFacts = {
    validFrom: Date;
    validTo: Date;
    issuer: string;
    subjectAltName: string;
    authorized: boolean;
    authorizationError?: string;
};

export class TLSVerificationService {
    static validateFacts(hostname: string, facts: CertificateFacts, now = new Date()) {
        if (!facts.authorized) throw new Error(facts.authorizationError || 'Certificate chain is not trusted');
        const hostError = tls.checkServerIdentity(hostname, { subjectaltname: facts.subjectAltName } as PeerCertificate);
        if (hostError) throw new Error('Certificate hostname does not match the domain');
        if (!facts.issuer.trim()) throw new Error('Certificate issuer is missing');
        if (facts.validFrom.getTime() > now.getTime()) throw new Error('Certificate is not valid yet');
        if (facts.validTo.getTime() <= now.getTime()) throw new Error('Certificate has expired');
        if (facts.validTo.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
            throw new Error('Certificate expires in less than 24 hours');
        }
        return { issuer: facts.issuer, expiresAt: facts.validTo };
    }

    static async inspect(hostname: string, timeoutMs = 10_000): Promise<CertificateFacts> {
        return new Promise((resolve, reject) => {
            const socket = tls.connect({
                host: hostname,
                port: 443,
                servername: hostname,
                rejectUnauthorized: true,
                timeout: timeoutMs,
            });
            const finish = (error?: Error) => {
                socket.destroy();
                if (error) reject(error);
            };
            socket.once('secureConnect', () => {
                const cert = socket.getPeerCertificate();
                if (!cert?.raw) return finish(new Error('Server did not present a certificate'));
                const issuer = Object.values(cert.issuer || {}).filter(Boolean).join(', ');
                const facts: CertificateFacts = {
                    validFrom: new Date(cert.valid_from),
                    validTo: new Date(cert.valid_to),
                    issuer,
                    subjectAltName: cert.subjectaltname || '',
                    authorized: socket.authorized,
                    authorizationError: socket.authorizationError?.message,
                };
                socket.end();
                resolve(facts);
            });
            socket.once('timeout', () => finish(new Error('TLS handshake timed out')));
            socket.once('error', (error) => finish(error));
        });
    }

    static async verifyDomain(domainId: string) {
        const domain = await prisma.domain.findUnique({ where: { id: domainId } });
        if (!domain || domain.status !== 'ACTIVE') throw new Error('Domain is not active');
        const facts = await this.inspect(domain.domainName);
        const result = this.validateFacts(domain.domainName, facts);
        return prisma.domain.update({
            where: { id: domainId },
            data: {
                sslStatus: 'ISSUED',
                sslVerifiedAt: new Date(),
                sslExpiresAt: result.expiresAt,
                sslIssuer: result.issuer,
                sslError: null,
                sslNextRetryAt: null,
            },
        });
    }

    static sanitizeError(error: unknown) {
        return String(error instanceof Error ? error.message : error || 'TLS verification failed')
            .replace(/(token|password|secret|authorization)\s*[=:]\s*\S+/gi, '$1=[REDACTED]')
            .replace(/[\r\n\t]+/g, ' ')
            .slice(0, 300);
    }

    static failureState(message: string, attemptNumber: number, now = Date.now(), maxAttempts = 8) {
        const finalAttempt = attemptNumber >= maxAttempts;
        const expired = /expired|less than 24 hours/i.test(message);
        const delay = Math.min(15_000 * (2 ** Math.max(0, attemptNumber - 1)), 300_000);
        return {
            sslStatus: finalAttempt ? (expired ? 'EXPIRED' as const : 'FAILED' as const) : 'PENDING' as const,
            sslNextRetryAt: finalAttempt ? null : new Date(now + delay),
        };
    }
}
