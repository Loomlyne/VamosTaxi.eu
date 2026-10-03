#!/usr/bin/env bash
# Quick 261003 quote-guards-live: (re)start the lab "guards" Worker with a chosen Turnstile / visitor-cookie setup.
#   worker.sh start   QS=1|0  TS_SECRET=pass|fail|none  SITEKEY=pass|block|interactive  [DASH=1: dashboard Worker too]
#   worker.sh stop
# Needs `scripts/test-lab/lab.sh up guards --no-dash` once (stack, build, worker.js patch), then `lab.sh down guards`.
# Starts only its own processes (PIDs in $STATE/qg-pids) and stops only those; never by port or pattern.
# Turnstile keys are Cloudflare's PUBLIC test keys (docs: developers.cloudflare.com/turnstile/troubleshooting/testing).
set -u
TREE=$(git rev-parse --show-toplevel)
WEB="$TREE/apps/web"
STATE="$HOME/.vamos-scratch/lab-guards"
PIDS="$STATE/qg-pids"
HERE="$TREE/.planning/quick/261003-quote-guards-live/tools"
. "$STATE/lab.env"

kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null; }
stop() { [ -f "$PIDS" ] && { for p in $(cat "$PIDS"); do kill_tree "$p"; done; rm -f "$PIDS"; sleep 2; }; }

case "${1:-}" in
stop) stop; echo "stopped"; exit 0;;
start) ;;
*) echo "usage: worker.sh start|stop"; exit 2;;
esac

stop
for p in "$LAB_PUB" "$LAB_FAKE_PORT" 4719 "$LAB_INSPECT" "$LAB_DASH_PORT" "$LAB_INSPECT_DASH"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN -t >/dev/null 2>&1; then echo "FAIL port $p busy (not ours)"; exit 1; fi
done

SB_API_PORT=$LAB_SB_API SB_DB_PORT=$LAB_SB_DB node "$WEB/tests/e2e-worker/mkcfg.mjs" "$WEB" "$STATE/sb.env" "$STATE/hook-secret" p6
# mkcfg wrote TURNSTILE_* stand-ins; replace them with the chosen public test keys.
grep -v -E '^(TURNSTILE_SECRET_KEY|TURNSTILE_SITE_KEY|TURNSTILE_SECRET|VAMOS_QS_SECRET)=' "$WEB/.dev.vars" > "$WEB/.dev.vars.qg"
case "${SITEKEY:-pass}" in
  pass) echo 'TURNSTILE_SITE_KEY="1x00000000000000000000AA"' >> "$WEB/.dev.vars.qg";;
  block) echo 'TURNSTILE_SITE_KEY="2x00000000000000000000AB"' >> "$WEB/.dev.vars.qg";;
  interactive) echo 'TURNSTILE_SITE_KEY="3x00000000000000000000FF"' >> "$WEB/.dev.vars.qg";;
esac
case "${TS_SECRET:-pass}" in
  pass) echo 'TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"' >> "$WEB/.dev.vars.qg";;
  fail) echo 'TURNSTILE_SECRET_KEY="2x0000000000000000000000000000000AA"' >> "$WEB/.dev.vars.qg";;
  none) ;;
esac
[ "${QS:-1}" = "1" ] && echo 'VAMOS_QS_SECRET="lab-local-qs-secret-0123456789abcdef"' >> "$WEB/.dev.vars.qg"
mv "$WEB/.dev.vars.qg" "$WEB/.dev.vars"; chmod 600 "$WEB/.dev.vars"
echo "config | QS=${QS:-1} TS_SECRET=${TS_SECRET:-pass} SITEKEY=${SITEKEY:-pass}"

cd "$WEB" || exit 1
rm -rf ".wrangler/lab-guards"   # fresh KV (Turnstile attempt counter) and rate-limit state per start
: > "$PIDS"
E2E_FAKE_PORT=4719 nohup node tests/e2e-worker/fakes.mjs > "$STATE/logs/qg-fakes.log" 2>&1 &
echo $! >> "$PIDS"
PROXY_PORT=$LAB_FAKE_PORT FAKES_PORT=4719 PROXY_LOG="$STATE/logs/qg-proxy.log" nohup node "$HERE/ts-proxy.mjs" > "$STATE/logs/qg-proxy.out" 2>&1 &
echo $! >> "$PIDS"
nohup pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$LAB_PUB" --ip 0.0.0.0 --local --persist-to ".wrangler/lab-guards" --inspector-port "$LAB_INSPECT" > "$STATE/logs/qg-public.log" 2>&1 &
echo $! >> "$PIDS"
if [ "${DASH:-0}" = "1" ]; then
  rm -rf ".wrangler/lab-guards-dash"
  nohup pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$LAB_DASH_PORT" --ip 0.0.0.0 --local --persist-to ".wrangler/lab-guards-dash" --inspector-port "$LAB_INSPECT_DASH" --var VAMOS_SURFACE:auto > "$STATE/logs/qg-dashboard.log" 2>&1 &
  echo $! >> "$PIDS"
fi
for i in $(seq 60); do
  sleep 2
  if curl -s -o /dev/null "http://localhost:$LAB_PUB/api/auth/session" && curl -s -o /dev/null "http://127.0.0.1:$LAB_FAKE_PORT/__stats"; then
    echo "up | http://localhost:$LAB_PUB"; exit 0
  fi
done
echo "FAIL | Worker did not come up (log $STATE/logs/qg-public.log)"; stop; exit 1
