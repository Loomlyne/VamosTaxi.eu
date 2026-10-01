#!/bin/sh
# e2e-linux-3: stand-in for node_modules/.bin/next that keeps the dev server's output. Specs start `next dev`
# with stdio "ignore", so a server that exits or hangs at start-up leaves nothing to read. server-harness.ts
# points NEXT_BIN here when VAMOS_DEV_LOG_DIR is set (the Linux e2e workflow sets it); the output, the
# arguments and the exit code go to $VAMOS_DEV_LOG_DIR/next-<port>-<pid>.log. Behaviour is otherwise the same.
REAL="$(dirname "$0")/../../node_modules/.bin/next"
port=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-p" ] || [ "$prev" = "--port" ]; then port="$a"; fi
  prev="$a"
done
mkdir -p "$VAMOS_DEV_LOG_DIR"
LOG="$VAMOS_DEV_LOG_DIR/next-${port:-x}-$$.log"
echo "# $(date -u +%FT%TZ) pid $$ next $*" >> "$LOG"
"$REAL" "$@" >> "$LOG" 2>&1
code=$?
echo "# $(date -u +%FT%TZ) exit $code" >> "$LOG"
exit $code
