#!/usr/bin/env bash
# Parameterised port-shifted local Supabase stack for one session's tests.
#
# Required env: VAMOS_STACK_ID (project id), VAMOS_STACK_PORTS (3-digit prefix that
# replaces 543), VAMOS_STACK_INSPECTOR (inspector port). Example (phase 26.0, mg2):
#   VAMOS_STACK_ID=vamos-taxi-mg2 VAMOS_STACK_PORTS=573 VAMOS_STACK_INSPECTOR=8193
# gives DB 57322, API 57321, mail 57324, inspector 8193.
#
# Safety:
#   - Refuses the ids vamos-taxi, vamos-taxi-263, vamos-taxi-acct and prefixes 543/553/563
#     (other sessions' stacks). Never `stop --all`.
#   - Local only: --local / --workdir, no project ref, no link, no push.
#   - Roles are cluster-level: they survive `reset`, not `stop`/`start`. Run pgtap BEFORE
#     roles (extensions.test.sql asserts vamos_edge has no password).
#
# Usage: scripts/local-test-stack.sh start|stop|reset|pgtap|roles|mark|env|url|preflight|exec|e2e
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/packages/db/supabase"
SUPABASE="$ROOT/node_modules/.bin/supabase"

: "${VAMOS_STACK_ID:?VAMOS_STACK_ID is required}"
: "${VAMOS_STACK_PORTS:?VAMOS_STACK_PORTS is required}"
: "${VAMOS_STACK_INSPECTOR:?VAMOS_STACK_INSPECTOR is required}"
ID="$VAMOS_STACK_ID"
P="$VAMOS_STACK_PORTS"
case "$ID" in vamos-taxi|vamos-taxi-263|vamos-taxi-acct)
  echo "refusing: $ID belongs to another session" >&2; exit 1;; esac
case "$P" in 543|553|563)
  echo "refusing: port prefix $P belongs to another session" >&2; exit 1;; esac
if ! [[ "$P" =~ ^[0-9]{3}$ ]]; then echo "refusing: VAMOS_STACK_PORTS must be 3 digits" >&2; exit 1; fi

SCRATCH="${VAMOS_STACK_WORKDIR:-${TMPDIR:-/tmp}/vamos-sb-$ID}"
WORK="$SCRATCH/supabase"
DB_PORT="${P}22"
OWNER_URL="postgres://postgres:postgres@127.0.0.1:$DB_PORT/postgres"
CONTAINER="supabase_db_$ID"

prepare() {
  mkdir -p "$WORK"
  for name in migrations tests seed.sql; do ln -sfn "$SRC/$name" "$WORK/$name"; done
  sed -E \
    -e "s/^project_id = .*/project_id = \"$ID\"/" \
    -e "s/(port = )543([0-9]{2})/\1${P}\2/" \
    -e "s/^inspector_port = 8083/inspector_port = $VAMOS_STACK_INSPECTOR/" \
    -e "s/127\.0\.0\.1:543([0-9]{2})/127.0.0.1:${P}\1/g" \
    -e "s/localhost:543([0-9]{2})/localhost:${P}\1/g" \
    "$SRC/config.toml" > "$WORK/config.toml"
  if grep -Eq '(^|[^0-9])543[0-9]{2}' "$WORK/config.toml"; then
    echo "refusing: scratch config.toml still mentions a 543xx port" >&2; exit 1
  fi
}

sb() { "$SUPABASE" "$@" --workdir "$SCRATCH"; }
mark() { node "$ROOT/scripts/mark-test-stack.mjs" "$OWNER_URL"; }

env_lines() {
  local status anon svc
  status="$(sb status -o env 2>/dev/null)"
  anon="$(printf '%s\n' "$status" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
  svc="$(printf '%s\n' "$status" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')"
  echo "export VAMOS_TEST_DB_PORT=$DB_PORT"
  echo "export VAMOS_TEST_DB_URL=$OWNER_URL"
  echo "export OPS_FIXTURE_DB_URL=$OWNER_URL"
  echo "export SUPABASE_URL=http://127.0.0.1:${P}21"
  echo "export SUPABASE_ANON_KEY=$anon"
  echo "export SUPABASE_SERVICE_ROLE_KEY=$svc"
  echo "export VAMOS_TEST_MAIL_URL=http://127.0.0.1:${P}24"
  echo "export VAMOS_SUPABASE_WORKDIR=$SCRATCH"
  echo "export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://vamos_public:vamos_public@127.0.0.1:$DB_PORT/postgres"
  echo "export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE=postgres://vamos_edge:vamos_edge@127.0.0.1:$DB_PORT/postgres"
  echo "export REQUIRE_DB=1"
}

preflight() {
  local bad=0 pid cwd
  for pid in $(lsof -nP -iTCP:4100-4499 -sTCP:LISTEN -t 2>/dev/null | sort -u); do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    case "$cwd" in
      "$ROOT"|"$ROOT"/*) ;;
      *) echo "foreign listener pid $pid (cwd $cwd) on 4100-4499" >&2; bad=1;;
    esac
  done
  [ "$bad" = 0 ] || exit 1
  echo "preflight ok"
}

cmd="${1:-}"
case "$cmd" in
  start) prepare; sb start; mark ;;
  stop) prepare; sb stop ;;
  reset) prepare; sb db reset --local; mark ;;
  pgtap) prepare; sb test db ;;
  url) echo "$OWNER_URL" ;;
  roles)
    port="$(docker port "$CONTAINER" 5432/tcp 2>/dev/null || true)"
    case "$port" in *":$DB_PORT") ;; *) echo "refusing: $CONTAINER is not published on :$DB_PORT (got '$port')" >&2; exit 1;; esac
    docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 <<SQL
alter role vamos_edge password 'vamos_edge';
alter role vamos_public password 'vamos_public';
SQL
    ;;
  mark) mark ;;
  env) prepare; env_lines ;;
  preflight) preflight ;;
  exec)
    shift; [ "${1:-}" = "--" ] && shift
    [ $# -gt 0 ] || { echo "usage: $0 exec -- <cmd...>" >&2; exit 2; }
    prepare
    eval "$(env_lines)"
    "$@"
    ;;
  e2e)
    shift
    preflight
    node "$ROOT/scripts/sync-dc-mock-to-public.mjs"
    prepare
    eval "$(env_lines)"
    cd "$ROOT" && pnpm --filter web exec playwright test "$@"
    ;;
  *) echo "usage: $0 start|stop|reset|pgtap|roles|mark|env|url|preflight|exec|e2e" >&2; exit 2 ;;
esac
