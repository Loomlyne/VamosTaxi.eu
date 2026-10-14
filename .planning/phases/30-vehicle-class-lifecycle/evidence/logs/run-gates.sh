#!/bin/bash
# Phase 30 full gates, run once (30-10 Task 2). Each step writes its own log ending in an exit= line.
cd /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/phase-30-vehicle-class-lifecycle || exit 1
L=.planning/phases/30-vehicle-class-lifecycle/evidence/logs
step() { name=$1; shift; echo "start $(date '+%F %T %z') $*" > "$L/$name.log"; "$@" >> "$L/$name.log" 2>&1; rc=$?; echo "exit=$rc $(date '+%F %T %z')" >> "$L/$name.log"; echo "$name exit=$rc" >> "$L/summary.log"; }
: > "$L/summary.log"
step pgtap bash scripts/test-lab/lab.sh pgtap p30
step gate pnpm gate:local
step vitest-extra bash -c 'node scripts/sync-dc-mock-to-public.mjs && cd apps/web && ./node_modules/.bin/vitest run lib/ops/ops-dc-arabic-count-lines.test.ts lib/ops/ops-pricing-tabs.test.ts'
step opennext bash -c 'cd apps/web && node ../../scripts/sync-dc-mock-to-public.mjs && ./node_modules/.bin/opennextjs-cloudflare build'
echo "all-done $(date '+%F %T %z')" >> "$L/summary.log"
