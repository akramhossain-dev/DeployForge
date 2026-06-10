"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class TokenService {
    secret;
    constructor(secret) {
        this.secret = secret;
    }
    generateAccessToken(payload) {
        return jsonwebtoken_1.default.sign(payload, this.secret, { expiresIn: '15m' });
    }
    generateRefreshToken(payload) {
        return jsonwebtoken_1.default.sign(payload, this.secret, { expiresIn: '7d' });
    }
    verifyToken(token) {
        return jsonwebtoken_1.default.verify(token, this.secret);
    }
}
exports.TokenService = TokenService;
