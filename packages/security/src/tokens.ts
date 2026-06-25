import jwt from 'jsonwebtoken';

export class TokenService {
    constructor(private readonly secret: string) { }

    generateAccessToken(payload: object): string {
        return jwt.sign(payload, this.secret, { expiresIn: '15m' });
    }

    verifyToken(token: string): any {
        return jwt.verify(token, this.secret);
    }
}
