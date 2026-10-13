#!/bin/bash
# Phase 30 full gates in a clean clone of the branch (own lockfile install, no symlinked node_modules).
L="$(cd "$(dirname "$0")" && pwd)"
C="$HOME/.vamos-scratch/p30-clean"
SHA="$1"
step() { name=$1; shift; echo "start $(date '+%F %T %z') $*" > "$L/$name.log"; "$@" >> "$L/$name.log" 2>&1; rc=$?; echo "exit=$rc $(date '+%F %T %z')" >> "$L/$name.log"; echo "$name exit=$rc" >> "$L/summary.log"; return $rc; }
: > "$L/summary.log"
echo "clone $C at $SHA" >> "$L/summary.log"
step clone bash -c "rm -rf '$C' && git clone -q --no-local /Users/koss/Developer/VamosTaxi.eu '$C' && cd '$C' && git checkout -q '$SHA' && git log -1 --format='%h %s'" || { echo "all-done $(date '+%F %T %z')" >> "$L/summary.log"; exit 1; }
cd "$C"
step install env CI=true pnpm install --frozen-lockfile || { echo "all-done $(date '+%F %T %z')" >> "$L/summary.log"; exit 1; }
step sync node scripts/sync-dc-mock-to-public.mjs
step gate pnpm gate:local
step vitest-extra bash -c 'cd apps/web && ./node_modules/.bin/vitest run lib/ops/ops-dc-arabic-count-lines.test.ts lib/ops/ops-pricing-tabs.test.ts'
step opennext bash -c 'cd apps/web && ./node_modules/.bin/opennextjs-cloudflare build'
echo "all-done $(date '+%F %T %z')" >> "$L/summary.log"
