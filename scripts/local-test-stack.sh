#!/usr/bin/env bash
# Parameterised port-shifted local Supabase stack for one session's tests.
#
# Required env: VAMOS_STACK_ID (project id), VAMOS_STACK_PORTS (3-digit prefix that
# replaces 543), VAMOS_STACK_INSPECTOR (inspector port). Example (phase 26.0, mg2; 573 was taken by vamos-taxi-auth):
#   VAMOS_STACK_ID=vamos-taxi-mg2 VAMOS_STACK_PORTS=583 VAMOS_STACK_INSPECTOR=8193
# gives DB 58322, API 58321, mail 58324, inspector 8193.
#
# Safety:
#   - Refuses the ids vamos-taxi, vamos-taxi-263, vamos-taxi-acct and prefixes 543/553/563/573 (573 = vamos-taxi-auth)
#     (other sessions' stacks). Never `stop --all`.
#   - Local only: --local / --workdir, no project ref, no link, no push.
#   - Roles are cluster-level: they survive `reset`, not `stop`/`start`. Run pgtap BEFORE
#     roles (extensions.test.sql asserts vamos_edge has no password).
#
# Runtime (owner 2026-10-03: no Docker on this Mac): VAMOS_STACK_RUNTIME=auto|docker|native, default auto.
#   auto = docker when CI is set; else native when this machine can (macOS arm64 or Linux and the CLI on PATH,
#   or $SUPABASE_NATIVE_CLI, is >= 2.118.0); else docker. Native uses that CLI and its bundled psql, not the repo pin.
#   The choice is printed once to stderr ("runtime: native"), never into `env` output.
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
case "$P" in 543|553|563|573)
  echo "refusing: port prefix $P belongs to another session" >&2; exit 1;; esac
if ! [[ "$P" =~ ^[0-9]{3}$ ]]; then echo "refusing: VAMOS_STACK_PORTS must be 3 digits" >&2; exit 1; fi

SCRATCH="${VAMOS_STACK_WORKDIR:-${TMPDIR:-/tmp}/vamos-sb-$ID}"
WORK="$SCRATCH/supabase"
DB_PORT="${P}22"
OWNER_URL="postgres://postgres:postgres@127.0.0.1:$DB_PORT/postgres"
PSQL_URL="postgresql://postgres:postgres@127.0.0.1:$DB_PORT/postgres"
CONTAINER="supabase_db_$ID"
NATIVE_CLI="${SUPABASE_NATIVE_CLI:-supabase}"
RUNTIME=docker

# Same checks as scripts/test-lab/lab.sh need_native_cli: platform, CLI present, version >= 2.118.0.
native_possible() {
  local v
  case "$(uname -s)-$(uname -m)" in Darwin-arm64|Linux-*) ;; *) return 1;; esac
  v=$("$NATIVE_CLI" --version 2>/dev/null | grep -Eo '^[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  [ -n "$v" ] || return 1
  [ "$(printf '2.118.0\n%s\n' "$v" | sort -V | head -1)" = "2.118.0" ]
}
# The managed stack brings its own psql; the newest cached Postgres build is used.
psql_bin() { ls -d "$HOME"/.supabase/cache/stack/slim-services/postgres/*/*/bin/psql 2>/dev/null | sort -V | tail -1; }
pick_runtime() {
  case "${VAMOS_STACK_RUNTIME:-auto}" in
    docker) RUNTIME=docker;;
    native)
      native_possible || { echo "refusing: native runtime needs macOS arm64 or Linux and a Supabase CLI >= 2.118.0 ('$NATIVE_CLI'; set SUPABASE_NATIVE_CLI)" >&2; exit 1; }
      RUNTIME=native;;
    auto)
      if [ -n "${CI:-}" ]; then RUNTIME=docker
      elif native_possible; then RUNTIME=native
      else RUNTIME=docker; fi;;
    *) echo "refusing: VAMOS_STACK_RUNTIME must be auto, docker or native" >&2; exit 2;;
  esac
  echo "runtime: $RUNTIME" >&2
}

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
  # Specs start next dev on shifted ports (VAMOS_TEST_PORT_OFFSET); Auth only redirects to allow-listed
  # URLs, so a throwaway stack accepts any localhost port. Scratch copy only, never the repo config.
  sed -i.bak -E 's#^(additional_redirect_urls = \[)#\1\n  "http://localhost:*/**",#' "$WORK/config.toml"
  rm -f "$WORK/config.toml.bak"
  if [ "$RUNTIME" = native ]; then
    # The managed (Docker-free) stack is switched on by `stack = true` under [experimental].
    sed -i.bak -E 's#^\[experimental\]$#[experimental]\nstack = true#' "$WORK/config.toml"
    rm -f "$WORK/config.toml.bak"
  fi
  if grep -Eq '(^|[^0-9])543[0-9]{2}' "$WORK/config.toml"; then
    echo "refusing: scratch config.toml still mentions a 543xx port" >&2; exit 1
  fi
}

sb() {
  if [ "$RUNTIME" = native ]; then "$NATIVE_CLI" "$@" --workdir "$SCRATCH"
  else "$SUPABASE" "$@" --workdir "$SCRATCH"; fi
}
mark() { node "$ROOT/scripts/mark-test-stack.mjs" "$OWNER_URL"; }

env_lines() {
  local status anon svc
  if [ "$RUNTIME" = native ]; then
    # The managed stack answers `status --env` with one JSON object (`-o env` prints nothing).
    status="$(sb status --env 2>/dev/null || true)"
    anon="$(printf '%s\n' "$status" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const l=t.split("\n").find(x=>x.trim().startsWith("{"));if(l)process.stdout.write(String(JSON.parse(l).ANON_KEY??""))})')"
    svc="$(printf '%s\n' "$status" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const l=t.split("\n").find(x=>x.trim().startsWith("{"));if(l)process.stdout.write(String(JSON.parse(l).SERVICE_ROLE_KEY??""))})')"
  else
    status="$(sb status -o env 2>/dev/null)"
    anon="$(printf '%s\n' "$status" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
    svc="$(printf '%s\n' "$status" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')"
  fi
  echo "export VAMOS_TEST_DB_PORT=$DB_PORT"
  # packages/db/test/local/worker-arrays.test.ts (from main, 34af1552) reads this name instead.
  echo "export VAMOS_LOCAL_DB_PORT=$DB_PORT"
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
  echo "export VAMOS_TEST_PORT_OFFSET=$PORT_OFFSET"
}

# Spec dev-server ports are 4100-4499 plus VAMOS_TEST_PORT_OFFSET (tests/support/port.ts).
# A session that shares the Mac sets the offset (e.g. 2000 -> 6100-6499); default 0.
PORT_OFFSET="${VAMOS_TEST_PORT_OFFSET:-0}"
case "$PORT_OFFSET" in ''|*[!0-9]*) echo "VAMOS_TEST_PORT_OFFSET must be a non-negative integer" >&2; exit 2;; esac
PORT_LO=$((4100 + PORT_OFFSET))
PORT_HI=$((4499 + PORT_OFFSET))

preflight() {
  local bad=0 pid cwd
  for pid in $(lsof -nP -iTCP:$PORT_LO-$PORT_HI -sTCP:LISTEN -t 2>/dev/null | sort -u); do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    case "$cwd" in
      "$ROOT"|"$ROOT"/*) ;;
      *) echo "foreign listener pid $pid (cwd $cwd) on $PORT_LO-$PORT_HI" >&2; bad=1;;
    esac
  done
  [ "$bad" = 0 ] || exit 1
  echo "preflight ok ($PORT_LO-$PORT_HI)"
}

cmd="${1:-}"
case "$cmd" in start|stop|reset|pgtap|roles|env|exec|e2e) pick_runtime ;; esac
case "$cmd" in
  start) prepare; if [ "$RUNTIME" = native ]; then sb start --runtime native --eager; else sb start; fi; mark ;;
  stop) prepare; sb stop ;;
  reset) prepare; sb db reset --local; mark ;;
  pgtap) prepare; if [ "$RUNTIME" = native ]; then sb test db --local; else sb test db; fi ;;
  url) echo "$OWNER_URL" ;;
  roles)
    if [ "$RUNTIME" = native ]; then
      pb="$(psql_bin)"
      [ -n "$pb" ] || { echo "refusing: no psql found under ~/.supabase/cache/stack (start the native stack once)" >&2; exit 1; }
      "$pb" "$PSQL_URL?connect_timeout=5" -Atqc 'select 1' >/dev/null 2>&1 \
        || { echo "refusing: cannot connect to the native stack on :$DB_PORT" >&2; exit 1; }
      "$pb" "$PSQL_URL" -v ON_ERROR_STOP=1 <<SQL
alter role vamos_edge password 'vamos_edge';
alter role vamos_public password 'vamos_public';
SQL
      exit 0
    fi
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
