#!/usr/bin/env bash
set -euo pipefail

network=df-phase4-resource-test-net
control=df-phase4-resource-control
noisy=df-phase4-resource-noisy

cleanup() {
  docker rm -f "$control" "$noisy" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

docker network create --label com.deployforge.managed=true --label com.deployforge.project=df-phase4-test "$network" >/dev/null
docker run -d --name "$control" --network "$network" \
  --cpus 0.250 --memory 256m --memory-swap 256m --pids-limit 128 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=10 \
  --security-opt no-new-privileges --label com.deployforge.managed=true \
  nginx:1.27-alpine >/dev/null

read -r nano memory pids log_size log_files < <(docker inspect -f '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}} {{index .HostConfig.LogConfig.Config "max-size"}} {{index .HostConfig.LogConfig.Config "max-file"}}' "$control")
test "$nano" = 250000000
test "$memory" = 268435456
test "$pids" = 128
test "$log_size" = 10m
test "$log_files" = 10

docker run -d --name "$noisy" --network "$network" \
  --cpus 0.100 --memory 64m --memory-swap 64m --pids-limit 32 \
  --security-opt no-new-privileges --cap-drop ALL \
  nginx:1.27-alpine sh -c 'while :; do yes >/dev/null 2>&1 & done' >/dev/null

for _ in $(seq 1 10); do
  if docker exec "$control" wget -qO- http://127.0.0.1/ >/dev/null 2>&1; then
    echo 'phase4 resource isolation: PASS'
    exit 0
  fi
  sleep 1
done

echo 'control container became unhealthy during noisy tenant test' >&2
exit 1
