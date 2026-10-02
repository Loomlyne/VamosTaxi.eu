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
# 26.0 checkout-reds: with --workers=2 two dev servers ran at once, and every spec that does not set its own
# TEST_DIST_DIR wrote the one apps/web/.next. A starting `next dev` clears that folder, so the other server lost its
# build files (ENOENT .next/routes-manifest.json, MODULE_NOT_FOUND, "invalid distance code" in the webpack cache
# in the Linux dev logs) and the specs on it failed one run and passed the next. Servers of one worker run one after
# another, so each worker (TEST_PARALLEL_INDEX, the same after a worker restart) gets its own folder; a spec's own
# TEST_DIST_DIR still wins. Build files and the webpack cache are kept between a worker's servers, as before.
if [ "$1" = "dev" ] && [ -z "${TEST_DIST_DIR:-}" ] && [ -n "${TEST_PARALLEL_INDEX:-}" ]; then
  TEST_DIST_DIR=".next-w${TEST_PARALLEL_INDEX}"
  export TEST_DIST_DIR
fi
mkdir -p "$VAMOS_DEV_LOG_DIR"
LOG="$VAMOS_DEV_LOG_DIR/next-${port:-x}-$$.log"
echo "# $(date -u +%FT%TZ) pid $$ next $*" >> "$LOG"
"$REAL" "$@" >> "$LOG" 2>&1
code=$?
echo "# $(date -u +%FT%TZ) exit $code" >> "$LOG"
exit $code
