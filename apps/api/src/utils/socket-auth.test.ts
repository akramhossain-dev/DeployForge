import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
    process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
    process.env.JWT_SECRET ||= 'a9F2xQ7mN4vL8cR1pT6kW3zB5dH0sJ2u';
});
import { socketToken } from './socket-auth';

describe('socketToken', () => {
    it('does not accept a query-string token', () => {
        expect(socketToken({ headers: {} } as any, 'leaked-query-token')).toBe('');
    });

    it('accepts bearer headers and access-token cookies', () => {
        expect(socketToken({ headers: { authorization: 'Bearer header-token' } } as any)).toBe('header-token');
        expect(socketToken({ headers: { cookie: 'accessToken=cookie-token' } } as any)).toBe('cookie-token');
    });
});
