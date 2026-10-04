#!/bin/zsh
# usage: q.sh <sql-file>   (lab database only, port 45122)
exec /Users/koss/.supabase/cache/stack/slim-services/postgres/17.11.0.002-r0/darwin-arm64/bin/psql "postgresql://postgres:postgres@127.0.0.1:45122/postgres" -f "$1"
