import { describe, it, expect } from 'vitest';
import { TokenService } from '../tokens';

describe('TokenService', () => {
    const secret = 'supersecretjwttokenfortestingpurposes';
    const payload = { userId: 'user-123', role: 'admin' };

    it('should generate and verify an access token', () => {
        const service = new TokenService(secret);
        const token = service.generateAccessToken(payload);
        
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        
        const decoded = service.verifyToken(token);
        expect(decoded).toMatchObject(payload);
        // Should contain expiration fields
        expect(decoded.exp).toBeDefined();
    });


    it('should throw an error for expired or invalid tokens', () => {
        const service = new TokenService(secret);
        const invalidToken = 'invalid.token.structure';
        
        expect(() => service.verifyToken(invalidToken)).toThrow();
    });
});
