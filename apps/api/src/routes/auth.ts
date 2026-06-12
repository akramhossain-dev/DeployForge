import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { AccountService } from '../services/account.service';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
    termsAccepted: z.literal(true, {
        errorMap: () => ({ message: 'You must accept Privacy Policy and Terms' }),
    }),
});

const verifyOtpSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export default async function authRoutes(fastify: FastifyInstance) {
    fastify.post('/register', async (request, reply) => {
        const { email, password, name } = registerSchema.parse(request.body);
        const result = await AuthService.register(email, password, name);
        return {
            success: true,
            message: result.devOtp ? 'SMTP unavailable. Development OTP generated.' : 'OTP sent to email',
            email: result.user.email,
            ...(result.devOtp && { devOtp: result.devOtp }),
        };
    });

    fastify.post('/verify-otp', async (request, reply) => {
        const { email, otp } = verifyOtpSchema.parse(request.body);
        await AuthService.verifyOTP(email, otp);
        return { message: 'Email verified successfully' };
    });

    fastify.post('/login', async (request, reply) => {
        const { email, password } = loginSchema.parse(request.body);
        const result = await AuthService.login(
            email,
            password,
            request.headers['user-agent'],
            request.ip
        );
        return result;
    });

    fastify.post('/refresh', async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken: string };
        const result = await AuthService.refresh(refreshToken);
        return result;
    });

    fastify.post('/logout', async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken: string };
        await AuthService.logout(refreshToken, request.ip, request.headers['user-agent']);
        return { message: 'Logged out successfully' };
    });

    fastify.get('/me', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        return { user: request.user };
    });

    fastify.post('/forgot-password', async (request) => {
        const { email } = z.object({ email: z.string().email() }).parse(request.body);
        await AccountService.forgotPassword(email);
        return { success: true, message: 'If the email exists, a password reset link has been sent' };
    });

    fastify.post('/reset-password', async (request) => {
        const { token, password } = z.object({
            token: z.string().min(1),
            password: z.string().min(8),
        }).parse(request.body);
        await AccountService.resetPassword(token, password, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Password has been reset successfully' };
    });

    fastify.post('/send-verification', { preHandler: [(fastify as any).authGuard] }, async (request) => {
        await AccountService.sendVerification(request.user.id);
        return { success: true, message: 'Verification email has been sent successfully' };
    });

    fastify.post('/verify-email', async (request) => {
        const { token } = z.object({ token: z.string().min(1) }).parse(request.body);
        await AccountService.verifyEmail(token, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Email verified successfully' };
    });
}
