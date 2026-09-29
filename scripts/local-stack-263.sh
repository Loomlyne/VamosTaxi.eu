#!/usr/bin/env bash
# Port-shifted local Supabase stack for the phase 26.3 worktree.
#
# Safety:
#   - Never point this at the 5432x stack: that one belongs to another session
#     (project_id "vamos-taxi"). This script only ever talks to 553xx.
#   - Never point this at a hosted project. It uses --local / --workdir only and
#     carries no project ref.
#
# Usage: scripts/local-stack-263.sh start|stop|reset|migrate|test|types|url
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/packages/db/supabase"
SCRATCH="${VAMOS_SB263:-/tmp/vamos-sb263}"
WORK="$SCRATCH/supabase"
DB_URL="postgres://postgres:postgres@127.0.0.1:55322/postgres"
SUPABASE="$ROOT/node_modules/.bin/supabase"

prepare() {
  mkdir -p "$WORK"
  for name in migrations tests seed.sql; do
    ln -sfn "$SRC/$name" "$WORK/$name"
  done
  # Copy config, rename the project and shift every 543xx port to 553xx.
  sed -E \
    -e 's/^project_id = .*/project_id = "vamos-taxi-263"/' \
    -e 's/(port = )543([0-9]{2})/\1553\2/' \
    -e 's/^inspector_port = 8083/inspector_port = 8183/' \
    -e 's/127\.0\.0\.1:543([0-9]{2})/127.0.0.1:553\1/g' \
    -e 's/localhost:543([0-9]{2})/localhost:553\1/g' \
    "$SRC/config.toml" > "$WORK/config.toml"
  if grep -Eq '(^|[^0-9])543[0-9]{2}' "$WORK/config.toml"; then
    echo "refusing: scratch config.toml still mentions a 543xx port" >&2
    exit 1
  fi
}

sb() { "$SUPABASE" "$@" --workdir "$SCRATCH"; }

cmd="${1:-}"
case "$cmd" in
  start) prepare; sb start ;;
  stop) prepare; sb stop ;;
  reset) prepare; sb db reset --local ;;
  migrate) prepare; sb migration up --local ;;
  test) prepare; sb test db ;;
  types)
    prepare
    sb gen types typescript --local --schema public > "$ROOT/packages/db/database.types.ts"
    ;;
  url) echo "$DB_URL" ;;
  *)
    echo "usage: $0 start|stop|reset|migrate|test|types|url" >&2
    exit 2
    ;;
esac
