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
    logger?: {
        info: (msg: string, ...args: any[]) => void;
        warn: (msg: string, ...args: any[]) => void;
        error: (msg: string, ...args: any[]) => void;
    };
}

export interface StructuredLog {
    stage: 'smtp' | 'build' | 'deploy' | 'runtime' | 'auth';
    severity: 'info' | 'warn' | 'error';
    message: string;
    hint?: string;
    fix_suggestion?: string;
}

function structuredLog(log: StructuredLog, customLogger?: MailConfig['logger']) {
    const payload = JSON.stringify({ ...log, timestamp: new Date().toISOString() });
    if (customLogger) {
        if (log.severity === 'error') {
            customLogger.error(log.message, log);
        } else if (log.severity === 'warn') {
            customLogger.warn(log.message, log);
        } else {
            customLogger.info(log.message, log);
        }
    } else {
        if (log.severity === 'error') {
            console.error(payload);
        } else if (log.severity === 'warn') {
            console.warn(payload);
        } else {
            console.log(payload);
        }
    }
}

export class MailService {
    private transporter: nodemailer.Transporter;
    private fromEmail: string;
    private customLogger?: MailConfig['logger'];

    constructor(config: MailConfig) {
        this.fromEmail = config.fromEmail || config.auth.user;
        this.customLogger = config.logger;

        if (!config.host || !config.auth.user || !config.auth.pass) {
            structuredLog({
                stage: 'smtp',
                severity: 'error',
                message: 'SMTP configuration incomplete',
                hint: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM are required for real email delivery',
                fix_suggestion: 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env file',
            }, this.customLogger);
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
                }, this.customLogger);
                return;
            }

            structuredLog({
                stage: 'smtp',
                severity: 'info',
                message: 'SMTP connection is ready and verified',
            }, this.customLogger);
        });
    }

    private async sendWithRetry(mailOptions: nodemailer.SendMailOptions, retries = 3, delay = 1000): Promise<any> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                 const info = await this.transporter.sendMail(mailOptions);
                structuredLog({
                    stage: 'smtp',
                    severity: 'info',
                    message: `Email sent successfully to ${mailOptions.to} (MessageID: ${info.messageId})`,
                }, this.customLogger);
                return info;
            } catch (error: any) {
                structuredLog({
                    stage: 'smtp',
                    severity: attempt === retries ? 'error' : 'warn',
                    message: `Attempt ${attempt}/${retries} failed to send email to ${mailOptions.to}: ${error.message}`,
                    hint: attempt < retries ? 'Will retry...' : 'All retry attempts exhausted. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.',
                    fix_suggestion: attempt === retries
                        ? 'Verify SMTP credentials in .env. For Gmail use smtp.gmail.com:587 with an App Password (not your account password).'
                        : undefined,
                }, this.customLogger);
                if (attempt === retries) {
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

    async sendAlertEmail(email: string, alert: {
        level: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
        title: string;
        message: string;
        serverName?: string;
        resourceValue?: number;
        timestamp?: string;
    }) {
        const levelColors: Record<string, { bg: string; text: string; border: string }> = {
            INFO: { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
            SUCCESS: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
            WARNING: { bg: '#fef9c3', text: '#a16207', border: '#fde047' },
            CRITICAL: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
        };
        const colors = levelColors[alert.level] || levelColors.WARNING;
        const ts = alert.timestamp || new Date().toISOString();

        const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 24px; text-align: center;">
          <h1 style="color: #22d3ee; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">⚡ DeployForge Alert</h1>
        </div>
        <div style="padding: 24px;">
          <div style="background-color: ${colors.bg}; border-left: 4px solid ${colors.border}; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: ${colors.text}; text-transform: uppercase; letter-spacing: 0.5px;">${alert.level}</p>
            <p style="margin: 6px 0 0; font-size: 16px; font-weight: 700; color: #0f172a;">${alert.title}</p>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">${alert.message}</p>
          ${alert.serverName ? `<div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #f8fafc; border-radius: 6px; margin-bottom: 10px;"><span style="color: #64748b; font-size: 12px; font-weight: 600;">Server:</span><span style="color: #0f172a; font-size: 13px; font-weight: 700;">${alert.serverName}</span></div>` : ''}
          ${alert.resourceValue !== undefined ? `<div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #f8fafc; border-radius: 6px; margin-bottom: 10px;"><span style="color: #64748b; font-size: 12px; font-weight: 600;">Value:</span><span style="color: #0f172a; font-size: 13px; font-weight: 700;">${alert.resourceValue}%</span></div>` : ''}
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #f8fafc; border-radius: 6px;"><span style="color: #64748b; font-size: 12px; font-weight: 600;">Time:</span><span style="color: #0f172a; font-size: 13px;">${new Date(ts).toLocaleString()}</span></div>
        </div>
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">&copy; DeployForge. You can manage alert preferences in your dashboard settings.</p>
        </div>
      </div>
    `;

        await this.sendWithRetry({
            from: `"DeployForge Alerts" <${this.fromEmail}>`,
            to: email,
            subject: `[${alert.level}] ${alert.title}`,
            html,
        });
    }

    async sendDeploymentAlert(email: string, deployment: {
        name?: string;
        status: 'SUCCESS' | 'FAILED';
        serverName?: string;
    }) {
        const isFailed = deployment.status === 'FAILED';
        await this.sendAlertEmail(email, {
            level: isFailed ? 'CRITICAL' : 'SUCCESS',
            title: isFailed ? 'Deployment Failed' : 'Deployment Completed',
            message: isFailed
                ? `Your deployment "${deployment.name || 'Unknown'}" has failed. Please check the deployment logs for more details.`
                : `Your deployment "${deployment.name || 'Unknown'}" has completed successfully and is now live.`,
            serverName: deployment.serverName,
        });
    }

    async sendSSLExpiryAlert(email: string, domain: string, daysLeft: number) {
        await this.sendAlertEmail(email, {
            level: daysLeft <= 7 ? 'CRITICAL' : 'WARNING',
            title: 'SSL Certificate Expiring Soon',
            message: `The SSL certificate for <strong>${domain}</strong> will expire in <strong>${daysLeft} days</strong>. Please renew it to avoid service disruption.`,
            resourceValue: daysLeft,
        });
    }

    async sendBackupAlert(email: string, status: 'COMPLETED' | 'FAILED', serverName?: string) {
        const isFailed = status === 'FAILED';
        await this.sendAlertEmail(email, {
            level: isFailed ? 'CRITICAL' : 'SUCCESS',
            title: isFailed ? 'Backup Failed' : 'Backup Completed',
            message: isFailed
                ? `A scheduled backup has failed${serverName ? ` on server "${serverName}"` : ''}. Please investigate and retry manually if needed.`
                : `A scheduled backup has completed successfully${serverName ? ` on server "${serverName}"` : ''}.`,
            serverName,
        });
    }
}
