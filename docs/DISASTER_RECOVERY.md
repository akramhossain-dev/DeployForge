# 📂 Disaster Recovery and Backup Procedures

This document outlines the backup, retention, integrity validation, and disaster recovery procedures for DeployForge.

---

## 1. Backup Strategy Overview

To ensure the high availability and durability of DeployForge data, we implement a two-pronged backup strategy:
1. **Automated Database Backups:** A PostgreSQL custom format backup (`.dump`) containing the complete schema and all relational data (projects, VPSs, deployments, histories, credentials, etc.) is created.
2. **Automated Configuration Backups:** A JSON export containing non-sensitive application settings (SMTP hosts, ports, security configurations) is generated to assist with platform reconfiguration.

### 📅 Execution Schedule & Retention
- **Automated Execution:** Backups run automatically every 24 hours on the API container startup.
- **Manual Trigger:** Super Admins can manually trigger backups via the Admin API: `POST /admin/backups/create`.
- **Retention Policy:** The system automatically prunes old backups, maintaining the **last 7 daily backups** for both database and configurations.

---

## 2. Backup Integrity Validation

To ensure backups are not corrupt and can be successfully restored:
1. **Zero-Byte Check:** The backup service verifies that the file is non-empty.
2. **Magic Number Verification (Database):** Every PostgreSQL custom-format backup must begin with the 5-byte header `PGDMP`. The validation service parses these bytes before labeling the backup as valid.
3. **JSON Structure Check (Configuration):** The configuration JSON backup is parsed on creation to verify structure integrity.
4. **List Status:** The list of backups, along with their validation status, is available via: `GET /admin/backups`.

---

## 3. Restore Procedures

### Method A: REST API (Recommended for Admins)
Super Admins can trigger a restore of any valid database backup from the UI or via curl:

```bash
curl -X POST http://localhost:3001/admin/backups/restore \
  -H "Content-Type: application/json" \
  -d '{"filename": "db-backup-2026-06-23T10-33-23-000Z.dump"}'
```

The system will:
1. Validate the backup integrity (`PGDMP` header check).
2. Clean existing database objects using `pg_restore --clean --no-owner`.
3. Re-import all schemas, tables, and records.

### Method B: Direct CLI Command (Disaster Recovery Mode)
If the API service itself is down, the database can be restored directly via Docker or the host shell.

#### 1. Locating the Backup File
Backups are persistently stored on the host under the application's root workspace folder:
```bash
./backups/db/db-backup-*.dump
```

#### 2. Restoring to PostgreSQL Container
Execute `pg_restore` against the running Postgres container using the backup file:

```bash
# Copy the backup file to the Postgres container (if necessary)
docker cp ./backups/db/db-backup-YYYY-MM-DD-HH-mm-ss.dump deployforge-postgres-1:/tmp/backup.dump

# Execute pg_restore inside the container
docker exec -it deployforge-postgres-1 pg_restore --clean --no-owner -U postgres -d deployforge /tmp/backup.dump
```

*Note: Ensure the environment variable `DATABASE_URL` matches the target user and database.*

---

## 4. Recovering Deployment Data

DeployForge deployment configurations, scripts, env values, and server metadata are stored within the PostgreSQL database.
Therefore, restoring the database backup automatically recovers:
- All projects and repository mappings.
- VPS connections, including IP addresses, SSH credentials, and status records.
- Complete deployment history and rollback logs.

### Steps to Re-establish Deployments on a Fresh VPS
1. **Restore the Database:** Perform the database restore using either Method A or Method B.
2. **Validate VPS Connections:** Go to the VPS management panel and click **Test Connection** for each server. This ensures the SSH keys/passwords are decrypted and functional.
3. **Trigger Re-deployment:** Select the target project and click **Deploy**. The system will clone the code from GitHub (using Git credentials stored in database) and compile it on the target VPS.

---

## 5. Security & Secret Handling
- **Credential Masking:** Database URLs in logs and errors are automatically sanitized (replacing passwords with `*****`) to ensure no sensitive credentials leak into log outputs.
- **Secure File Permissions:** Database backup files are written with restrictive file permissions (`0o600`) where applicable, ensuring only the owner/process can read the file.
