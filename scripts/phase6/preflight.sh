#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=_common.sh
. "$script_dir/_common.sh"

mode=dry-run
config=

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dry-run) mode=dry-run ;;
        --execute-read-only) mode=execute-read-only ;;
        --config) shift; config=${1:-} ;;
        -h|--help)
            printf 'Usage: phase6 preflight [--dry-run|--execute-read-only] [--config FILE]\n'
            exit 0
            ;;
        *) phase6_die "$PHASE6_EXIT_GATE" "Unknown preflight option: $1" ;;
    esac
    shift
done

phase6_require_command jq
phase6_load_config "$config"
phase6_begin_report preflight

if [ "$mode" = dry-run ]; then
    phase6_write_status preflight "$mode" PLANNED
    jq -n \
        --arg domainA "$PHASE6_STAGING_DOMAIN_A" \
        --arg domainB "$PHASE6_STAGING_DOMAIN_B" \
        --arg productionDomain "$PHASE6_PRODUCTION_DOMAIN" \
        '{mode:"dry-run",networkAccess:false,checks:["staging identity guard","DNS A records","SSH host key verification","Ubuntu release","Docker version","CPU/RAM/disk reserve","clock synchronization","firewall summary","port ownership","managed containers and networks","ingress topology"],domains:{staging:[$domainA,$domainB],production:$productionDomain}}' \
        > "$PHASE6_REPORT_DIR/preflight-plan.json"
    cat > "$PHASE6_REPORT_DIR/summary.md" <<EOF
# Phase 6 preflight dry-run

- Network access: no
- Remote mutation: no
- Staging domains: $PHASE6_STAGING_DOMAIN_A, $PHASE6_STAGING_DOMAIN_B
- Production exclusion: $PHASE6_PRODUCTION_DOMAIN
- Result: planned only
EOF
    phase6_log "Dry-run report: $PHASE6_REPORT_DIR"
    exit 0
fi

phase6_require_command dig
phase6_require_command ssh
phase6_assert_staging_identity
[[ "$PHASE6_STAGING_USER" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || phase6_die "$PHASE6_EXIT_GATE" 'Unsafe PHASE6_STAGING_USER'
[[ "$PHASE6_STAGING_PORT" =~ ^[0-9]+$ ]] || phase6_die "$PHASE6_EXIT_GATE" 'Invalid PHASE6_STAGING_PORT'
[[ "$PHASE6_STAGING_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || phase6_die "$PHASE6_EXIT_GATE" 'Unsafe PHASE6_STAGING_HOST'

mapfile -t ssh_args < <(phase6_ssh_args)
remote_inventory="$PHASE6_REPORT_DIR/remote-inventory.txt"
remote_script='set -eu
printf "OS_ID="; . /etc/os-release; printf "%s\n" "${ID:-unknown}"
printf "OS_VERSION="; . /etc/os-release; printf "%s\n" "${VERSION_ID:-unknown}"
printf "KERNEL=%s\n" "$(uname -r)"
printf "CPU_CORES=%s\n" "$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc)"
awk "/MemTotal:/ { total=\$2 } /MemAvailable:/ { available=\$2 } END { printf \"MEM_TOTAL_KIB=%d\\nMEM_AVAILABLE_KIB=%d\\nMEM_AVAILABLE_PERCENT=%.2f\\n\", total, available, total ? available*100/total : 0 }" /proc/meminfo
df -Pk / | awk "NR==2 { printf \"DISK_TOTAL_KIB=%s\\nDISK_AVAILABLE_KIB=%s\\nDISK_AVAILABLE_PERCENT=%.2f\\n\", \$2, \$4, \$2 ? \$4*100/\$2 : 0 }"
printf "CLOCK_SYNC="; (timedatectl show -p NTPSynchronized --value 2>/dev/null || printf unknown); printf "\n"
printf "DOCKER_SERVER_VERSION="; (docker version --format "{{.Server.Version}}" 2>/dev/null || printf unavailable); printf "\n"
printf "%s\n" PORTS_BEGIN
(ss -H -ltnp 2>/dev/null || true)
printf "%s\n" PORTS_END CONTAINERS_BEGIN
(docker ps --format "{{.Names}}|{{.Image}}|{{.Ports}}" 2>/dev/null || true)
printf "%s\n" CONTAINERS_END NETWORKS_BEGIN
(docker network ls --format "{{.Name}}|{{.Driver}}|{{.Scope}}" 2>/dev/null || true)
printf "%s\n" NETWORKS_END FIREWALL_BEGIN
(ufw status 2>/dev/null || firewall-cmd --state 2>/dev/null || printf unavailable)
printf "\n%s\n" FIREWALL_END'

ssh "${ssh_args[@]}" "$PHASE6_STAGING_USER@$PHASE6_STAGING_HOST" "$remote_script" \
    | phase6_redact_stream > "$remote_inventory"

os_id=$(sed -n 's/^OS_ID=//p' "$remote_inventory" | head -n1)
os_version=$(sed -n 's/^OS_VERSION=//p' "$remote_inventory" | head -n1)
docker_version=$(sed -n 's/^DOCKER_SERVER_VERSION=//p' "$remote_inventory" | head -n1)
memory_percent=$(sed -n 's/^MEM_AVAILABLE_PERCENT=//p' "$remote_inventory" | head -n1)
disk_percent=$(sed -n 's/^DISK_AVAILABLE_PERCENT=//p' "$remote_inventory" | head -n1)

[ "$os_id" = ubuntu ] && { [ "$os_version" = 22.04 ] || [ "$os_version" = 24.04 ]; } \
    || phase6_die "$PHASE6_EXIT_GATE" "Unsupported staging OS: $os_id $os_version"
[ -n "$docker_version" ] && [ "$docker_version" != unavailable ] \
    || phase6_die "$PHASE6_EXIT_GATE" 'Docker server is unavailable on staging'
awk -v n="$memory_percent" 'BEGIN { exit !(n >= 20) }' \
    || phase6_die "$PHASE6_EXIT_GATE" "Staging RAM reserve is below 20%: $memory_percent%"
awk -v n="$disk_percent" 'BEGIN { exit !(n >= 15) }' \
    || phase6_die "$PHASE6_EXIT_GATE" "Staging disk reserve is below 15%: $disk_percent%"

ports=$(sed -n '/^PORTS_BEGIN$/,/^PORTS_END$/p' "$remote_inventory" | sed '1d;$d')
containers=$(sed -n '/^CONTAINERS_BEGIN$/,/^CONTAINERS_END$/p' "$remote_inventory" | sed '1d;$d')
topology=unknown
if ! printf '%s\n' "$ports" | grep -Eq '(^|[[:space:]:])(80|443)([[:space:]]|$)'; then
    topology=free
elif printf '%s\n' "$containers" | grep -E '^deployforge-traefik\|' | grep -Eq '(^|:)(80|443)->'; then
    topology=direct-bind
elif printf '%s\n' "$ports" | grep -qi 'users:.*nginx'; then
    topology=external-nginx
elif printf '%s\n' "$ports" | grep -qi 'users:.*traefik'; then
    topology=external-traefik
fi

jq -n \
    --arg runId "$PHASE6_RUN_ID" \
    --arg host "$PHASE6_STAGING_HOST" \
    --arg ip "$PHASE6_STAGING_IP" \
    --arg os "$os_id" \
    --arg osVersion "$os_version" \
    --arg dockerVersion "$docker_version" \
    --arg topology "$topology" \
    --argjson memoryAvailablePercent "$memory_percent" \
    --argjson diskAvailablePercent "$disk_percent" \
    '{runId:$runId,target:{host:$host,ip:$ip},os:{id:$os,version:$osVersion},docker:{serverVersion:$dockerVersion},capacity:{memoryAvailablePercent:$memoryAvailablePercent,diskAvailablePercent:$diskAvailablePercent},ingress:{topology:$topology},readOnly:true,status:"PASS"}' \
    > "$PHASE6_REPORT_DIR/inventory.json"

cat > "$PHASE6_REPORT_DIR/summary.md" <<EOF
# Phase 6 staging preflight

- Target: $PHASE6_STAGING_HOST ($PHASE6_STAGING_IP)
- OS: $os_id $os_version
- Docker: $docker_version
- RAM available: $memory_percent%
- Disk available: $disk_percent%
- Ingress topology: $topology
- Remote mutation: no
- Result: PASS
EOF
phase6_write_status preflight "$mode" PASS
phase6_log "Read-only preflight passed: $PHASE6_REPORT_DIR"
