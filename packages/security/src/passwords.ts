import argon2 from 'argon2';

const minPasswordLength = 12;
const weakPasswords = new Set([
    'password',
    'password123',
    'password1234',
    'qwerty123456',
    'letmein123456',
    'admin123456',
    'deployforge123',
]);

export class PasswordService {
    private static dummyHash: Promise<string> | null = null;

    static validate(password: string): { valid: true } | { valid: false; message: string } {
        if (password.length < minPasswordLength) {
            return { valid: false, message: `Password must be at least ${minPasswordLength} characters long` };
        }

        const normalized = password.toLowerCase();
        if (weakPasswords.has(normalized) || /(.)\1{5,}/.test(password) || /^(?:1234567890|0987654321)/.test(password)) {
            return { valid: false, message: 'Password is too weak' };
        }

        if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            return { valid: false, message: 'Password must include uppercase, lowercase, number, and symbol characters' };
        }

        return { valid: true };
    }

    static assertStrong(password: string): void {
        const result = this.validate(password);
        if (!result.valid) {
            throw Object.assign(new Error(result.message), { statusCode: 400, expose: true });
        }
    }

    static async hash(password: string): Promise<string> {
        return argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4
        });
    }

    static async verify(hash: string, password: string): Promise<boolean> {
        return argon2.verify(hash, password);
    }

    static async verifyAgainstDummy(password: string): Promise<boolean> {
        this.dummyHash = this.dummyHash || this.hash('DeployForgeDummyPassword1!');
        return this.verify(await this.dummyHash, password);
    }
}
