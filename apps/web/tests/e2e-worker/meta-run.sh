#!/bin/bash
# Phase 28 plan 28-07 (META-09): the Pay press saves _fbp/_fbc, end to end on a local Worker build.
# Usage (from the repo root, after `pnpm --filter web exec opennextjs-cloudflare build`):
#   VAMOS_STACK_ID=vamos-taxi-280 VAMOS_STACK_PORTS=613 VAMOS_STACK_INSPECTOR=8483 bash apps/web/tests/e2e-worker/meta-run.sh
# Needs the stack started, reset and `roles` run. Ports default to 4377 (Worker), 4397 (stand-ins), 9377 (inspector);
# override with E2E_PORT / E2E_FAKE_PORT / E2E_INSPECT if busy. Stops only the processes it started.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WEB="$ROOT/apps/web"
: "${VAMOS_STACK_ID:?}" "${VAMOS_STACK_PORTS:?}"
export E2E_PORT=${E2E_PORT:-4377} E2E_FAKE_PORT=${E2E_FAKE_PORT:-4397} E2E_INSPECT=${E2E_INSPECT:-9377}
for p in "$E2E_PORT" "$E2E_FAKE_PORT" "$E2E_INSPECT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then echo "refusing: port $p is busy" >&2; exit 1; fi
done
SCRATCH="${VAMOS_STACK_WORKDIR:-${TMPDIR:-/tmp}/vamos-sb-$VAMOS_STACK_ID}"
export SB_API_PORT="${VAMOS_STACK_PORTS}21" SB_DB_PORT="${VAMOS_STACK_PORTS}22" SB_DB_CONTAINER="supabase_db_$VAMOS_STACK_ID"
mkdir -p "$WEB/.wrangler"
"$ROOT/node_modules/.bin/supabase" status -o env --workdir "$SCRATCH" > "$WEB/.e2e-sb.env" 2>/dev/null
SB_ANON_KEY=$(sed -n 's/^ANON_KEY=//p' "$WEB/.e2e-sb.env" | tr -d '"'); SB_SERVICE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$WEB/.e2e-sb.env" | tr -d '"')
export SB_ANON_KEY SB_SERVICE_KEY
echo "e2e-local-hook-secret" > "$WEB/.wrangler/e2e-hook-secret"
node "$WEB/tests/e2e-worker/mkcfg.mjs" "$WEB" "$WEB/.e2e-sb.env" "$WEB/.wrangler/e2e-hook-secret" phase2
if ! grep -q "E2E_FETCH_PATCH" "$WEB/.open-next/worker.js"; then
  { printf '/*E2E_FETCH_PATCH*/const __e2eF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"/__stripe","challenges.cloudflare.com":"/__turnstile"}[u.hostname];if(m){const n="http://127.0.0.1:%s"+m+u.pathname+u.search;return __e2eF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __e2eF(i,o)};\n' "$E2E_FAKE_PORT"; cat "$WEB/.open-next/worker.js"; } > "$WEB/.open-next/worker.js.e2e" && mv "$WEB/.open-next/worker.js.e2e" "$WEB/.open-next/worker.js"
fi
node "$WEB/tests/e2e-worker/fakes.mjs" > "$WEB/.wrangler/e2e-fakes.log" 2>&1 &
PF=$!
cd "$WEB" || exit 1
pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$E2E_PORT" --ip 127.0.0.1 --local --persist-to .wrangler/e2e-meta --inspector-port "$E2E_INSPECT" > .wrangler/e2e-meta.log 2>&1 &
PW=$!
for _ in $(seq 60); do sleep 2; curl -s -o /dev/null http://localhost:$E2E_PORT/api/auth/session && break; done
OUT="$WEB/.wrangler/e2e-meta-click-ids.json" node "$WEB/tests/e2e-worker/meta-click-ids.e2e.mjs"
CODE=$?
kill $PW $PF 2>/dev/null
lsof -nP -iTCP:"$E2E_PORT" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null
rm -f "$WEB/.e2e-sb.env" "$WEB/.dev.vars" "$WEB/.wrangler/e2e-hook-secret"
exit $CODE
