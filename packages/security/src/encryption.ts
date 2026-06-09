import crypto from 'crypto';

export interface EncryptedData {
    content: string;
    iv: string;
    tag: string;
}

export class EncryptionService {
    private readonly algorithm = 'aes-256-gcm';
    private readonly key: Buffer;

    constructor(masterKey: string) {
        // masterKey should be 32 bytes
        this.key = Buffer.from(masterKey, 'hex');
        if (this.key.length !== 32) {
            throw new Error('Master key must be 32 bytes (64 hex characters)');
        }
    }

    encrypt(plaintext: string): EncryptedData {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag().toString('hex');

        return {
            content: encrypted,
            iv: iv.toString('hex'),
            tag: tag
        };
    }

    decrypt(encryptedData: EncryptedData): string {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.key,
            Buffer.from(encryptedData.iv, 'hex')
        );

        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

        let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
