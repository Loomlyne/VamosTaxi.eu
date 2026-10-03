#!/bin/bash
# Quick 261002-p6-followups: the browser proof of items 1, 3, 4 and 5 in a REAL Chromium against the REAL local Worker
# build and the REAL local Supabase stack. Nothing is stubbed inside the Worker; only the outside services (Stripe,
# Mapbox, Resend, Turnstile) are local stand-ins (apps/web/tests/e2e-worker/fakes.mjs), reached through a fetch rewrite of
# the BUILT worker.js (build output, never the source). Modelled on apps/web/tests/e2e-worker/p6-run.sh.
#
#   proof-run.sh [mode]        mode: all (default) | build | up | seed | browser | mirror | report | down
#     all      sync the DC mocks, build, up (+ seed), browser proof, mirror check, down. One command, repeatable.
#     build    node scripts/sync-dc-mock-to-public.mjs, then opennextjs-cloudflare build (minutes)
#     up       set the two login-role passwords, seed, patch the built worker.js, start fakes + two Workers, leave them running
#     seed     (Workers must be up) seed again: new bookings, new manage tokens, new JSON file
#     browser  run proof-browser.mjs against the running Workers
#     mirror   run mirror-check.mjs against the running Workers (public pages and the dashboard)
#     report   write evidence/PROOF.md from the evidence files
#     down     stop only what `up` started (recorded PIDs and their process trees, never by port), take the passwords off
# Environment (defaults are this job's own block; checked free at 2026-10-02 12:40):
#   E2E_PORT 4790 (public)  E2E_DASH_PORT 4791 (dashboard, http://dashboard.localhost:<port>)  E2E_FAKE_PORT 4797
#   E2E_INSPECT 9791  E2E_DASH_INSPECT 9792   SB_API_PORT 61621  SB_DB_PORT 61622  SB_DB_CONTAINER supabase_db_vamos-taxi-p6f
#   PROOF_SBDIR (the scratch Supabase workdir)  PROOF_HOOK_FILE (a random string; made if missing, never printed)
#   PROOF_SKIP_BUILD=1 (mode all: reuse the existing build)  PROOF_ONLY=P1,P3,P4,COV,SCROLL (browser: run only these)
# The Supabase stack is never started, stopped or reset here.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TREE=$(cd "$HERE/../../../.." && pwd)
WEB=$TREE/apps/web
JOB=$TREE/.planning/quick/261002-p6-followups
E2E_PORT=${E2E_PORT:-4790}; E2E_DASH_PORT=${E2E_DASH_PORT:-4791}; E2E_FAKE_PORT=${E2E_FAKE_PORT:-4797}
E2E_INSPECT=${E2E_INSPECT:-9791}; E2E_DASH_INSPECT=${E2E_DASH_INSPECT:-9792}
SB_API_PORT=${SB_API_PORT:-61621}; SB_DB_PORT=${SB_DB_PORT:-61622}; SB_DB_CONTAINER=${SB_DB_CONTAINER:-supabase_db_vamos-taxi-p6f}
SBDIR=${PROOF_SBDIR:-/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/a8074de7-fdaf-48ec-863d-3533d370c16e/scratchpad/sbp6f}
HOOK=${PROOF_HOOK_FILE:-$SBDIR/hook-secret}
export E2E_PORT E2E_DASH_PORT E2E_FAKE_PORT SB_API_PORT SB_DB_PORT SB_DB_CONTAINER
export E2E_HOOK_SECRET_FILE=$HOOK
MODE=${1:-all}
PIDS=$WEB/.wrangler/proof-pids
SEED=$WEB/.wrangler/proof-seed.json
EVID=$JOB/evidence
mkdir -p "$WEB/.wrangler" "$EVID" "$JOB/screens/proof"
BASE=http://localhost:$E2E_PORT
DASH=http://dashboard.localhost:$E2E_DASH_PORT

# Stops only what this run started: the recorded PIDs and their whole process trees (wrangler leaves workerd children).
kill_tree() {
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done
  kill "$1" 2>/dev/null
}
psql_pg() { docker exec -i "$SB_DB_CONTAINER" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "$1"; }
# The two login roles of the Worker's database connections are passwordless on this stack (the pgTAP files want that);
# they get their committed local passwords only while the Workers and the seed run.
passwords_on()  { psql_pg "alter role vamos_edge password 'vamos_edge'; alter role vamos_public password 'vamos_public'" >/dev/null; }
passwords_off() { psql_pg "alter role vamos_edge password null; alter role vamos_public password null" >/dev/null 2>&1; }
start_public() {
  ( cd "$WEB" && exec pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$E2E_PORT" --ip 0.0.0.0 --local --persist-to .wrangler/proof --inspector-port "$E2E_INSPECT" >> .wrangler/proof-public.log 2>&1 ) &
  echo $! >> "$PIDS"
}
start_dash() {
  ( cd "$WEB" && exec pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$E2E_DASH_PORT" --ip 0.0.0.0 --local --persist-to .wrangler/proof-dash --inspector-port "$E2E_DASH_INSPECT" --var VAMOS_SURFACE:auto >> .wrangler/proof-dash.log 2>&1 ) &
  echo $! >> "$PIDS"
}
stop_all() {
  if [ -f "$PIDS" ]; then
    # last started first: the supervisor (the last line) stops before the Workers it would bring back
    for p in $(tail -r "$PIDS"); do kill_tree "$p"; done
    rm -f "$PIDS"
  fi
  sleep 2
  rm -f "$WEB/.e2e-sb.env" "$WEB/.dev.vars"
  passwords_off
}

# A port another process holds is a stop, not something to take over (other sessions run Workers on this Mac).
ports_free() {
  local p busy=""
  for p in "$E2E_PORT" "$E2E_DASH_PORT" "$E2E_FAKE_PORT" "$E2E_INSPECT" "$E2E_DASH_INSPECT"; do
    if lsof -ti "tcp:$p" -sTCP:LISTEN >/dev/null 2>&1; then busy="$busy $p"; fi
  done
  if [ -n "$busy" ]; then
    echo "FAIL | proof-run | port(s)$busy already in use by another process: choose free ones with E2E_PORT, E2E_DASH_PORT, E2E_FAKE_PORT, E2E_INSPECT, E2E_DASH_INSPECT (the fake port is baked into the patched worker.js: it is re-patched on every up)"
    return 1
  fi
}

do_build() {
  cd "$TREE" || return 1
  node scripts/sync-dc-mock-to-public.mjs || return 1
  # what the build is made from (the report names it)
  { git -C "$TREE" log -1 --format='%h %s'; git -C "$TREE" status --short | grep -v '^??' | wc -l | tr -d ' '; } > "$WEB/.wrangler/proof-build.head"
  pnpm --filter web exec opennextjs-cloudflare build > "$WEB/.wrangler/proof-build.log" 2>&1
  local rc=$?
  tail -n 8 "$WEB/.wrangler/proof-build.log"
  [ $rc -eq 0 ] || echo "FAIL | proof-run | the build failed (see apps/web/.wrangler/proof-build.log)"
  return $rc
}

do_seed() {
  rm -f "$SEED"
  (cd "$WEB" && VAMOS_LOCAL_DB_PORT="$SB_DB_PORT" P6F_BROWSER_SEED_OUT="$SEED" pnpm exec vitest run lib/ops/p6-followups-browser.local-seed.test.ts 2>&1 | tail -8)
  [ -s "$SEED" ] || { echo "FAIL | proof-run | the seed wrote no file"; return 3; }
}

do_up() {
  [ -f "$WEB/.open-next/worker.js" ] || { echo "FAIL | proof-run | no build: run proof-run.sh build first"; return 6; }
  stop_all
  ports_free || return 5
  [ -s "$HOOK" ] || { mkdir -p "$(dirname "$HOOK")"; (umask 077; head -c 24 /dev/urandom | base64 | tr -d '/+=\n' > "$HOOK"); }
  supabase status -o env --workdir "$SBDIR" > "$WEB/.e2e-sb.env" 2>/dev/null
  SB_ANON_KEY=$(sed -n 's/^ANON_KEY=//p' "$WEB/.e2e-sb.env" | tr -d '"'); SB_SERVICE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$WEB/.e2e-sb.env" | tr -d '"')
  if [ -z "$SB_SERVICE_KEY" ]; then echo "FAIL | proof-run | the local Supabase stack at $SBDIR is not running"; return 2; fi
  passwords_on || { echo "FAIL | proof-run | could not set the login-role passwords on $SB_DB_CONTAINER"; return 2; }
  rm -rf "$WEB/.wrangler/proof" "$WEB/.wrangler/proof-dash"
  rm -f "$WEB/.wrangler/proof-public.log" "$WEB/.wrangler/proof-dash.log" "$WEB/.wrangler/proof-supervisor.log"
  node "$WEB/tests/e2e-worker/mkcfg.mjs" "$WEB" "$WEB/.e2e-sb.env" "$HOOK" p6 || return 2
  # The built worker.js gets a fetch rewrite so Stripe, Turnstile, Mapbox and Resend reach the fakes. The fake port is baked
  # into it: a patch line from an earlier run (same or another port) is taken off first, so every up is a clean patch.
  if head -c 20 "$WEB/.open-next/worker.js" | grep -q "E2E_FETCH_PATCH"; then
    tail -n +2 "$WEB/.open-next/worker.js" > "$WEB/.open-next/worker.js.pf" && mv "$WEB/.open-next/worker.js.pf" "$WEB/.open-next/worker.js"
  fi
  { printf '/*E2E_FETCH_PATCH PF*/const __e2eF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"/__stripe","challenges.cloudflare.com":"/__turnstile","api.mapbox.com":"/__mapbox","api.resend.com":"/__resend"}[u.hostname];if(m){const n="http://127.0.0.1:%s"+m+u.pathname+u.search;return __e2eF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __e2eF(i,o)};\n' "$E2E_FAKE_PORT"; cat "$WEB/.open-next/worker.js"; } > "$WEB/.open-next/worker.js.pf" && mv "$WEB/.open-next/worker.js.pf" "$WEB/.open-next/worker.js"
  do_seed || { stop_all; return 3; }
  cd "$WEB" || return 1
  node "$WEB/tests/e2e-worker/fakes.mjs" > "$WEB/.wrangler/proof-fakes.log" 2>&1 &
  echo $! > "$PIDS"
  start_public
  start_dash
  # A local Worker runtime can die mid-run with no crash report (load on this Mac; see memory local-worker-runs-shared-mac). A small
  # supervisor, itself one of the recorded PIDs, brings back whichever Worker stopped answering, so a long browser run is not cut.
  ( while true; do
      sleep 6
      curl -s -o /dev/null -m 5 "http://localhost:$E2E_PORT/api/auth/session" || { echo "$(date +%T) public Worker not answering: restarted" >> "$WEB/.wrangler/proof-supervisor.log"; start_public; sleep 20; }
      curl -s -o /dev/null -m 5 "http://localhost:$E2E_DASH_PORT/api/auth/session" || { echo "$(date +%T) dashboard Worker not answering: restarted" >> "$WEB/.wrangler/proof-supervisor.log"; start_dash; sleep 20; }
    done ) >/dev/null 2>&1 &
  echo $! >> "$PIDS"
  local ready=0 _
  for _ in $(seq 60); do
    sleep 2
    if curl -s -o /dev/null "http://localhost:$E2E_PORT/api/auth/session" && curl -s -o /dev/null "http://localhost:$E2E_DASH_PORT/api/auth/session" && curl -s -o /dev/null "http://127.0.0.1:$E2E_FAKE_PORT/__stats"; then ready=1; break; fi
  done
  if [ "$ready" != 1 ]; then echo "FAIL | proof-run | the Workers did not come up (see apps/web/.wrangler/proof-public.log, proof-dash.log)"; stop_all; return 4; fi
  echo "up | public $BASE | dashboard $DASH | fakes $E2E_FAKE_PORT"
}

# Keys of the local stack only (never printed).
load_keys() {
  local f="$WEB/.wrangler/proof-sb.env"
  supabase status -o env --workdir "$SBDIR" > "$f" 2>/dev/null
  SB_ANON_KEY=$(sed -n 's/^ANON_KEY=//p' "$f" | tr -d '"'); SB_SERVICE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$f" | tr -d '"')
  rm -f "$f"
  export SB_ANON_KEY SB_SERVICE_KEY
  [ -n "$SB_SERVICE_KEY" ] || { echo "FAIL | proof-run | the local Supabase stack at $SBDIR is not running"; return 2; }
}

do_browser() {
  [ -s "$SEED" ] || { echo "FAIL | proof-run | no seed file: run up (or seed) first"; return 3; }
  load_keys || return 2
  (cd "$WEB" && PROOF_SEED="$SEED" PROOF_BASE="$BASE" PROOF_DASH="$DASH" PROOF_JOB="$JOB" PROOF_EVID="$EVID" PROOF_FAKE="http://127.0.0.1:$E2E_FAKE_PORT" \
    node "$HERE/proof-browser.mjs")
}

do_mirror() {
  # The public pages and the dashboard pages in one go: mirror-check.mjs --base/--ops-base, the proof's own spot list (it signs
  # the dashboard admin in, the stock list has no sign-in) and a JSON file.
  load_keys || return 2
  PROOF_SEED="$SEED" PROOF_DASH="$DASH" PROOF_BASE="$BASE" PROOF_EVID="$EVID" PROOF_JOB="$JOB" node "$HERE/proof-mirror.mjs" > "$EVID/mirror-worker.txt" 2>&1
  local rc=$?
  tail -n 25 "$EVID/mirror-worker.txt"
  return $rc
}

do_report() {
  PROOF_EVID="$EVID" PROOF_JOB="$JOB" PROOF_TREE="$TREE" node "$HERE/proof-report.mjs"
}

case "$MODE" in
  down) stop_all; exit 0 ;;
  build) do_build; exit $? ;;
  up) do_up; exit $? ;;
  seed) do_seed; exit $? ;;
  browser) do_browser; exit $? ;;
  mirror) do_mirror; exit $? ;;
  report) do_report; exit $? ;;
  all)
    trap 'stop_all' EXIT INT TERM
    stop_all
    if [ "${PROOF_SKIP_BUILD:-0}" != 1 ]; then do_build || exit 6; fi
    do_up || exit $?
    do_browser; RC=$?
    do_mirror; RC2=$?
    [ $RC -eq 0 ] && RC=$RC2
    do_report
    exit $RC
    ;;
  *) echo "usage: proof-run.sh [all|build|up|seed|browser|mirror|down]"; exit 64 ;;
esac
