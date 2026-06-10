"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionService = void 0;
const crypto_1 = __importDefault(require("crypto"));
class EncryptionService {
    algorithm = 'aes-256-gcm';
    key;
    constructor(masterKey) {
        // masterKey should be 32 bytes
        this.key = Buffer.from(masterKey, 'hex');
        if (this.key.length !== 32) {
            throw new Error('Master key must be 32 bytes (64 hex characters)');
        }
    }
    encrypt(plaintext) {
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv(this.algorithm, this.key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');
        return {
            content: encrypted,
            iv: iv.toString('hex'),
            tag: tag
        };
    }
    decrypt(encryptedData) {
        const decipher = crypto_1.default.createDecipheriv(this.algorithm, this.key, Buffer.from(encryptedData.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
        let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
exports.EncryptionService = EncryptionService;
