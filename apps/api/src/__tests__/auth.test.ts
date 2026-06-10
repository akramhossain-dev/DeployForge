import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import prisma from '@deployforge/database';
import { MailService } from '@deployforge/mail';

vi.mock('@deployforge/database', () => ({
    default: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        verificationToken: {
            upsert: vi.fn(),
        },
    },
}));

vi.mock('@deployforge/mail', () => ({
    MailService: {
        sendOTP: vi.fn(),
    },
}));

describe('AuthService', () => {
    it('should generate an OTP and send an email', async () => {
        const email = 'test@example.com';
        (prisma.user.findUnique as any).mockResolvedValue(null);

        await AuthService.sendOTP(email);

        expect(prisma.verificationToken.upsert).toHaveBeenCalled();
        expect(MailService.sendOTP).toHaveBeenCalledWith(email, expect.any(String));
    });

    it('should verify a valid OTP', async () => {
        const email = 'test@example.com';
        const otp = '123456';
        // Logic for verification test...
    });
});
