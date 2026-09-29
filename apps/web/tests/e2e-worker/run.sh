#!/bin/bash
# Auth end-to-end on a real local Worker build against a real local Supabase.
# See docs/runbook/auth-worker-e2e.md. Usage:
#   run.sh <repo-tree> <supabase-workdir> <hook-secret-file> <label>
# The tree must already be built (`pnpm --filter web exec opennextjs-cloudflare build`).
set -u
TREE=$1; SBDIR=$2; HOOK=$3; LABEL=${4:-run}
WEB=$TREE/apps/web
supabase status -o env --workdir "$SBDIR" > "$WEB/.e2e-sb.env" 2>/dev/null
node "$TREE/apps/web/tests/e2e-worker/mkcfg.mjs" "$WEB" "$WEB/.e2e-sb.env" "$HOOK"
rm -f "$WEB/.e2e-sb.env"
cd "$WEB" || exit 1
pnpm exec wrangler dev -c wrangler.e2e.jsonc --port 4290 --ip 0.0.0.0 --local --persist-to .wrangler/e2e --inspector-port 9331 > .wrangler/e2e-public.log 2>&1 &
P1=$!
pnpm exec wrangler dev -c wrangler.e2e.jsonc --port 4291 --ip 0.0.0.0 --local --persist-to .wrangler/e2e-dash --inspector-port 9332 --var VAMOS_SURFACE:auto > .wrangler/e2e-dash.log 2>&1 &
P2=$!
for _ in $(seq 40); do sleep 2; curl -s -o /dev/null http://localhost:4290/api/auth/session && curl -s -o /dev/null http://localhost:4291/api/auth/session && break; done
MAIL_ROOT="$WEB/.wrangler/tmp/email" OUT="$WEB/.wrangler/e2e-$LABEL.json" node "$TREE/apps/web/tests/e2e-worker/auth-worker.e2e.mjs" "$LABEL"
kill $P1 $P2 2>/dev/null
