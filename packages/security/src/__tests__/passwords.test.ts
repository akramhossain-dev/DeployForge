import { describe, it, expect } from 'vitest';
import { PasswordService } from '../passwords';

describe('PasswordService', () => {
    describe('validate', () => {
        it('should reject passwords that are too short', () => {
            const result = PasswordService.validate('A1!b');
            expect(result.valid).toBe(false);
            expect((result as any).message).toContain('at least 6 characters');
        });

        it('should reject explicitly weak passwords', () => {
            const result = PasswordService.validate('password123');
            expect(result.valid).toBe(false);
            expect((result as any).message).toBe('Password is too weak');
        });

        it('should reject passwords with long character repetitions', () => {
            const result = PasswordService.validate('aaaaaaA1!');
            expect(result.valid).toBe(false);
            expect((result as any).message).toBe('Password is too weak');
        });

        it('should reject passwords starting with simple sequences', () => {
            const result = PasswordService.validate('1234567890Aa!');
            expect(result.valid).toBe(false);
            expect((result as any).message).toBe('Password is too weak');
        });

        it('should reject passwords missing complexity requirements', () => {
            
            expect(PasswordService.validate('abc12!').valid).toBe(false);
            
            expect(PasswordService.validate('ABC12!').valid).toBe(false);
            
            expect(PasswordService.validate('Abcdef!').valid).toBe(false);
            
            expect(PasswordService.validate('Abcde12').valid).toBe(false);
        });

        it('should accept strong passwords', () => {
            const result = PasswordService.validate('StrongPass123!');
            expect(result.valid).toBe(true);
        });
    });

    describe('assertStrong', () => {
        it('should throw on weak passwords', () => {
            expect(() => PasswordService.assertStrong('123')).toThrow();
        });

        it('should not throw on strong passwords', () => {
            expect(() => PasswordService.assertStrong('S3cur3P@ssw0rd')).not.toThrow();
        });
    });

    describe('hashing and verification', () => {
        it('should hash and verify passwords using Argon2id', async () => {
            const password = 'MySecretPassword123!';
            const hash = await PasswordService.hash(password);
            
            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.startsWith('$argon2')).toBe(true);

            const isValid = await PasswordService.verify(hash, password);
            expect(isValid).toBe(true);

            const isInvalid = await PasswordService.verify(hash, 'wrong_password');
            expect(isInvalid).toBe(false);
        });

        it('should verify against a dummy password', async () => {
            const isMatch = await PasswordService.verifyAgainstDummy('somepassword');
            expect(isMatch).toBe(false);
        });
    });
});
