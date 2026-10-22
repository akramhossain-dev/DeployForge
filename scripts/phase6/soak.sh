#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=_common.sh
. "$script_dir/_common.sh"

mode=dry-run
config=
acceptance=
duration=86400
probe_interval=1
snapshot_interval=60

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dry-run) mode=dry-run ;;
        --execute-staging) mode=execute-staging ;;
        --config) shift; config=${1:-} ;;
        --acceptance) shift; acceptance=${1:-} ;;
        --duration-seconds) shift; duration=${1:-} ;;
        --probe-interval) shift; probe_interval=${1:-} ;;
        --snapshot-interval) shift; snapshot_interval=${1:-} ;;
        -h|--help)
            printf 'Usage: phase6 soak [--dry-run|--execute-staging] [--config FILE] [--acceptance FILE] [--duration-seconds N]\n'
            exit 0
            ;;
        *) phase6_die "$PHASE6_EXIT_GATE" "Unknown soak option: $1" ;;
    esac
    shift
done

for value in "$duration" "$probe_interval" "$snapshot_interval"; do
    [[ "$value" =~ ^[1-9][0-9]*$ ]] || phase6_die "$PHASE6_EXIT_GATE" 'Soak durations must be positive integers'
done

phase6_require_command jq
phase6_load_config "$config"
phase6_begin_report soak

if [ "$mode" = dry-run ]; then
    phase6_write_status soak "$mode" PLANNED
    jq -n \
        --argjson duration "$duration" \
        --argjson probeInterval "$probe_interval" \
        --argjson snapshotInterval "$snapshot_interval" \
        --arg domainA "$PHASE6_STAGING_DOMAIN_A" \
        --arg domainB "$PHASE6_STAGING_DOMAIN_B" \
        '{mode:"dry-run",networkAccess:false,durationSeconds:$duration,probeIntervalSeconds:$probeInterval,snapshotIntervalSeconds:$snapshotInterval,domains:[$domainA,$domainB],checks:["HTTP status","trusted TLS hostname and chain","gateway state","queue depth","release and TLS states","capacity reservations","cleanup failures","staging RAM and disk reserves"]}' \
        > "$PHASE6_REPORT_DIR/soak-plan.json"
    printf '# Phase 6 soak dry-run\n\n- Duration: %s seconds\n- Network access: no\n- Result: planned only\n' "$duration" > "$PHASE6_REPORT_DIR/summary.md"
    phase6_log "Dry-run report: $PHASE6_REPORT_DIR"
    exit 0
fi

[ "${PHASE6_ALLOW_REMOTE:-}" = staging ] \
    || phase6_die "$PHASE6_EXIT_GATE" 'PHASE6_ALLOW_REMOTE=staging is required for staging soak'
phase6_require_command curl
phase6_require_command dig
phase6_require_command openssl
phase6_require_command ssh
phase6_assert_staging_identity
phase6_require_var PHASE6_API_URL
phase6_require_var PHASE6_API_TOKEN
phase6_require_var PHASE6_METRICS_TOKEN
phase6_require_var PHASE6_VPS_ID
[ -n "$acceptance" ] && [ -f "$acceptance" ] || phase6_die "$PHASE6_EXIT_GATE" '--acceptance from a passed staging acceptance run is required'
jq -e '.status == "PASS" and .checks.oldReleaseSurvived == true and .checks.rollback == true and .checks.tls == true' "$acceptance" >/dev/null \
    || phase6_die "$PHASE6_EXIT_GATE" 'Acceptance report is incomplete or failed'

mapfile -t ssh_args < <(phase6_ssh_args)
probe_log="$PHASE6_REPORT_DIR/probes.tsv"
snapshot_log="$PHASE6_REPORT_DIR/snapshots.jsonl"
tls_log="$PHASE6_REPORT_DIR/tls.jsonl"
printf 'timestamp\tdomain\thttp_code\ttotal_seconds\n' > "$probe_log"
: > "$snapshot_log"
: > "$tls_log"

failures=0
probe_count=0
snapshot_count=0
queue_nonempty_since=0
max_queue_nonempty=0
cleanup_failure_baseline=-1
started_epoch=$(date +%s)
deadline=$((started_epoch + duration))
next_snapshot=$started_epoch

capture_tls() {
    local domain=$1 cert subject issuer not_after
    cert=$(timeout 15 openssl s_client -connect "$domain:443" -servername "$domain" -verify_return_error </dev/null 2>/dev/null) || return 1
    subject=$(openssl x509 -noout -subject <<<"$cert" | sed 's/^subject=//')
    issuer=$(openssl x509 -noout -issuer <<<"$cert" | sed 's/^issuer=//')
    not_after=$(openssl x509 -noout -enddate <<<"$cert" | sed 's/^notAfter=//')
    openssl x509 -noout -checkhost "$domain" <<<"$cert" >/dev/null || return 1
    openssl x509 -noout -checkend 86400 <<<"$cert" >/dev/null || return 1
    jq -nc --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg domain "$domain" --arg subject "$subject" --arg issuer "$issuer" --arg expiresAt "$not_after" \
        '{timestamp:$timestamp,domain:$domain,subject:$subject,issuer:$issuer,expiresAt:$expiresAt,valid:true}' >> "$tls_log"
}

for domain in "$PHASE6_STAGING_DOMAIN_A" "$PHASE6_STAGING_DOMAIN_B"; do
    capture_tls "$domain" || phase6_die "$PHASE6_EXIT_PROBE" "Initial TLS verification failed for $domain"
done

while [ "$(date +%s)" -lt "$deadline" ]; do
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    for domain in "$PHASE6_STAGING_DOMAIN_A" "$PHASE6_STAGING_DOMAIN_B"; do
        result=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}\t%{time_total}' \
            --connect-timeout 5 --max-time 15 "https://$domain/" 2>/dev/null || printf '000\t0')
        code=${result%%$'\t'*}
        printf '%s\t%s\t%s\n' "$timestamp" "$domain" "$result" >> "$probe_log"
        probe_count=$((probe_count + 1))
        [[ "$code" =~ ^[23][0-9][0-9]$ ]] || failures=$((failures + 1))
    done

    now=$(date +%s)
    if [ "$now" -ge "$next_snapshot" ]; then
        app_metrics=$(curl --fail-with-body --silent --show-error --connect-timeout 5 --max-time 20 \
            -H "Authorization: Bearer $PHASE6_METRICS_TOKEN" "${PHASE6_API_URL%/}/metrics") \
            || phase6_die "$PHASE6_EXIT_PROBE" 'Protected metrics snapshot failed'
        vps_metrics=$(phase6_api GET "/monitor/metrics/$PHASE6_VPS_ID") \
            || phase6_die "$PHASE6_EXIT_PROBE" 'VPS metrics snapshot failed'
        vps_state=$(phase6_api GET /vps) \
            || phase6_die "$PHASE6_EXIT_PROBE" 'VPS state snapshot failed'
        gateway_status=$(jq -r --arg id "$PHASE6_VPS_ID" '.data[]? | select(.id == $id) | .gatewayStatus' <<<"$vps_state" | head -n1)
        [ "$gateway_status" = READY ] || failures=$((failures + 1))
        reserve=$(ssh "${ssh_args[@]}" "$PHASE6_STAGING_USER@$PHASE6_STAGING_HOST" \
            'awk "/MemTotal:/ {t=\$2} /MemAvailable:/ {a=\$2} END {printf \"%.2f \",t?a*100/t:0}" /proc/meminfo; df -Pk / | awk "NR==2 {printf \"%.2f\",\$2?\$4*100/\$2:0}"')
        memory_percent=${reserve%% *}
        disk_percent=${reserve##* }
        awk -v n="$memory_percent" 'BEGIN { exit !(n >= 20) }' || failures=$((failures + 1))
        awk -v n="$disk_percent" 'BEGIN { exit !(n >= 15) }' || failures=$((failures + 1))

        queue_total=$(jq '[.operations.queues[]? | (.waiting + .active + .delayed)] | add // 0' <<<"$app_metrics")
        cleanup_failures=$(jq '.operations.cleanupFailures // 0' <<<"$app_metrics")
        if [ "$cleanup_failure_baseline" -lt 0 ]; then
            cleanup_failure_baseline=$cleanup_failures
        elif [ "$cleanup_failures" -gt "$cleanup_failure_baseline" ]; then
            failures=$((failures + 1))
        fi
        if [ "$queue_total" -gt 0 ]; then
            [ "$queue_nonempty_since" -ne 0 ] || queue_nonempty_since=$now
            queue_age=$((now - queue_nonempty_since))
            [ "$queue_age" -le "$max_queue_nonempty" ] || max_queue_nonempty=$queue_age
            [ "$queue_age" -lt 900 ] || failures=$((failures + 1))
        else
            queue_nonempty_since=0
        fi

        jq -nc \
            --arg timestamp "$timestamp" \
            --argjson application "$app_metrics" \
            --argjson vps "$vps_metrics" \
            --arg gatewayStatus "$gateway_status" \
            --argjson memoryAvailablePercent "$memory_percent" \
            --argjson diskAvailablePercent "$disk_percent" \
            '{timestamp:$timestamp,application:$application,vps:$vps,gatewayStatus:$gatewayStatus,capacity:{memoryAvailablePercent:$memoryAvailablePercent,diskAvailablePercent:$diskAvailablePercent}}' \
            | phase6_redact_stream >> "$snapshot_log"
        snapshot_count=$((snapshot_count + 1))
        next_snapshot=$((now + snapshot_interval))
    fi
    sleep "$probe_interval"
done

for domain in "$PHASE6_STAGING_DOMAIN_A" "$PHASE6_STAGING_DOMAIN_B"; do
    capture_tls "$domain" || failures=$((failures + 1))
done

status=PASS
[ "$failures" -eq 0 ] || status=FAILED
jq -n \
    --arg runId "$PHASE6_RUN_ID" \
    --arg status "$status" \
    --argjson durationSeconds "$duration" \
    --argjson probeCount "$probe_count" \
    --argjson snapshotCount "$snapshot_count" \
    --argjson failures "$failures" \
    --argjson maximumQueueNonemptySeconds "$max_queue_nonempty" \
    '{runId:$runId,status:$status,durationSeconds:$durationSeconds,probeCount:$probeCount,snapshotCount:$snapshotCount,failures:$failures,maximumQueueNonemptySeconds:$maximumQueueNonemptySeconds,planned5xxAllowance:0}' \
    > "$PHASE6_REPORT_DIR/soak.json"
cat > "$PHASE6_REPORT_DIR/summary.md" <<EOF
# Phase 6 soak result

- Status: $status
- Duration: $duration seconds
- HTTP/TLS probes: $probe_count
- Operational snapshots: $snapshot_count
- Failures: $failures
- Longest non-empty queue window: $max_queue_nonempty seconds
EOF
phase6_write_status soak "$mode" "$status"
[ "$status" = PASS ] || phase6_die "$PHASE6_EXIT_PROBE" "Soak failed with $failures acceptance violations"
phase6_log "Staging soak passed: $PHASE6_REPORT_DIR"
