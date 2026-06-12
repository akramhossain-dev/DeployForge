# 🔄 ROLLBACK_SYSTEM.md

DeployForge includes a built-in container-based rollback mechanism, enabling rapid recovery to previous successful build snapshots.

---

## 1. Rollback Mechanism
When a rollback is triggered via `RollbackService.rollback` (POST `/deployments/:id/rollback` or `/deploy/:id/rollback`):
1.  **Retrieve History:** Reads the `DeploymentHistory` table to fetch the target image tag.
2.  **Verify Image:** Confirms a valid historical Docker image exists on the VPS.
3.  **Handoff Execution:**
    *   Stops and removes the currently running container.
    *   Launches a new container utilizing the historical image tag and the correct port mappings.
    *   Updates the Nginx configurations if required.
4.  **Database Sync:** Writes a new record to `DeploymentHistory` and sets the deployment status to `ROLLED_BACK` (updating the current running container reference).

---

## 2. Platform & Source Constraints

### 2.1 GitHub Deployments
*   **Fully Supported:** Only GitHub-based deployments maintain continuous version tagging and image registry histories required for automated rollbacks.

### 2.2 Upload-Based Deployments
*   **Not Supported:** Rollback is disabled for manual file archive uploads. Users are prompted to manually restart the last successful container version instead.

### 2.3 Static Applications
*   **Not Supported:** Static websites (Astro, Vite React, Vue, HTML exports) serve pre-built static assets directly. They do not run active Docker containers, so container rollbacks do not apply.
