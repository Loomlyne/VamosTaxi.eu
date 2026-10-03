#!/bin/bash
# Local Worker for the fare-lines browser proof. Own ports; refuses busy ones; records PIDs; never kills by name.
set -u
WEB=/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7/apps/web
PORT=4580; DASH=4581; FAKE=4587; INSP=9531; DINSP=9532
for p in $PORT $DASH $FAKE $INSP $DINSP; do
  if lsof -ti "tcp:$p" -sTCP:LISTEN >/dev/null 2>&1; then echo "BUSY port $p"; exit 5; fi
done
cd "$WEB" || exit 1
if ! grep -q "E2E_FETCH_PATCH FL" .open-next/worker.js; then
  { printf '/*E2E_FETCH_PATCH FL*/const __e2eF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"/__stripe","challenges.cloudflare.com":"/__turnstile","api.mapbox.com":"/__mapbox","api.resend.com":"/__resend"}[u.hostname];if(m){const n="http://127.0.0.1:%s"+m+u.pathname+u.search;return __e2eF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __e2eF(i,o)};\n' "$FAKE"; cat .open-next/worker.js; } > .open-next/worker.js.fl && mv .open-next/worker.js.fl .open-next/worker.js
fi
mkdir -p .wrangler
E2E_FAKE_PORT=$FAKE nohup node tests/e2e-worker/fakes.mjs > .wrangler/fl-fakes.log 2>&1 &
echo $! > /private/tmp/vamos-fl/pid-fakes
nohup pnpm exec wrangler dev -c wrangler.e2e.jsonc --port $PORT --ip 127.0.0.1 --local --persist-to .wrangler/fl --inspector-port $INSP > .wrangler/fl-public.log 2>&1 &
echo $! > /private/tmp/vamos-fl/pid-public
nohup pnpm exec wrangler dev -c wrangler.e2e.jsonc --port $DASH --ip 127.0.0.1 --local --persist-to .wrangler/fl-dash --inspector-port $DINSP --var VAMOS_SURFACE:auto > .wrangler/fl-dash.log 2>&1 &
echo $! > /private/tmp/vamos-fl/pid-dash
echo started
