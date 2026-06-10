"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordService = void 0;
const argon2_1 = __importDefault(require("argon2"));
class PasswordService {
    static async hash(password) {
        return argon2_1.default.hash(password, {
            type: argon2_1.default.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4
        });
    }
    static async verify(hash, password) {
        return argon2_1.default.verify(hash, password);
    }
}
exports.PasswordService = PasswordService;
