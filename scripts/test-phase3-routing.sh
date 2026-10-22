#!/usr/bin/env sh
set -eu

network=df-phase3-e2e
gateway=df-phase3-traefik
old=df-phase3-old
candidate=df-phase3-candidate
port=18080
workdir=$(mktemp -d)
probe_log="$workdir/probe.log"

cleanup() {
  [ -n "${probe_pid:-}" ] && kill "$probe_pid" 2>/dev/null || true
  docker rm -f "$gateway" "$old" "$candidate" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT INT TERM

docker network create "$network" >/dev/null
docker run -d --name "$old" --network "$network" --network-alias old nginx:1.27-alpine >/dev/null
docker run -d --name "$candidate" --network "$network" --network-alias candidate nginx:1.27-alpine >/dev/null

write_route() {
  backend=$1
  temp="$workdir/dynamic/route.yml.tmp"
  printf '%s\n' \
    'http:' \
    '  routers:' \
    '    site:' \
    '      rule: "Host(`app.test`)"' \
    '      entryPoints: [web]' \
    '      service: site' \
    '  services:' \
    '    site:' \
    '      loadBalancer:' \
    '        servers:' \
    "          - url: \"http://$backend:80\"" > "$temp"
  mv "$temp" "$workdir/dynamic/route.yml"
}

mkdir -p "$workdir/dynamic"
write_route old
docker run -d --name "$gateway" --network "$network" -p "127.0.0.1:$port:80" \
  -v "$workdir/dynamic:/dynamic:ro" traefik:v3.6 \
  --providers.file.directory=/dynamic --providers.file.watch=true --entrypoints.web.address=:80 >/dev/null

for _ in $(seq 1 50); do
  if curl -fsS -H 'Host: app.test' "http://127.0.0.1:$port/" >/dev/null; then break; fi
  sleep 0.1
done

(
  while :; do
    curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: app.test' "http://127.0.0.1:$port/" >> "$probe_log" || printf '000\n' >> "$probe_log"
    sleep 0.05
  done
) &
probe_pid=$!

for _ in $(seq 1 30); do
  write_route candidate
  sleep 0.1
  write_route old
  sleep 0.1
done
for _ in $(seq 1 10); do
  write_route candidate
  sleep 0.1
  write_route old
  sleep 0.1
done

kill "$probe_pid" 2>/dev/null || true
probe_pid=
if grep -Eq '^(000|5[0-9][0-9])$' "$probe_log"; then
  echo 'Phase 3 routing availability test failed'
  sort "$probe_log" | uniq -c
  exit 1
fi

echo "Phase 3 routing availability test passed: $(wc -l < "$probe_log") probes, zero 5xx"
