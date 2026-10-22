#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=_common.sh
. "$script_dir/_common.sh"

mode=dry-run
config=
inventory=
include_reboot=false
tmpdir=

cleanup_local() {
    [ -z "$tmpdir" ] || rm -rf "$tmpdir"
}
trap cleanup_local EXIT INT TERM

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dry-run) mode=dry-run ;;
        --execute-staging) mode=execute-staging ;;
        --include-reboot) include_reboot=true ;;
        --config) shift; config=${1:-} ;;
        --inventory) shift; inventory=${1:-} ;;
        -h|--help)
            printf 'Usage: phase6 acceptance [--dry-run|--execute-staging] [--include-reboot] [--config FILE] [--inventory FILE]\n'
            exit 0
            ;;
        *) phase6_die "$PHASE6_EXIT_GATE" "Unknown acceptance option: $1" ;;
    esac
    shift
done

phase6_require_command jq
phase6_load_config "$config"
phase6_begin_report acceptance

scenario_json="$PHASE6_REPORT_DIR/scenarios.json"
jq -n \
    --arg domainA "$PHASE6_STAGING_DOMAIN_A" \
    --arg domainB "$PHASE6_STAGING_DOMAIN_B" \
    --argjson reboot "$include_reboot" \
    '{networkAccess:false,remoteMutation:false,scenarios:["gateway bootstrap operation polling","parallel static and server upload deployments","safe Compose deployment with stable dependency","successful redeploy","intentional candidate readiness failure","old-release survival","rollback","real TLS verification","unrelated-site survival"],domains:[$domainA,$domainB],rebootRequested:$reboot}' \
    > "$scenario_json"

if [ "$mode" = dry-run ]; then
    phase6_write_status acceptance "$mode" PLANNED
    cat > "$PHASE6_REPORT_DIR/summary.md" <<EOF
# Phase 6 acceptance dry-run

- API writes: no
- SSH commands: no
- Scenarios: $(jq '.scenarios | length' "$scenario_json")
- Reboot requested: $include_reboot
- Result: planned only
EOF
    phase6_log "Dry-run report: $PHASE6_REPORT_DIR"
    exit 0
fi

[ "${PHASE6_ALLOW_REMOTE:-}" = staging ] \
    || phase6_die "$PHASE6_EXIT_GATE" 'PHASE6_ALLOW_REMOTE=staging is required for staging execution'
phase6_require_command curl
phase6_require_command dig
phase6_require_command tar
phase6_assert_staging_identity
phase6_require_var PHASE6_VPS_ID
[[ "$PHASE6_VPS_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || phase6_die "$PHASE6_EXIT_GATE" 'PHASE6_VPS_ID must be a UUID'
[ -n "$inventory" ] && [ -f "$inventory" ] || phase6_die "$PHASE6_EXIT_GATE" '--inventory from a passed read-only preflight is required'
jq -e --arg host "$PHASE6_STAGING_HOST" --arg ip "$PHASE6_STAGING_IP" \
    '.status == "PASS" and .readOnly == true and .target.host == $host and .target.ip == $ip' "$inventory" >/dev/null \
    || phase6_die "$PHASE6_EXIT_GATE" 'Preflight inventory does not match this staging target'

if [ "$include_reboot" = true ] && [ "${PHASE6_ALLOW_REBOOT:-}" != staging-reboot ]; then
    phase6_die "$PHASE6_EXIT_GATE" 'PHASE6_ALLOW_REBOOT=staging-reboot is required with --include-reboot'
fi

phase6_require_var PHASE6_ACME_EMAIL
tmpdir=$(mktemp -d)
chmod 700 "$tmpdir"

record_failure() {
    phase6_write_status acceptance "$mode" FAILED
}
trap 'record_failure' ERR

poll_operation() {
    local operation_id=$1 attempt response status
    for attempt in $(seq 1 120); do
        response=$(phase6_api GET "/vps/$PHASE6_VPS_ID/operations/$operation_id")
        status=$(jq -r '.data.status // empty' <<<"$response")
        case "$status" in
            SUCCESS) return 0 ;;
            FAILED) phase6_error "Gateway operation failed: $(jq -r '.data.error // "unknown"' <<<"$response")"; return 1 ;;
            QUEUED|RUNNING) sleep 5 ;;
            *) phase6_error "Unexpected gateway operation status: $status"; return 1 ;;
        esac
    done
    phase6_error 'Gateway operation polling timed out'
    return 1
}

poll_deployment() {
    local deployment_id=$1 expected=$2 attempt response status
    for attempt in $(seq 1 180); do
        response=$(phase6_api GET "/deployments/$deployment_id")
        status=$(jq -r '.data.status // empty' <<<"$response")
        if [ "$status" = "$expected" ]; then return 0; fi
        case "$status" in
            FAILED) [ "$expected" = FAILED ] && return 0; phase6_error "Deployment $deployment_id failed"; return 1 ;;
            RUNNING) [ "$expected" = RUNNING ] && return 0 ;;
        esac
        sleep 5
    done
    phase6_error "Deployment $deployment_id did not reach $expected"
    return 1
}

archive_fixture() {
    local name=$1
    tar -C "$script_dir/fixtures/$name" -czf "$tmpdir/$name.tar.gz" .
    printf '%s\n' "$tmpdir/$name.tar.gz"
}

upload_fixture() {
    local fixture=$1 name=$2 domain=$3 tier=$4 project_id=${5:-}
    local archive
    archive=$(archive_fixture "$fixture")
    local -a form=(
        -F "file=@$archive"
        -F "vpsId=$PHASE6_VPS_ID"
        -F "name=$name"
        -F "resourceTier=$tier"
    )
    [ -z "$domain" ] || form+=(-F "domainName=$domain")
    [ -z "$project_id" ] || form+=(-F "projectId=$project_id")
    if [ "$fixture" = compose ]; then
        form+=(-F 'composeService=web' -F 'composePort=3000')
    fi
    phase6_api POST /deploy/upload "${form[@]}"
}

assert_https() {
    local domain=$1
    local code
    code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
        --connect-timeout 5 --max-time 15 "https://$domain/") || return 1
    [[ "$code" =~ ^[23][0-9][0-9]$ ]]
}

bootstrap_response=$(phase6_api POST "/vps/$PHASE6_VPS_ID/bootstrap" \
    -H 'Content-Type: application/json' \
    --data "$(jq -nc --arg email "$PHASE6_ACME_EMAIL" '{email:$email}')")
operation_id=$(jq -r '.data.operationId // empty' <<<"$bootstrap_response")
[ -n "$operation_id" ] || phase6_die "$PHASE6_EXIT_PROBE" 'Gateway bootstrap did not return an operation ID'
poll_operation "$operation_id" || phase6_die "$PHASE6_EXIT_PROBE" 'Gateway bootstrap failed'

# Enqueue the first two deployment types concurrently.
upload_fixture static phase6-static "$PHASE6_STAGING_DOMAIN_A" STATIC > "$tmpdir/static.json" &
static_pid=$!
upload_fixture server phase6-server "$PHASE6_STAGING_DOMAIN_B" SERVER > "$tmpdir/server.json" &
server_pid=$!
wait "$static_pid" || phase6_die "$PHASE6_EXIT_PROBE" 'Static upload request failed'
wait "$server_pid" || phase6_die "$PHASE6_EXIT_PROBE" 'Server upload request failed'

static_id=$(jq -r '.data.id // empty' "$tmpdir/static.json")
server_id=$(jq -r '.data.id // empty' "$tmpdir/server.json")
static_project=$(jq -r '.data.projectId // empty' "$tmpdir/static.json")
[ -n "$static_id" ] && [ -n "$server_id" ] && [ -n "$static_project" ] \
    || phase6_die "$PHASE6_EXIT_PROBE" 'Deployment upload response was incomplete'
poll_deployment "$static_id" RUNNING || phase6_die "$PHASE6_EXIT_PROBE" 'Static deployment failed'
poll_deployment "$server_id" RUNNING || phase6_die "$PHASE6_EXIT_PROBE" 'Server deployment failed'

compose_response=$(upload_fixture compose phase6-compose '' FULLSTACK)
compose_id=$(jq -r '.data.id // empty' <<<"$compose_response")
[ -n "$compose_id" ] || phase6_die "$PHASE6_EXIT_PROBE" 'Compose upload response was incomplete'
poll_deployment "$compose_id" RUNNING || phase6_die "$PHASE6_EXIT_PROBE" 'Compose deployment failed'

# Create a retained previous release, then prove an unhealthy candidate does not replace it.
redeploy_response=$(upload_fixture static phase6-static "$PHASE6_STAGING_DOMAIN_A" STATIC "$static_project")
redeploy_id=$(jq -r '.data.id // empty' <<<"$redeploy_response")
poll_deployment "$redeploy_id" RUNNING || phase6_die "$PHASE6_EXIT_PROBE" 'Static redeploy failed'

failed_response=$(upload_fixture unhealthy phase6-static "$PHASE6_STAGING_DOMAIN_A" SERVER "$static_project")
failed_id=$(jq -r '.data.id // empty' <<<"$failed_response")
poll_deployment "$failed_id" FAILED || phase6_die "$PHASE6_EXIT_PROBE" 'Intentional candidate did not fail as expected'
assert_https "$PHASE6_STAGING_DOMAIN_A" || phase6_die "$PHASE6_EXIT_PROBE" 'Previous static release did not survive candidate failure'
assert_https "$PHASE6_STAGING_DOMAIN_B" || phase6_die "$PHASE6_EXIT_PROBE" 'Unrelated server site became unavailable'

rollback_response=$(phase6_api POST "/deployments/$redeploy_id/rollback" \
    -H 'Content-Type: application/json' --data '{}')
jq -e '.success == true and .data.queued == true' <<<"$rollback_response" >/dev/null \
    || phase6_die "$PHASE6_EXIT_PROBE" 'Rollback was not queued'
rollback_candidate=$(jq -r '.data.candidateReleaseId // empty' <<<"$rollback_response")
[ -n "$rollback_candidate" ] || phase6_die "$PHASE6_EXIT_PROBE" 'Rollback response omitted candidateReleaseId'
rollback_complete=false
for _ in $(seq 1 180); do
    rollback_state=$(phase6_api GET "/deployments/$redeploy_id")
    active_release=$(jq -r '.data.activeRelease.id // empty' <<<"$rollback_state")
    candidate_release=$(jq -r '.data.candidateRelease.id // empty' <<<"$rollback_state")
    if [ "$active_release" = "$rollback_candidate" ] && [ -z "$candidate_release" ]; then
        rollback_complete=true
        break
    fi
    operation_error=$(jq -r '.data.operationError.errorCode // empty' <<<"$rollback_state")
    [ -z "$operation_error" ] || phase6_die "$PHASE6_EXIT_PROBE" "Rollback failed: $operation_error"
    sleep 5
done
[ "$rollback_complete" = true ] || phase6_die "$PHASE6_EXIT_PROBE" 'Rollback candidate was not activated'
assert_https "$PHASE6_STAGING_DOMAIN_A" || phase6_die "$PHASE6_EXIT_PROBE" 'Rolled-back release failed its public probe'

for domain in "$PHASE6_STAGING_DOMAIN_A" "$PHASE6_STAGING_DOMAIN_B"; do
    domain_id=$(phase6_api GET /domain/list | jq -r --arg domain "$domain" '.data[] | select(.domainName == $domain) | .id' | head -n1)
    [ -n "$domain_id" ] || phase6_die "$PHASE6_EXIT_PROBE" "Domain record was not found for $domain"
    phase6_api POST "/domain/ssl/issue/$domain_id" -H 'Content-Type: application/json' --data '{}' >/dev/null
    issued=false
    for _ in $(seq 1 80); do
        ssl_status=$(phase6_api GET /domain/list | jq -r --arg domain "$domain" '.data[] | select(.domainName == $domain) | .sslStatus' | head -n1)
        [ "$ssl_status" = ISSUED ] && { issued=true; break; }
        [ "$ssl_status" = FAILED ] && break
        sleep 5
    done
    [ "$issued" = true ] || phase6_die "$PHASE6_EXIT_PROBE" "TLS was not verified for $domain"
    assert_https "$domain" || phase6_die "$PHASE6_EXIT_PROBE" "HTTPS probe failed for $domain"
done

if [ "$include_reboot" = true ]; then
    mapfile -t ssh_args < <(phase6_ssh_args)
    ssh "${ssh_args[@]}" "$PHASE6_STAGING_USER@$PHASE6_STAGING_HOST" 'sudo /sbin/reboot' || true
    sleep 15
    recovered=false
    for _ in $(seq 1 90); do
        if assert_https "$PHASE6_STAGING_DOMAIN_A" && assert_https "$PHASE6_STAGING_DOMAIN_B"; then recovered=true; break; fi
        sleep 5
    done
    [ "$recovered" = true ] || phase6_die "$PHASE6_EXIT_PROBE" 'Routes did not recover after staging reboot'
fi

jq -n \
    --arg runId "$PHASE6_RUN_ID" \
    --arg staticDeploymentId "$redeploy_id" \
    --arg serverDeploymentId "$server_id" \
    --arg composeDeploymentId "$compose_id" \
    --arg failedCandidateDeploymentId "$failed_id" \
    --argjson rebootTested "$include_reboot" \
    '{runId:$runId,status:"PASS",deployments:{static:$staticDeploymentId,server:$serverDeploymentId,compose:$composeDeploymentId,failedCandidate:$failedCandidateDeploymentId},checks:{oldReleaseSurvived:true,unrelatedSiteSurvived:true,rollback:true,tls:true,reboot:$rebootTested},cleanupPerformed:false}' \
    > "$PHASE6_REPORT_DIR/acceptance.json"
cat > "$PHASE6_REPORT_DIR/summary.md" <<EOF
# Phase 6 staging acceptance

- Static, server and safe Compose: PASS
- Concurrent enqueue: PASS
- Candidate failure isolation: PASS
- Rollback: PASS
- TLS verification: PASS
- Reboot tested: $include_reboot
- Cleanup performed: no
EOF
trap - ERR
phase6_write_status acceptance "$mode" PASS
phase6_log "Staging acceptance passed: $PHASE6_REPORT_DIR"
