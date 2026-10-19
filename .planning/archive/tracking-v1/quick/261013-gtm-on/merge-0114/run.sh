#!/bin/zsh
# GA4/GTM branch after merging main: full gate, then pgTAP on one native lab stack. Holds the Mac stack lock.
W=/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/ga4-gtm
D=$W/.planning/quick/261013-gtm-on/merge-0114
cd $W
until mkdir ~/.vamos-scratch/stack.lock 2>/dev/null; do echo "waiting for stack lock $(date +%T)"; sleep 30; done
echo "ga4-gtm tracking session gate $(date)" > ~/.vamos-scratch/stack.lock/owner
trap 'scripts/test-lab/lab.sh destroy gtmmerge >/dev/null 2>&1; rm -rf ~/.vamos-scratch/stack.lock' EXIT
node scripts/sync-dc-mock-to-public.mjs
pnpm gate:local > $D/gate.log 2>&1; echo "exit=$?" >> $D/gate.log
scripts/test-lab/lab.sh up gtmmerge --no-dash > $D/pgtap.log 2>&1 && scripts/test-lab/lab.sh pgtap gtmmerge >> $D/pgtap.log 2>&1; echo "exit=$?" >> $D/pgtap.log
rm -rf apps/web/.open-next
echo "all-done $(date)"
