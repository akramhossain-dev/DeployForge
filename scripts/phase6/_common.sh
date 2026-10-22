#!/usr/bin/env bash

set -euo pipefail

PHASE6_EXIT_GATE=2
PHASE6_EXIT_TOPOLOGY=3
PHASE6_EXIT_PROBE=4

PHASE6_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PHASE6_REPO_ROOT=$(cd "$PHASE6_SCRIPT_DIR/../.." && pwd)
PHASE6_ARTIFACT_ROOT=${PHASE6_ARTIFACT_ROOT:-"$PHASE6_REPO_ROOT/.phase6-artifacts"}

phase6_log() {
    printf '[phase6] %s\n' "$*"
}

phase6_error() {
    printf '[phase6] ERROR: %s\n' "$*" >&2
}

phase6_die() {
    local code=$1
    shift
    phase6_error "$*"
    exit "$code"
}

phase6_require_command() {
    command -v "$1" >/dev/null 2>&1 || phase6_die "$PHASE6_EXIT_GATE" "Required command is unavailable: $1"
}

phase6_require_var() {
    local name=$1
    [ -n "${!name:-}" ] || phase6_die "$PHASE6_EXIT_GATE" "Required configuration is missing: $name"
}

phase6_load_config() {
    local config=${1:-}
    if [ -n "$config" ]; then
        [ -f "$config" ] || phase6_die "$PHASE6_EXIT_GATE" "Configuration file not found: $config"
        # The operator supplies this trusted file. It must not come from an untrusted source.
        set -a
        # shellcheck disable=SC1090
        . "$config"
        set +a
    fi
    : "${PHASE6_STAGING_DOMAIN_A:=staging-a.kerygma-tc.org}"
    : "${PHASE6_STAGING_DOMAIN_B:=staging-b.kerygma-tc.org}"
    : "${PHASE6_PRODUCTION_DOMAIN:=kerygma-tc.org}"
    : "${PHASE6_STAGING_PORT:=22}"
    : "${PHASE6_STAGING_USER:=root}"
    : "${PHASE6_CANDIDATE_HTTP_PORT:=18080}"
    : "${PHASE6_CANDIDATE_HTTPS_PORT:=18443}"
    : "${PHASE6_CANDIDATE_NETWORK:=deployforge-phase6-validation}"
}

phase6_begin_report() {
    local command_name=$1
    local requested_run_id=${PHASE6_RUN_ID:-}
    if [ -n "$requested_run_id" ]; then
        [[ "$requested_run_id" =~ ^[A-Za-z0-9._-]+$ ]] || phase6_die "$PHASE6_EXIT_GATE" 'PHASE6_RUN_ID contains unsafe characters'
        PHASE6_RUN_ID=$requested_run_id
    else
        PHASE6_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${command_name}-$$"
    fi
    PHASE6_REPORT_DIR="$PHASE6_ARTIFACT_ROOT/$PHASE6_RUN_ID"
    mkdir -p "$PHASE6_REPORT_DIR"
    chmod 700 "$PHASE6_ARTIFACT_ROOT" "$PHASE6_REPORT_DIR" 2>/dev/null || true
    export PHASE6_RUN_ID PHASE6_REPORT_DIR
}

phase6_redact_stream() {
    sed -E \
        -e 's/(Authorization:[[:space:]]*Bearer)[[:space:]]+[^[:space:]]+/\1 [REDACTED]/Ig' \
        -e 's/(PHASE6_API_TOKEN|token|password|private[_-]?key)(["= :]+)[^",[:space:]]+/\1\2[REDACTED]/Ig' \
        -e 's#(redis|postgres(ql)?|mysql)://[^/@:]+:[^/@]+@#\1://[REDACTED]@#Ig'
}

phase6_resolve_addresses() {
    {
        dig +short A "$1" 2>/dev/null
        dig +short AAAA "$1" 2>/dev/null
    } | awk '/^[0-9a-fA-F:.]+$/ { print }' | sort -u
}

phase6_assert_staging_identity() {
    phase6_require_var PHASE6_STAGING_HOST
    phase6_require_var PHASE6_STAGING_IP
    [ "$PHASE6_STAGING_HOST" != "$PHASE6_PRODUCTION_DOMAIN" ] || phase6_die "$PHASE6_EXIT_GATE" 'Staging host matches the production domain'
    [ "${PHASE6_CONFIRM_STAGING_HOST:-}" = "$PHASE6_STAGING_HOST" ] || phase6_die "$PHASE6_EXIT_GATE" 'PHASE6_CONFIRM_STAGING_HOST must exactly match PHASE6_STAGING_HOST'

    local staging_a staging_b production
    staging_a=$(phase6_resolve_addresses "$PHASE6_STAGING_DOMAIN_A")
    staging_b=$(phase6_resolve_addresses "$PHASE6_STAGING_DOMAIN_B")
    production=$(phase6_resolve_addresses "$PHASE6_PRODUCTION_DOMAIN")
    [ -n "$staging_a" ] && [ -n "$staging_b" ] || phase6_die "$PHASE6_EXIT_GATE" 'Both staging domains must resolve before remote execution'
    printf '%s\n' "$staging_a" | grep -Fxq "$PHASE6_STAGING_IP" || phase6_die "$PHASE6_EXIT_GATE" "$PHASE6_STAGING_DOMAIN_A does not resolve to PHASE6_STAGING_IP"
    printf '%s\n' "$staging_b" | grep -Fxq "$PHASE6_STAGING_IP" || phase6_die "$PHASE6_EXIT_GATE" "$PHASE6_STAGING_DOMAIN_B does not resolve to PHASE6_STAGING_IP"
    if printf '%s\n' "$production" | grep -Fxq "$PHASE6_STAGING_IP"; then
        phase6_die "$PHASE6_EXIT_GATE" 'Staging IP matches a production-domain address'
    fi
}

phase6_ssh_args() {
    phase6_require_var PHASE6_SSH_KEY_PATH
    [ -f "$PHASE6_SSH_KEY_PATH" ] || phase6_die "$PHASE6_EXIT_GATE" 'Staging SSH key does not exist'
    printf '%s\n' \
        -i "$PHASE6_SSH_KEY_PATH" \
        -p "$PHASE6_STAGING_PORT" \
        -o BatchMode=yes \
        -o ConnectTimeout=10 \
        -o StrictHostKeyChecking=yes
}

phase6_api() {
    local method=$1
    local path=$2
    shift 2
    phase6_require_var PHASE6_API_URL
    phase6_require_var PHASE6_API_TOKEN
    curl --fail-with-body --silent --show-error \
        --connect-timeout 10 --max-time 120 \
        -X "$method" \
        -H "Authorization: Bearer $PHASE6_API_TOKEN" \
        -H 'Accept: application/json' \
        "$@" \
        "${PHASE6_API_URL%/}$path"
}

phase6_write_status() {
    local command_name=$1 mode=$2 status=$3
    jq -n \
        --arg runId "$PHASE6_RUN_ID" \
        --arg command "$command_name" \
        --arg mode "$mode" \
        --arg status "$status" \
        --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{runId:$runId,command:$command,mode:$mode,status:$status,generatedAt:$generatedAt}' \
        > "$PHASE6_REPORT_DIR/status.json"
}
