import jwt from 'jsonwebtoken';

export class TokenService {
    constructor(private readonly secret: string) { }

    generateAccessToken(payload: object): string {
        return jwt.sign(payload, this.secret, { expiresIn: '15m' });
    }

    // Note: Refresh tokens are opaque random bytes (crypto.randomBytes), NOT JWTs.
    // See AuthService.issueSession() — do NOT add a JWT-based refresh token method here.

    verifyToken(token: string): any {
        return jwt.verify(token, this.secret);
    }
}
