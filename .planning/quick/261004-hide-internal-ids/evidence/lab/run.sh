#!/bin/zsh
W=/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c
export LAB_NAME=hide-ids LAB_BASE=http://localhost:4710 LAB_DASH=http://dashboard.localhost:4711 LAB_FAKE=http://127.0.0.1:4717 LAB_DB_CONTAINER=supabase_db_vamos-lab-hide-ids LAB_RUNTIME=native
export LAB_DB_URL='postgresql://postgres:postgres@127.0.0.1:45122/postgres?connect_timeout=5'
export LAB_PSQL=/Users/koss/.supabase/cache/stack/slim-services/postgres/17.11.0.002-r0/darwin-arm64/bin/psql
export LAB_STATE=/Users/koss/.vamos-scratch/lab-hide-ids LAB_ADMIN_FILE=/Users/koss/.vamos-scratch/lab-hide-ids/admin.txt WEB_DIR=$W/apps/web
cd $W
exec "$@"
