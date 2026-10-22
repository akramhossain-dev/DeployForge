#!/usr/bin/env bash

set -euo pipefail

test_dir=$(cd "$(dirname "$0")" && pwd)
phase6_dir=$(cd "$test_dir/.." && pwd)
repo_root=$(cd "$phase6_dir/../.." && pwd)
workdir=$(mktemp -d)

cleanup() { rm -rf "$workdir"; }
trap cleanup EXIT INT TERM

pass_count=0
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { pass_count=$((pass_count + 1)); printf 'PASS: %s\n' "$*"; }

for script in "$phase6_dir"/*.sh "$test_dir"/*.sh; do
    bash -n "$script" || fail "bash syntax: $script"
done
pass 'all Phase 6 scripts pass bash -n'

mock_bin="$workdir/bin"
mkdir -p "$mock_bin"
cat > "$mock_bin/curl" <<'EOF'
#!/usr/bin/env bash
printf 'curl-called\n' >> "${PHASE6_TEST_NETWORK_LOG:?}"
exit 99
EOF
cat > "$mock_bin/ssh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${PHASE6_TEST_SSH_LOG:?}"
case "$*" in
  *"rm "*|*"mkdir "*|*"docker run"*|*reboot*|*systemctl*) exit 88 ;;
esac
cat <<'INVENTORY'
OS_ID=ubuntu
OS_VERSION=24.04
KERNEL=6.8.0
CPU_CORES=4
MEM_TOTAL_KIB=8000000
MEM_AVAILABLE_KIB=4000000
MEM_AVAILABLE_PERCENT=50.00
DISK_TOTAL_KIB=100000000
DISK_AVAILABLE_KIB=50000000
DISK_AVAILABLE_PERCENT=50.00
CLOCK_SYNC=yes
DOCKER_SERVER_VERSION=28.0.0
PORTS_BEGIN
PORTS_END
CONTAINERS_BEGIN
CONTAINERS_END
NETWORKS_BEGIN
bridge|bridge|local
NETWORKS_END
FIREWALL_BEGIN
Status: active
FIREWALL_END
INVENTORY
EOF
cat > "$mock_bin/dig" <<'EOF'
#!/usr/bin/env bash
domain=${*: -1}
case "$domain" in
  staging-a.kerygma-tc.org|staging-b.kerygma-tc.org) printf '%s\n' "${PHASE6_TEST_STAGING_IP:-203.0.113.20}" ;;
  kerygma-tc.org) printf '%s\n' "${PHASE6_TEST_PRODUCTION_IP:-198.51.100.10}" ;;
esac
EOF
chmod 700 "$mock_bin/curl" "$mock_bin/ssh" "$mock_bin/dig"

network_log="$workdir/network.log"
ssh_log="$workdir/ssh.log"
: > "$network_log"
: > "$ssh_log"
export PHASE6_TEST_NETWORK_LOG=$network_log PHASE6_TEST_SSH_LOG=$ssh_log

artifact_root="$workdir/artifacts"
PATH="$mock_bin:$PATH" PHASE6_ARTIFACT_ROOT="$artifact_root" \
    bash "$phase6_dir/preflight.sh" --dry-run >/dev/null
[ ! -s "$network_log" ] || fail 'preflight dry-run attempted network access'
jq -e '.status == "PLANNED"' "$artifact_root"/*/status.json >/dev/null || fail 'preflight dry-run status'
pass 'preflight dry-run is network isolated'

key="$workdir/staging-key"
: > "$key"
chmod 600 "$key"
config="$workdir/phase6.env"
cat > "$config" <<EOF
PHASE6_STAGING_HOST=staging-vps.example.net
PHASE6_STAGING_IP=203.0.113.20
PHASE6_STAGING_USER=root
PHASE6_STAGING_PORT=22
PHASE6_SSH_KEY_PATH=$key
PHASE6_CONFIRM_STAGING_HOST=staging-vps.example.net
PHASE6_STAGING_DOMAIN_A=staging-a.kerygma-tc.org
PHASE6_STAGING_DOMAIN_B=staging-b.kerygma-tc.org
PHASE6_PRODUCTION_DOMAIN=kerygma-tc.org
EOF

PATH="$mock_bin:$PATH" PHASE6_ARTIFACT_ROOT="$artifact_root" \
    bash "$phase6_dir/preflight.sh" --execute-read-only --config "$config" >/dev/null
inventory=$(find "$artifact_root" -name inventory.json -type f | head -n1)
jq -e '.status == "PASS" and .readOnly == true and .ingress.topology == "free"' "$inventory" >/dev/null \
    || fail 'mocked preflight inventory'
[ -s "$ssh_log" ] || fail 'mocked read-only SSH was not called'
pass 'mocked read-only preflight passes and classifies free ingress'

set +e
PATH="$mock_bin:$PATH" PHASE6_TEST_PRODUCTION_IP=203.0.113.20 PHASE6_ARTIFACT_ROOT="$artifact_root" \
    bash "$phase6_dir/preflight.sh" --execute-read-only --config "$config" >/dev/null 2>&1
identity_code=$?
set -e
[ "$identity_code" -eq 2 ] || fail 'production identity guard did not use exit code 2'
pass 'production/staging IP collision is blocked'

: > "$network_log"
PATH="$mock_bin:$PATH" PHASE6_ARTIFACT_ROOT="$artifact_root" \
    bash "$phase6_dir/acceptance.sh" --dry-run --config "$config" >/dev/null
PATH="$mock_bin:$PATH" PHASE6_ARTIFACT_ROOT="$artifact_root" \
    bash "$phase6_dir/soak.sh" --dry-run --config "$config" --duration-seconds 10 >/dev/null
[ ! -s "$network_log" ] || fail 'acceptance/soak dry-run attempted network access'
pass 'acceptance and soak dry-runs are network isolated'

direct_inventory="$workdir/direct.json"
printf '%s\n' '{"ingress":{"topology":"direct-bind"}}' > "$direct_inventory"
set +e
PHASE6_ARTIFACT_ROOT="$artifact_root" bash "$phase6_dir/render-cutover.sh" --inventory "$direct_inventory" >/dev/null 2>&1
direct_code=$?
set -e
[ "$direct_code" -eq 3 ] || fail 'direct-bind topology did not use exit code 3'
blocked=$(find "$artifact_root" -name cutover.json -type f -exec jq -r 'select(.status == "BLOCKED") | .status' {} \; | tail -n1)
[ "$blocked" = BLOCKED ] || fail 'blocked cutover report missing'
pass 'direct-bound ingress is blocked without firewall changes'

external_inventory="$workdir/external.json"
soak="$workdir/soak.json"
active="$workdir/active.conf"
candidate="$workdir/candidate.conf"
printf '%s\n' '{"ingress":{"topology":"external-nginx"}}' > "$external_inventory"
printf '%s\n' '{"status":"PASS","failures":0,"planned5xxAllowance":0}' > "$soak"
printf '%s\n' 'server { listen 443 ssl; }' > "$active"
printf '%s\n' 'server { listen 443 ssl; }' > "$candidate"
cutover_config="$workdir/cutover.env"
cat > "$cutover_config" <<EOF
PHASE6_PRODUCTION_DOMAIN=kerygma-tc.org
PHASE6_PROXY_CONFIG=$active
PHASE6_CANDIDATE_CONFIG=$candidate
PHASE6_API_TOKEN=phase6-super-secret-token
EOF
PHASE6_ARTIFACT_ROOT="$artifact_root" bash "$phase6_dir/render-cutover.sh" \
    --config "$cutover_config" --inventory "$external_inventory" --soak-report "$soak" >/dev/null
ready_plan=$(find "$artifact_root" -name cutover-plan.sh -type f | tail -n1)
[ -f "$ready_plan" ] || fail 'cutover plan was not generated'
bash -n "$ready_plan" || fail 'generated cutover plan has invalid shell syntax'
grep -q 'PHASE6_APPROVE_LIVE_SWITCH' "$ready_plan" || fail 'cutover approval gate missing'
grep -q '72 hours' "$ready_plan" || fail 'rollback window missing'
grep -q "docker network inspect" "$ready_plan" || fail 'candidate internal-network gate missing'
grep -q "127\\\\.0\\\\.0\\\\.1:18080" "$ready_plan" || fail 'candidate loopback HTTP gate missing'
if grep -R -F 'phase6-super-secret-token' "$artifact_root" >/dev/null; then fail 'secret leaked into Phase 6 artifacts'; fi
pass 'external Nginx plan is generated, gated and secret-free'

redacted=$(printf 'Authorization: Bearer secret123 password=hello postgresql://u:p@db/x\n' | bash -c '. "$1"; phase6_redact_stream' _ "$phase6_dir/_common.sh")
case "$redacted" in *secret123*|*'password=hello'*|*'u:p@'*) fail 'redaction helper leaked a secret' ;; esac
pass 'redaction removes bearer, password and database credentials'

if [ "${PHASE6_RUN_DOCKER_E2E:-0}" = 1 ]; then
    bash "$repo_root/scripts/test-phase3-routing.sh"
    pass 'disposable Traefik continuous-probe routing test'
fi

printf 'Phase 6 local tests passed: %s\n' "$pass_count"
