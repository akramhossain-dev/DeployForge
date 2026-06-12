# 🐙 GITHUB_INTEGRATION.md

DeployForge integrates with GitHub to sync codebase repositories, automate builds, and listen for code changes.

---

## 1. Authentication & OAuth Flow
*   Users connect their account via the `/github` initiation route which redirects to GitHub's OAuth authorization page.
*   Upon approval, GitHub callbacks route back to `/auth/github/callback` (or `/github/callback`).
*   DeployForge exchanges the code for a GitHub Access Token, encrypts it using AES-256-GCM, and persists it in the `GitHubAccount` model.

---

## 2. Repository Synchronization
*   Once linked, the `/github/repos` API query returns synced repositories list.
*   DeployForge queries GitHub's REST API `/user/repos` (using the decrypted user token) and updates the local `Repository` records (name, fullName, private status, default branch, clone URL).

---

## 3. Automated Webhook Setup
*   When a user creates a GitHub-sourced deployment and selects **Auto Deploy on Push**, the deployment engine calls GitHub's repository hooks API:
    `POST /repos/{owner}/{repo}/hooks`
*   Registers the public DeployForge API webhook URL:
    `https://<api_url>/webhooks/github`
*   Supplies a unique, secure `GITHUB_WEBHOOK_SECRET` for push events payload validation.

---

## 4. Webhook Event Processing
*   When a push occurs, GitHub hits the `/webhooks/github` endpoint.
*   **Signature Verification:** DeployForge computes the HMAC-SHA256 signature of the incoming request body using the configured `GITHUB_WEBHOOK_SECRET` and matches it against the `X-Hub-Signature-256` header.
*   **Triggering Builds:** If the signature matches, the payload is parsed, written to the `WebhookEvent` table, and a deployment job is scheduled via BullMQ to fetch, rebuild, and roll out the new commit.
