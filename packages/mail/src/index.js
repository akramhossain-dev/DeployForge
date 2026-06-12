"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class MailService {
    transporter;
    constructor(config) {
        this.transporter = nodemailer_1.default.createTransport(config);
    }
    async sendOTP(email, otp) {
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0ea5e9; text-align: center;">DeployForge Verification</h2>
        <p>Hello,</p>
        <p>Your verification code for DeployForge is:</p>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; margin: 20px 0;">
          ${otp}
        </div>
        <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; DeployForge. All rights reserved.</p>
      </div>
    `;
        await this.transporter.sendMail({
            from: `"DeployForge" <${this.transporter.options.auth?.user}>`,
            to: email,
            subject: 'Your DeployForge Verification Code',
            html,
        });
    }
}
exports.MailService = MailService;
