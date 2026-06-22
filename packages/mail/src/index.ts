import nodemailer from 'nodemailer';

export interface MailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    fromEmail?: string;
}

export interface StructuredLog {
    stage: 'smtp' | 'build' | 'deploy' | 'runtime' | 'auth';
    severity: 'info' | 'warn' | 'error';
    message: string;
    hint?: string;
    fix_suggestion?: string;
}

function structuredLog(log: StructuredLog) {
    const payload = JSON.stringify({ ...log, timestamp: new Date().toISOString() });
    if (log.severity === 'error') {
        console.error(payload);
    } else if (log.severity === 'warn') {
        console.warn(payload);
    } else {
        console.log(payload);
    }
}

export class MailService {
    private transporter: nodemailer.Transporter;
    private fromEmail: string;

    constructor(config: MailConfig) {
        this.fromEmail = config.fromEmail || config.auth.user;

        if (!config.host || !config.auth.user || !config.auth.pass) {
            structuredLog({
                stage: 'smtp',
                severity: 'error',
                message: 'SMTP configuration incomplete',
                hint: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM are required for real email delivery',
                fix_suggestion: 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env file',
            });
            throw new Error('SMTP configuration incomplete');
        }

        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass,
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            tls: {
                rejectUnauthorized: true,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
        });

        this.transporter.verify((error) => {
            if (error) {
                structuredLog({
                    stage: 'smtp',
                    severity: 'error',
                    message: `SMTP connection verification failed: ${error.message}`,
                    hint: 'The SMTP server rejected the connection. This could be due to wrong credentials, port, or TLS settings.',
                    fix_suggestion: 'Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM. For Gmail, use smtp.gmail.com with port 587 and secure=false, or port 465 and secure=true.',
                });
                return;
            }

            structuredLog({
                stage: 'smtp',
                severity: 'info',
                message: 'SMTP connection is ready and verified',
            });
        });
    }

    private async sendWithRetry(mailOptions: nodemailer.SendMailOptions, retries = 3, delay = 1000): Promise<any> {
        const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const info = await this.transporter.sendMail(mailOptions);
                structuredLog({
                    stage: 'smtp',
                    severity: 'info',
                    message: `Email sent successfully to ${mailOptions.to} (MessageID: ${info.messageId})`,
                });
                return info;
            } catch (error: any) {
                structuredLog({
                    stage: 'smtp',
                    severity: attempt === retries ? 'error' : 'warn',
                    message: `Attempt ${attempt}/${retries} failed to send email to ${mailOptions.to}: ${error.message}`,
                    hint: attempt < retries ? 'Will retry...' : 'All retry attempts exhausted',
                    fix_suggestion: attempt === retries ? 'Check SMTP configuration and network connectivity' : undefined,
                });
                if (attempt === retries) {
                    if (isDev) {
                        structuredLog({
                            stage: 'smtp',
                            severity: 'info',
                            message: `[DEVELOPMENT MOCK] Email content for ${mailOptions.to}:\nSubject: ${mailOptions.subject}\nHTML:\n${mailOptions.html}\n`,
                        });
                        return { messageId: 'mock-id' };
                    }
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, delay * attempt));
            }
        }
    }

    async sendOTP(email: string, otp: string) {
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
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

        await this.sendWithRetry({
            from: `"DeployForge" <${this.fromEmail}>`,
            to: email,
            subject: 'Your DeployForge Verification Code',
            html,
        });
    }

    async sendPasswordReset(email: string, resetLink: string) {
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
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
        <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; DeployForge. All rights reserved.</p>
      </div>
    `;

        await this.sendWithRetry({
            from: `"DeployForge" <${this.fromEmail}>`,
            to: email,
            subject: 'Reset your DeployForge password',
            html,
        });
    }

    async sendEmailVerification(email: string, verificationLink: string) {
        const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
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
        <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; DeployForge. All rights reserved.</p>
      </div>
    `;

        await this.sendWithRetry({
            from: `"DeployForge" <${this.fromEmail}>`,
            to: email,
            subject: 'Verify your DeployForge email address',
            html,
        });
    }
}
