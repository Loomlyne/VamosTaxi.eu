#!/usr/bin/env bash
# Port-shifted local Supabase stack for the phase 27 worktree (ports 5932x, project vamos-taxi-270).
#
# Safety:
#   - Never point this at another session's stack (54322, 55322, 56322, 57322, 58322, 60322).
#     This script only ever talks to 593xx.
#   - Never point this at a hosted project. It uses --local / --workdir only and carries no project ref.
#
# Usage: scripts/local-stack-27.sh start|stop|reset|migrate|test|types|url|status|hook-secret-path
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/packages/db/supabase"
SCRATCH="${VAMOS_SB27:-/tmp/vamos-sb27}"
WORK="$SCRATCH/supabase"
DB_URL="postgres://postgres:postgres@127.0.0.1:59322/postgres"
SUPABASE="$ROOT/node_modules/.bin/supabase"
HOOK_SECRET="$SCRATCH/hook-secret.txt"

prepare() {
  mkdir -p "$WORK"
  for name in migrations tests seed.sql; do
    ln -sfn "$SRC/$name" "$WORK/$name"
  done
  # Hook secret for the auth e2e: created once, mode 600, never printed, never committed.
  if [ ! -s "$HOOK_SECRET" ]; then
    ( umask 077; printf 'v1,whsec_%s' "$(openssl rand -base64 32)" > "$HOOK_SECRET" )
    chmod 600 "$HOOK_SECRET"
  fi
  # Copy config, rename the project, shift every 543xx port to 593xx, inspector 8083 to 8283.
  sed -E \
    -e 's/^project_id = .*/project_id = "vamos-taxi-270"/' \
    -e 's/(port = )543([0-9]{2})/\1593\2/' \
    -e 's/^inspector_port = 8083/inspector_port = 8283/' \
    -e 's/127\.0\.0\.1:543([0-9]{2})/127.0.0.1:593\1/g' \
    -e 's/localhost:543([0-9]{2})/localhost:593\1/g' \
    -e 's#^(  "http://localhost:4270/\*\*",)$#\1\n  "http://localhost:4290/**",#' \
    "$SRC/config.toml" > "$WORK/config.toml"
  {
    echo
    echo "[auth.hook.send_email]"
    echo "enabled = true"
    echo 'uri = "http://host.docker.internal:4290/api/auth/email-hook"'
    printf 'secrets = "%s"\n' "$(cat "$HOOK_SECRET")"
  } >> "$WORK/config.toml"
  if grep -Eq '(^|[^0-9])543[0-9]{2}|55322|56322|57322|58322|60322' "$WORK/config.toml"; then
    echo "refusing: scratch config.toml still mentions another session's port" >&2
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
  status) prepare; sb status ;;
  types)
    prepare
    sb gen types typescript --local --schema public > "$ROOT/packages/db/database.types.ts"
    ;;
  url) echo "$DB_URL" ;;
  hook-secret-path) echo "$HOOK_SECRET" ;;
  *)
    echo "usage: $0 start|stop|reset|migrate|test|types|url|status|hook-secret-path" >&2
    exit 2
    ;;
esac
