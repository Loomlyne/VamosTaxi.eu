#!/bin/zsh
cd /Users/koss/.vamos-scratch/p30-clean && eval "$(scripts/test-lab/lab.sh env p30c)"
EV=/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/phase-30-vehicle-class-lifecycle/.planning/phases/30-vehicle-class-lifecycle/evidence/lab/run2
cd $EV && node "$1" $EV "${@:2}"
