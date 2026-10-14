#!/usr/bin/env bash
# Phase 32 plan 12: browser proof of the translate surfaces on the local Worker (lab p32). Local only, never live.
#   bash apps/web/tests/e2e-worker/translate-run.sh [--no-up]
# Starts (or reuses) lab p32, applies translate-seed.sql to the lab database, runs translate-browser.e2e.mjs in one
# Chromium lane, and writes everything to .planning/phases/32-auto-translate/evidence/browser.log ending with exit=<n>
# (/api statuses, no bodies, in browser-api.log). Run it detached:
#   nohup bash apps/web/tests/e2e-worker/translate-run.sh >/dev/null 2>&1 &
# One local Supabase stack on the Mac: hold ~/.vamos-scratch/stack.lock (the caller's lock script) before running,
# and destroy the lab and release the lock afterwards.
set -u
TREE=$(git rev-parse --show-toplevel) || exit 2
EV="$TREE/.planning/phases/32-auto-translate/evidence"
LOG="$EV/browser.log"
mkdir -p "$EV"
: > "$LOG"
: > "$EV/browser-api.log"
{
  echo "start $(date '+%F %T %z') | tree $TREE | head $(git -C "$TREE" rev-parse --short HEAD)"
  rc=0
  if [ "${1:-}" != "--no-up" ]; then
    bash "$TREE/scripts/test-lab/lab.sh" up p32 || rc=$?
  fi
  if [ "$rc" = 0 ]; then
    eval "$(bash "$TREE/scripts/test-lab/lab.sh" env p32)"
    if [ "${LAB_RUNTIME:-}" = native ]; then
      "$LAB_PSQL" "$LAB_DB_URL" -q -At -v ON_ERROR_STOP=1 -f "$TREE/apps/web/tests/e2e-worker/translate-seed.sql" || rc=$?
    else
      echo "FAIL | seed | lab p32 is not on the native runtime"; rc=1
    fi
  fi
  if [ "$rc" = 0 ]; then
    echo "seed applied $(date '+%T')"
    API_LOG="$EV/browser-api.log" node "$TREE/apps/web/tests/e2e-worker/translate-browser.e2e.mjs"; rc=$?
  fi
  echo "end $(date '+%F %T %z')"
  echo "exit=$rc"
} >> "$LOG" 2>&1
