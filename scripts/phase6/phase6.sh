#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)

usage() {
    cat <<'EOF'
Usage: pnpm phase6 -- <command> [options]

Commands:
  preflight        Render a preflight plan or run read-only staging discovery
  acceptance       Render or execute staging-only acceptance scenarios
  soak             Render or execute continuous HTTP/TLS and metrics probes
  render-cutover   Generate, but never execute, cutover and rollback commands
  test             Run local Phase 6 tests

All operational commands default to --dry-run. See docs/PHASE6_RUNBOOK.md.
EOF
}

if [ "${1:-}" = -- ]; then shift; fi
command_name=${1:-}
case "$command_name" in
    preflight|acceptance|soak|render-cutover)
        shift
        exec bash "$script_dir/$command_name.sh" "$@"
        ;;
    test)
        shift
        exec bash "$script_dir/tests/run.sh" "$@"
        ;;
    -h|--help|help|'')
        usage
        ;;
    *)
        printf 'Unknown Phase 6 command: %s\n' "$command_name" >&2
        usage >&2
        exit 2
        ;;
esac
