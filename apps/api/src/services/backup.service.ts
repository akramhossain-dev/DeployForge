import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AccountService } from './account.service';

const execAsync = promisify(exec);

export interface BackupMetadata {
    filename: string;
    filePath: string;
    sizeBytes: number;
    createdAt: Date;
    isValid: boolean;
    type: 'db' | 'config';
}

export class BackupService {
    private static backupDir = path.join(process.cwd(), 'backups');

    /**
     * Gets the current backup directory path
     */
    static getBackupDirectory() {
        return this.backupDir;
    }

    /**
     * Helper to sanitize database URL in log messages
     */
    private static sanitizeUrl(url: string): string {
        try {
            const parsed = new URL(url);
            if (parsed.password) {
                parsed.password = '*****';
            }
            return parsed.toString();
        } catch {
            return 'DATABASE_URL';
        }
    }

    /**
     * Prepares the backup directory structure
     */
    private static async ensureDirectories() {
        await fs.mkdir(this.backupDir, { recursive: true });
        await fs.mkdir(path.join(this.backupDir, 'db'), { recursive: true });
        await fs.mkdir(path.join(this.backupDir, 'config'), { recursive: true });
    }

    /**
     * Performs a database backup using pg_dump
     */
    static async backupDatabase(adminUserId?: string, ipAddress?: string, userAgent?: string): Promise<BackupMetadata> {
        await this.ensureDirectories();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `db-backup-${timestamp}.dump`;
        const filePath = path.join(this.backupDir, 'db', filename);

        const databaseUrl = config.database.url;
        logger.info(`Starting database backup to ${filename}...`);

        try {
            // Run pg_dump in custom archive format (-F c) which is compressed by default and supports pg_restore
            const cmd = `pg_dump --dbname="${databaseUrl}" -F c -f "${filePath}"`;
            await execAsync(cmd);

            // Validate integrity immediately
            const isValid = await this.validateBackup(filePath, 'db');
            if (!isValid) {
                throw new Error('Backup file generated but failed integrity verification.');
            }

            const stat = await fs.stat(filePath);
            const metadata: BackupMetadata = {
                filename,
                filePath,
                sizeBytes: stat.size,
                createdAt: stat.birthtime || new Date(),
                isValid: true,
                type: 'db',
            };

            logger.info({ backup: filename, size: stat.size }, 'Database backup completed and verified successfully.');

            if (adminUserId) {
                // If triggered by admin, we can log it
                await AccountService.logAudit(adminUserId, 'DATABASE_BACKUP_SUCCESS', `Database backup created successfully: ${filename}`, ipAddress, userAgent);
            }

            return metadata;
        } catch (error: any) {
            const sanitizedMsg = error.message ? error.message.replace(databaseUrl, this.sanitizeUrl(databaseUrl)) : 'Unknown error';
            logger.error({ err: error, message: sanitizedMsg }, 'Database backup failed.');
            
            if (adminUserId) {
                await AccountService.logAudit(adminUserId, 'DATABASE_BACKUP_FAILURE', `Database backup failed: ${sanitizedMsg}`, ipAddress, userAgent);
            }
            throw new Error(`Database backup failed: ${sanitizedMsg}`);
        }
    }

    /**
     * Backs up system configuration (.env config fields mapped to JSON)
     */
    static async backupConfiguration(adminUserId?: string, ipAddress?: string, userAgent?: string): Promise<BackupMetadata> {
        await this.ensureDirectories();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `config-backup-${timestamp}.json`;
        const filePath = path.join(this.backupDir, 'config', filename);

        logger.info(`Starting config backup to ${filename}...`);

        try {
            // Backup non-sensitive properties of config
            const configBackup = {
                app: {
                    env: config.app.env,
                    port: config.app.port,
                    appUrl: config.app.appUrl,
                    apiUrl: config.app.apiUrl,
                },
                email: {
                    smtp: {
                        host: config.email.smtp.host,
                        port: config.email.smtp.port,
                        secure: config.email.smtp.secure,
                        user: config.email.smtp.user,
                    },
                    fromEmail: config.email.fromEmail,
                },
                security: {
                    rateLimitMax: config.security.rateLimitMax,
                    rateLimitWindow: config.security.rateLimitWindow,
                    adminMaxAttempts: config.security.adminMaxAttempts,
                    adminLockoutTime: config.security.adminLockoutTime,
                },
                timestamp: new Date().toISOString(),
            };

            await fs.writeFile(filePath, JSON.stringify(configBackup, null, 2), 'utf-8');

            const stat = await fs.stat(filePath);
            const metadata: BackupMetadata = {
                filename,
                filePath,
                sizeBytes: stat.size,
                createdAt: stat.birthtime || new Date(),
                isValid: true,
                type: 'config',
            };

            logger.info({ backup: filename }, 'Configuration backup completed successfully.');

            if (adminUserId) {
                await AccountService.logAudit(adminUserId, 'CONFIG_BACKUP_SUCCESS', `Configuration backup created: ${filename}`, ipAddress, userAgent);
            }

            return metadata;
        } catch (error: any) {
            logger.error({ err: error }, 'Configuration backup failed.');
            if (adminUserId) {
                await AccountService.logAudit(adminUserId, 'CONFIG_BACKUP_FAILURE', `Configuration backup failed: ${error.message}`, ipAddress, userAgent);
            }
            throw error;
        }
    }

    /**
     * Validates integrity of a backup file
     */
    static async validateBackup(filePath: string, type: 'db' | 'config'): Promise<boolean> {
        try {
            const stat = await fs.stat(filePath);
            if (stat.size === 0) {
                logger.warn({ filePath }, 'Backup validation failed: File is empty (0 bytes).');
                return false;
            }

            const fd = await fs.open(filePath, 'r');
            if (type === 'db') {
                // A PostgreSQL custom format dump file (-F c) always starts with the magic string "PGDMP" (first 5 bytes)
                const buffer = Buffer.alloc(5);
                await fd.read(buffer, 0, 5, 0);
                await fd.close();

                const magic = buffer.toString('utf-8');
                if (magic !== 'PGDMP') {
                    logger.warn({ filePath, magic }, 'Backup validation failed: Magic number mismatch (expected PGDMP).');
                    return false;
                }
            } else {
                // Validate JSON parsing for configuration backup
                const content = await fs.readFile(filePath, 'utf-8');
                JSON.parse(content);
                await fd.close();
            }

            return true;
        } catch (err) {
            logger.error({ err, filePath }, 'Backup validation threw an exception.');
            return false;
        }
    }

    /**
     * Restores a database backup using pg_restore
     */
    static async restoreDatabase(filename: string, adminUserId?: string, ipAddress?: string, userAgent?: string): Promise<boolean> {
        const filePath = path.join(this.backupDir, 'db', filename);
        const databaseUrl = config.database.url;

        logger.info(`Starting database restore from ${filename}...`);

        try {
            // First validate the backup file exists and is valid
            const isValid = await this.validateBackup(filePath, 'db');
            if (!isValid) {
                throw new Error(`Backup file ${filename} failed integrity validation or is missing.`);
            }

            // run pg_restore with connection url.
            // --clean drops database objects before recreating them
            // --no-owner skips setting ownership of objects to match the original database
            // -c/--clean requires custom format
            const cmd = `pg_restore --clean --no-owner --dbname="${databaseUrl}" "${filePath}"`;
            await execAsync(cmd);

            logger.info({ restoredFile: filename }, 'Database restore completed successfully.');

            if (adminUserId) {
                await AccountService.logAudit(adminUserId, 'DATABASE_RESTORE_SUCCESS', `Database successfully restored from backup: ${filename}`, ipAddress, userAgent);
            }
            return true;
        } catch (error: any) {
            const sanitizedMsg = error.message ? error.message.replace(databaseUrl, this.sanitizeUrl(databaseUrl)) : 'Unknown error';
            logger.error({ err: error, message: sanitizedMsg }, 'Database restore failed.');

            if (adminUserId) {
                await AccountService.logAudit(adminUserId, 'DATABASE_RESTORE_FAILURE', `Database restore failed: ${sanitizedMsg}`, ipAddress, userAgent);
            }
            throw new Error(`Database restore failed: ${sanitizedMsg}`);
        }
    }

    /**
     * Lists all database and configuration backups
     */
    static async listBackups(): Promise<BackupMetadata[]> {
        await this.ensureDirectories();
        const list: BackupMetadata[] = [];

        const readDir = async (sub: 'db' | 'config') => {
            const dirPath = path.join(this.backupDir, sub);
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const stat = await fs.stat(filePath);
                    const isValid = await this.validateBackup(filePath, sub);
                    list.push({
                        filename: file,
                        filePath,
                        sizeBytes: stat.size,
                        createdAt: stat.birthtime || new Date(),
                        isValid,
                        type: sub,
                    });
                } catch {
                    // Ignore individual file reading errors
                }
            }
        };

        await Promise.all([readDir('db'), readDir('config')]);
        return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    /**
     * Prunes old backups based on a retention count policy (keeps last N backups of each type)
     */
    static async pruneOldBackups(retentionCount = 7): Promise<string[]> {
        logger.info(`Pruning backups. Keeping last ${retentionCount} backups of each type.`);
        const allBackups = await this.listBackups();
        const deletedFiles: string[] = [];

        const dbBackups = allBackups.filter(b => b.type === 'db');
        const configBackups = allBackups.filter(b => b.type === 'config');

        const pruneGroup = async (backups: BackupMetadata[]) => {
            if (backups.length > retentionCount) {
                const toDelete = backups.slice(retentionCount);
                for (const backup of toDelete) {
                    try {
                        await fs.unlink(backup.filePath);
                        deletedFiles.push(backup.filename);
                        logger.info({ prunedFile: backup.filename }, 'Pruned old backup file.');
                    } catch (err) {
                        logger.error({ err, file: backup.filename }, 'Failed to prune backup file.');
                    }
                }
            }
        };

        await Promise.all([pruneGroup(dbBackups), pruneGroup(configBackups)]);
        return deletedFiles;
    }

    /**
     * Run an automated backup job (intended for cron/schedulers)
     */
    static async runScheduledBackup() {
        logger.info('Scheduled automated backup started.');
        try {
            await this.backupDatabase();
            await this.backupConfiguration();
            const pruned = await this.pruneOldBackups(7);
            logger.info({ prunedCount: pruned.length }, 'Scheduled automated backup completed successfully.');
        } catch (err) {
            logger.error({ err }, 'Scheduled automated backup failed.');
        }
    }
}
