import nodemailer from 'nodemailer';

export interface MailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
}

export class MailService {
    private transporter: nodemailer.Transporter;

    constructor(config: MailConfig) {
        this.transporter = nodemailer.createTransport(config);
    }

    async sendOTP(email: string, otp: string) {
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
        <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; 2024 DeployForge. All rights reserved.</p>
      </div>
    `;

        await this.transporter.sendMail({
            from: `"DeployForge" <${(this.transporter.options as any).auth?.user}>`,
            to: email,
            subject: 'Your DeployForge Verification Code',
            html,
        });
    }

    async sendPasswordReset(email: string, resetLink: string) {
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0ea5e9; text-align: center;">DeployForge Password Reset</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your DeployForge account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #64748b;">${resetLink}</p>
        <p>This link will expire in 1 hour. If you did not request this, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; 2024 DeployForge. All rights reserved.</p>
      </div>
    `;

        await this.transporter.sendMail({
            from: `"DeployForge" <${(this.transporter.options as any).auth?.user}>`,
            to: email,
            subject: 'Reset your DeployForge password',
            html,
        });
    }

    async sendEmailVerification(email: string, verificationLink: string) {
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0ea5e9; text-align: center;">Verify your DeployForge Account</h2>
        <p>Hello,</p>
        <p>Please click the button below to verify your email address and activate your DeployForge account:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #64748b;">${verificationLink}</p>
        <p>This link will expire in 24 hours.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; 2024 DeployForge. All rights reserved.</p>
      </div>
    `;

        await this.transporter.sendMail({
            from: `"DeployForge" <${(this.transporter.options as any).auth?.user}>`,
            to: email,
            subject: 'Verify your DeployForge email address',
            html,
        });
    }
}
