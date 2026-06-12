# 📊 MONITORING.md

DeployForge includes built-in performance tracking for managed VPS targets, gathering container states, CPU, RAM, and Disk capacity.

---

## 1. Remote Metrics Extraction
Metrics collection is performed agentlessly over SSH. DeployForge logs in and executes light shell scripts:
*   **CPU & RAM Usage:** Runs standard parsing commands like:
    `top -bn1 | grep "Cpu(s)"` and `free -m`
*   **Disk Capacity:** Evaluates storage space with:
    `df -h / | tail -1`
*   **Containers Count:** Counts active Docker services using:
    `docker ps -q | wc -l`

---

## 2. Polling Schedules & Triggers
DeployForge operates on two collection triggers:
1.  **Scheduled Polling (Cron):** A background worker task runs periodically (e.g. every minute) to query all active VPS targets and store health snapshots in the database.
2.  **Manual Refresh:** Users can hit the `/vps/:id/health-check` or `/vps/metrics/:vpsId/collect` API to force a real-time health-check query and display current stats instantly.

---

## 3. Database Snapshots
*   **VPSHealth:** Stores connection results (`dockerInstalled`, `nginxInstalled`) along with resource utilization metrics.
*   **SystemMetrics:** Holds fine-grained timestamps of cpu, memory, and disk usage for graphing purposes in the frontend.
*   **Data Retention:** To prevent excessive database growth, old metric records are purged periodically.
