import { describe, it, expect } from 'vitest';
import { EncryptionService } from '../encryption';

describe('EncryptionService', () => {
    
    const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const invalidKeyShort = '0123456789abcdef';

    it('should initialize with a valid 32-byte hex key', () => {
        expect(() => new EncryptionService(validKey)).not.toThrow();
    });

    it('should throw an error if the key is not 32 bytes', () => {
        expect(() => new EncryptionService(invalidKeyShort)).toThrow('Master key must be 32 bytes');
    });

    it('should encrypt and decrypt a plaintext value correctly', () => {
        const service = new EncryptionService(validKey);
        const plaintext = 'Secret DeployForge Credentials!';
        
        const encrypted = service.encrypt(plaintext);
        expect(encrypted.content).toBeDefined();
        expect(encrypted.iv).toBeDefined();
        expect(encrypted.tag).toBeDefined();
        
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('should generate unique IV and tag for identical plaintexts', () => {
        const service = new EncryptionService(validKey);
        const plaintext = 'Same String';
        
        const encrypted1 = service.encrypt(plaintext);
        const encrypted2 = service.encrypt(plaintext);
        
        expect(encrypted1.iv).not.toBe(encrypted2.iv);
        expect(encrypted1.content).not.toBe(encrypted2.content);
    });
});
