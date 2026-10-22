# Phase 6 Migration Automation Runbook

Phase 6 prepares a future staging validation and production migration. Creating and locally testing these artifacts does **not** contact a VPS, modify DNS, deploy a site, reboot a server, switch traffic, or delete legacy resources.

## Safety contract

- Every operational command defaults to `--dry-run`.
- Read-only discovery requires `preflight --execute-read-only`.
- Staging writes require `PHASE6_ALLOW_REMOTE=staging` and an exact `PHASE6_CONFIRM_STAGING_HOST` match.
- A staging IP that matches `kerygma-tc.org` is rejected before SSH or API writes.
- A staging reboot additionally requires `PHASE6_ALLOW_REBOOT=staging-reboot` and `--include-reboot`.
- The cutover command only renders a reviewable script. It never runs the script.
- Direct-bound port 80/443, unknown ingress and unsupported proxy topology return exit code `3`; no firewall or nftables rule is generated.
- No Phase 6 command automatically deletes containers, networks, certificates, routes or rollback files.

Exit codes are stable: `0` pass, `2` gate/configuration failure, `3` unsafe topology, and `4` probe/acceptance failure.

## Configuration

Copy `.env.phase6.example` to a secure path outside the repository, restrict it to the operator, and use a short-lived DeployForge token. Do not commit the populated file.

The default real-TLS names are:

- `staging-a.kerygma-tc.org`
- `staging-b.kerygma-tc.org`

Both A records must point to the fresh staging VPS. The production domain must resolve to a different address. Ubuntu 22.04/24.04, Docker, at least 20% available RAM and 15% available root disk are mandatory.

## Local-only validation

```bash
pnpm phase6 -- preflight --dry-run --config /secure/phase6.env
pnpm phase6 -- acceptance --dry-run --config /secure/phase6.env
pnpm phase6 -- soak --dry-run --config /secure/phase6.env
pnpm phase6:test

# Optional disposable local Docker/Traefik availability test:
PHASE6_RUN_DOCKER_E2E=1 pnpm phase6:test
```

Artifacts are written under `.phase6-artifacts/<UTC-run-id>/`, use mode `0700` where supported, and are ignored by Git. Tokens and credentials are redacted or omitted.

## Future staging sequence

1. Run read-only preflight and review `inventory.json`:

   ```bash
   pnpm phase6 -- preflight --execute-read-only --config /secure/phase6.env
   ```

2. Set the two explicit staging confirmations, then run acceptance with the passing inventory:

   ```bash
   export PHASE6_ALLOW_REMOTE=staging
   export PHASE6_CONFIRM_STAGING_HOST=staging-vps.example.net
   pnpm phase6 -- acceptance --execute-staging \
     --config /secure/phase6.env \
     --inventory .phase6-artifacts/<preflight-run>/inventory.json
   ```

   This polls the queued gateway bootstrap, concurrently deploys static and server fixtures, deploys a safe Compose fixture with a stable Redis dependency, creates a retained release, injects an unhealthy candidate, checks old/unrelated site survival, performs rollback, and validates real TLS. It leaves all staging evidence in place.

3. Reboot testing is staging-only and separately gated:

   ```bash
   export PHASE6_ALLOW_REBOOT=staging-reboot
   pnpm phase6 -- acceptance --execute-staging --include-reboot \
     --config /secure/phase6.env \
     --inventory .phase6-artifacts/<preflight-run>/inventory.json
   ```

4. Start the 24-hour soak using the passing `acceptance.json`:

   ```bash
   pnpm phase6 -- soak --execute-staging \
     --config /secure/phase6.env \
     --acceptance .phase6-artifacts/<acceptance-run>/acceptance.json
   ```

   HTTP/TLS probes run every second and operational snapshots every minute. Any untrusted/incorrect/near-expiry certificate, non-2xx/3xx response, reserve violation, or queue continuously non-empty for 15 minutes fails the run. Planned `000/5xx` allowance is zero.

## Future live cutover review

Only a successful soak and a validated external Nginx front proxy can produce a cutover plan:

```bash
pnpm phase6 -- render-cutover \
  --config /secure/phase6.env \
  --inventory /secure/live-read-only-inventory.json \
  --soak-report .phase6-artifacts/<soak-run>/soak.json
```

The generated `cutover-plan.sh` requires a host-managed Nginx front proxy, verifies that both candidate ports are loopback-only, verifies the candidate Docker network is internal, probes candidate HTTP/HTTPS, backs up the active Nginx route, atomically installs the reviewed candidate config, runs `nginx -t`, reloads, performs the public probe, and restores the old config on failure. Containerized or otherwise unsupported proxies remain blocked. Execution requires an exact run-specific `PHASE6_APPROVE_LIVE_SWITCH` value shown in the generated plan.

Do not execute it until the staging report has been reviewed and the user has explicitly approved the exact live switch. Keep the rollback config and legacy resources for at least 72 hours. Cleanup remains a separate, exact-scope approval.

## Acceptance evidence

The operator must retain the redacted preflight inventory, acceptance report, probe TSV, TLS JSONL, operational snapshots, soak summary, generated cutover/rollback plan, and explicit approval record. A plan or dry-run is not evidence that staging or production passed.
