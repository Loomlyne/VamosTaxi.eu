#!/bin/bash
# Holds the one-stack lock, runs gate:local then pgTAP, always releases the lock and destroys the lab stack.
cd /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/gtm-off || exit 1
D=.planning/quick/261015-gtm-off
mkdir -p ~/.vamos-scratch
until mkdir ~/.vamos-scratch/stack.lock 2>/dev/null; do sleep 30; done
echo "owner: gtm-off gate $$ $(date)" > ~/.vamos-scratch/stack.lock/owner
trap 'scripts/test-lab/lab.sh destroy gtmoff >/dev/null 2>&1; rm -rf ~/.vamos-scratch/stack.lock' EXIT
pnpm gate:local > $D/gate.log 2>&1; echo exit=$? >> $D/gate.log
scripts/test-lab/lab.sh up gtmoff --no-dash > $D/pgtap.log 2>&1 && scripts/test-lab/lab.sh pgtap gtmoff >> $D/pgtap.log 2>&1; echo exit=$? >> $D/pgtap.log
