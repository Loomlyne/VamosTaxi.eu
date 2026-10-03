#!/bin/bash
# 26.2 P6: every changed DC form step in a REAL Chromium against the REAL local Worker build and the REAL local
# Supabase stack. Nothing is stubbed inside the Worker; only the outside services (Stripe, Mapbox, Resend,
# Turnstile) are local stand-ins (tests/e2e-worker/fakes.mjs), reached through a fetch rewrite of the BUILT
# worker.js (build output, never the source). Usage:
#   p6-run.sh <repo-tree> <supabase-workdir> <hook-secret-file> [label]
# The tree must already be built (node scripts/sync-dc-mock-to-public.mjs; pnpm --filter web exec opennextjs-cloudflare build).
# Defaults are this job's own ports and stack; override with the same env names run.sh uses:
#   E2E_PORT (public Worker, 4390) E2E_DASH_PORT (dashboard Worker, open as http://dashboard.localhost:<port>, 4391)
#   E2E_INSPECT (9431) E2E_DASH_INSPECT (9432) E2E_FAKE_PORT (4397) SB_API_PORT (62421) SB_DB_PORT (62422)
#   SB_DB_CONTAINER (supabase_db_vamos-taxi-p6b)
# P6_MODE: run (default: seed, start, browser run, stop) | up (seed + start, leave running) | seed (seed only, services up)
#          | down (stop what `up` started). The Supabase stack is never started, stopped or reset here.
set -u
E2E_PORT=${E2E_PORT:-4390}; E2E_DASH_PORT=${E2E_DASH_PORT:-4391}; E2E_INSPECT=${E2E_INSPECT:-9431}; E2E_DASH_INSPECT=${E2E_DASH_INSPECT:-9432}
E2E_FAKE_PORT=${E2E_FAKE_PORT:-4397}
SB_API_PORT=${SB_API_PORT:-62421}; SB_DB_PORT=${SB_DB_PORT:-62422}; SB_DB_CONTAINER=${SB_DB_CONTAINER:-supabase_db_vamos-taxi-p6b}
export E2E_PORT E2E_DASH_PORT E2E_FAKE_PORT SB_API_PORT SB_DB_PORT SB_DB_CONTAINER
TREE=$1; SBDIR=$2; HOOK=$3; LABEL=${4:-p6}
MODE=${P6_MODE:-run}
WEB=$TREE/apps/web
export E2E_HOOK_SECRET_FILE=$HOOK
PIDS="$WEB/.wrangler/p6-pids"
mkdir -p "$WEB/.wrangler"

# Stops only what this run started: the recorded PIDs and their whole process trees (wrangler leaves workerd
# children). Never by port: other sessions run their own Workers on this Mac.
kill_tree() {
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done
  kill "$1" 2>/dev/null
}
stop_all() {
  if [ -f "$PIDS" ]; then
    for p in $(cat "$PIDS"); do kill_tree "$p"; done
    rm -f "$PIDS"
  fi
  sleep 2
  rm -f "$WEB/.e2e-sb.env" "$WEB/.dev.vars"
}

# A port another process holds is a stop, not something to take over (another session's Worker answered on
# 4390 on 2026-10-02 and this run talked to it).
ports_free() {
  local p busy=""
  for p in "$E2E_PORT" "$E2E_DASH_PORT" "$E2E_FAKE_PORT" "$E2E_INSPECT" "$E2E_DASH_INSPECT"; do
    if lsof -ti "tcp:$p" -sTCP:LISTEN >/dev/null 2>&1; then busy="$busy $p"; fi
  done
  if [ -n "$busy" ]; then
    echo "FAIL | p6-run | port(s)$busy already in use by another process: choose free ones with E2E_PORT, E2E_DASH_PORT, E2E_FAKE_PORT, E2E_INSPECT, E2E_DASH_INSPECT"
    return 1
  fi
}

if [ "$MODE" = "down" ]; then stop_all; exit 0; fi

# Keys of the local stack only (never printed).
supabase status -o env --workdir "$SBDIR" > "$WEB/.e2e-sb.env" 2>/dev/null
SB_ANON_KEY=$(sed -n 's/^ANON_KEY=//p' "$WEB/.e2e-sb.env" | tr -d '"'); SB_SERVICE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$WEB/.e2e-sb.env" | tr -d '"')
export SB_ANON_KEY SB_SERVICE_KEY
if [ -z "$SB_SERVICE_KEY" ]; then echo "FAIL | p6-run | the local Supabase stack at $SBDIR is not running"; exit 2; fi
SEED="$WEB/.wrangler/p6-seed.json"
OUTJSON="$WEB/.wrangler/e2e-$LABEL.json"

seed() {
  rm -f "$SEED"
  (cd "$WEB" && VAMOS_LOCAL_DB_PORT="$SB_DB_PORT" P6_BROWSER_SEED_OUT="$SEED" pnpm exec vitest run lib/ops/trip-change-browser.local-seed.test.ts 2>&1 | tail -6)
  [ -s "$SEED" ] || { echo "FAIL | p6-run | the seed wrote no file"; stop_all; exit 3; }
}

if [ "$MODE" = "seed" ]; then seed; exit 0; fi

stop_all
ports_free || exit 5
rm -rf "$WEB/.wrangler/p6" "$WEB/.wrangler/p6-dash"
supabase status -o env --workdir "$SBDIR" > "$WEB/.e2e-sb.env" 2>/dev/null
node "$TREE/apps/web/tests/e2e-worker/mkcfg.mjs" "$WEB" "$WEB/.e2e-sb.env" "$HOOK" p6
# The built worker.js gets its own fetch rewrite (marker P6): Stripe, Turnstile, Mapbox and Resend reach the fakes.
if ! grep -q "E2E_FETCH_PATCH P6" "$WEB/.open-next/worker.js"; then
  { printf '/*E2E_FETCH_PATCH P6*/const __e2eF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"/__stripe","challenges.cloudflare.com":"/__turnstile","api.mapbox.com":"/__mapbox","api.resend.com":"/__resend"}[u.hostname];if(m){const n="http://127.0.0.1:%s"+m+u.pathname+u.search;return __e2eF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __e2eF(i,o)};\n' "$E2E_FAKE_PORT"; cat "$WEB/.open-next/worker.js"; } > "$WEB/.open-next/worker.js.p6" && mv "$WEB/.open-next/worker.js.p6" "$WEB/.open-next/worker.js"
fi
seed
cd "$WEB" || exit 1
node "$TREE/apps/web/tests/e2e-worker/fakes.mjs" > "$WEB/.wrangler/p6-fakes.log" 2>&1 &
echo $! > "$PIDS"
pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$E2E_PORT" --ip 0.0.0.0 --local --persist-to .wrangler/p6 --inspector-port "$E2E_INSPECT" > .wrangler/p6-public.log 2>&1 &
echo $! >> "$PIDS"
pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$E2E_DASH_PORT" --ip 0.0.0.0 --local --persist-to .wrangler/p6-dash --inspector-port "$E2E_DASH_INSPECT" --var VAMOS_SURFACE:auto > .wrangler/p6-dash.log 2>&1 &
echo $! >> "$PIDS"
READY=0
for _ in $(seq 60); do
  sleep 2
  if curl -s -o /dev/null "http://localhost:$E2E_PORT/api/auth/session" && curl -s -o /dev/null "http://localhost:$E2E_DASH_PORT/api/auth/session" && curl -s -o /dev/null "http://127.0.0.1:$E2E_FAKE_PORT/__stats"; then READY=1; break; fi
done
if [ "$READY" != 1 ]; then echo "FAIL | p6-run | the Workers did not come up (see apps/web/.wrangler/p6-public.log, p6-dash.log)"; stop_all; exit 4; fi
echo "up | public http://localhost:$E2E_PORT | dashboard http://dashboard.localhost:$E2E_DASH_PORT | fakes $E2E_FAKE_PORT"
if [ "$MODE" = "up" ]; then exit 0; fi

P6_SEED="$SEED" OUT="$OUTJSON" node "$TREE/apps/web/tests/e2e-worker/p6-browser.e2e.mjs" "$LABEL"
RC=$?
stop_all
exit $RC
