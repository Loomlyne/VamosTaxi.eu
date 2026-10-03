#!/usr/bin/env bash
# Test lab: one command for a local copy of the site (own Supabase stack, built Worker, local stand-ins for
# Stripe / Mapbox / Turnstile / Resend). General form of apps/web/tests/e2e-worker/p6-run.sh.
#   lab.sh up <name> [--rebuild] [--no-dash]   lab.sh status <name>   lab.sh env <name>   lab.sh reseed <name>
#   lab.sh down <name>                          lab.sh destroy <name>  lab.sh gates [base]
# Local only. Never live. Amounts in the lab copy are stand-ins (seed-live-like.sql). No secret is printed.
# Never stops a process or stack it did not record; never kills by port or pattern.
set -u

TREE=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "FAIL | lab | not inside a git tree"; exit 2; }
WEB="$TREE/apps/web"
LABHOME=${VAMOS_LAB_HOME:-$HOME/.vamos-scratch}
HERE="$TREE/scripts/test-lab"

fail() { echo "FAIL | lab | $*"; exit 1; }
note() { echo "... $*"; }

# ---- naming and state -------------------------------------------------------------------------------------------
need_name() {
  NAME=${1:-}
  [[ "$NAME" =~ ^[a-z0-9-]{1,24}$ ]] || fail "name must match ^[a-z0-9-]{1,24}\$ (got '${NAME}')"
  STATE="$LABHOME/lab-$NAME"
  SB="$STATE/sb"
  PIDS="$STATE/pids"
  PROJECT="vamos-lab-$NAME"
  DBC="supabase_db_$PROJECT"
}
load_env() { [ -f "$STATE/lab.env" ] && . "$STATE/lab.env"; }

# Slot n (1..9): Supabase 45n20..45n29, edge inspector 83n3, Worker public 47n0, dashboard 47n1, fakes 47n7, inspectors 97n1, 97n2.
set_ports() {
  local n=$1
  SLOT=$n
  SB_SHADOW=$((45000 + n * 100 + 20)); SB_API=$((45000 + n * 100 + 21)); SB_DB=$((45000 + n * 100 + 22))
  SB_STUDIO=$((45000 + n * 100 + 23)); SB_SMTP=$((45000 + n * 100 + 24)); SB_ANALYTICS=$((45000 + n * 100 + 27))
  SB_POOLER=$((45000 + n * 100 + 29)); SB_EDGE=$((8300 + n * 10 + 3))
  PUB=$((4700 + n * 10)); DASH=$((4700 + n * 10 + 1)); FAKE=$((4700 + n * 10 + 7))
  INSP=$((9700 + n * 10 + 1)); INSP_DASH=$((9700 + n * 10 + 2))
}
port_busy() { lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1; }
worker_ports() { echo "$PUB $DASH $FAKE $INSP $INSP_DASH"; }
stack_ports() { echo "$SB_SHADOW $SB_API $SB_DB $SB_STUDIO $SB_SMTP $SB_ANALYTICS $SB_POOLER $SB_EDGE"; }
busy_of() { local p b=""; for p in "$@"; do port_busy "$p" && b="$b $p"; done; echo "$b"; }

slot_taken_by_other() { # other lab names that own slot $1
  local d
  for d in "$LABHOME"/lab-*; do
    [ -f "$d/lab.env" ] || continue
    [ "$d" = "$STATE" ] && continue
    if grep -q "^LAB_SLOT=$1\$" "$d/lab.env"; then return 0; fi
  done
  return 1
}
pick_slot() {
  local n want=${LAB_SLOT:-}
  for n in 1 2 3 4 5 6 7 8 9; do
    [ -n "$want" ] && [ "$want" != "$n" ] && continue
    slot_taken_by_other "$n" && continue
    set_ports "$n"
    [ -z "$(busy_of $(worker_ports) $(stack_ports))" ] && return 0
  done
  return 1
}

alive() { kill -0 "$1" 2>/dev/null; }
kill_tree() { # same as p6-run.sh: a recorded PID and its whole process tree, never by port or pattern
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done
  kill "$1" 2>/dev/null
}
stop_services() {
  if [ -f "$PIDS" ]; then
    local p
    for p in $(cat "$PIDS"); do kill_tree "$p"; done
    rm -f "$PIDS"
    sleep 2
  fi
}
hash_cfg() { cat "$WEB/wrangler.e2e.jsonc" "$WEB/.dev.vars" 2>/dev/null | shasum -a 256 | cut -d' ' -f1; }

stack_running() { [ "$(docker inspect -f '{{.State.Running}}' "$DBC" 2>/dev/null)" = "true" ]; }
sb_cli() { (cd "$TREE" && pnpm exec supabase "$@" --workdir "$SB"); }

# The workdir symlinks must point into this tree and the project id must be this lab's own: nothing else is ever
# started, reset or stopped.
check_own_stack() {
  local x
  [ -f "$SB/supabase/config.toml" ] || return 0
  grep -q "^project_id = \"$PROJECT\"" "$SB/supabase/config.toml" || fail "$SB/supabase/config.toml is not project $PROJECT: not this lab's stack"
  for x in migrations tests seed.sql; do
    [ "$(readlink "$SB/supabase/$x" 2>/dev/null)" = "$TREE/packages/db/supabase/$x" ] \
      || fail "$SB/supabase/$x does not point into this tree ($TREE): another tree's lab, refusing"
  done
}

# ---- stack workdir ----------------------------------------------------------------------------------------------
make_workdir() {
  [ -f "$SB/supabase/config.toml" ] && return 0
  mkdir -p "$SB/supabase"
  local cfg="$SB/supabase/config.toml"
  sed -e "s/^project_id = .*/project_id = \"$PROJECT\"/" \
      -e "s/54320/$SB_SHADOW/g" -e "s/54321/$SB_API/g" -e "s/54322/$SB_DB/g" -e "s/54323/$SB_STUDIO/g" \
      -e "s/54324/$SB_SMTP/g" -e "s/54327/$SB_ANALYTICS/g" -e "s/54329/$SB_POOLER/g" \
      -e "s/^inspector_port = .*/inspector_port = $SB_EDGE/" \
      "$TREE/packages/db/supabase/config.toml" \
    | awk -v pub="$PUB" '{print} /^additional_redirect_urls = \[/{print "  \"http://localhost:" pub "/**\","}' > "$cfg"
  umask 077
  [ -f "$STATE/hook-secret" ] || printf 'v1,whsec_%s\n' "$(openssl rand -base64 32)" > "$STATE/hook-secret"
  umask 022
  {
    echo
    echo "[auth.hook.send_email]"
    echo "enabled = true"
    echo "uri = \"http://host.docker.internal:$PUB/api/auth/email-hook\""
    echo "secrets = \"$(tr -d '\n' < "$STATE/hook-secret")\""
  } >> "$cfg"
  chmod 600 "$cfg"
  ln -s "$TREE/packages/db/supabase/migrations" "$SB/supabase/migrations"
  ln -s "$TREE/packages/db/supabase/tests" "$SB/supabase/tests"
  ln -s "$TREE/packages/db/supabase/seed.sql" "$SB/supabase/seed.sql"
}

psql_lab() { docker exec -i "$DBC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 "$@"; }

write_sb_env() {
  umask 077
  (cd "$TREE" && pnpm exec supabase status -o env --workdir "$SB" 2>/dev/null | grep '^[A-Z_]*=' > "$STATE/sb.env")
  chmod 600 "$STATE/sb.env"
  umask 022
  grep -q '^SERVICE_ROLE_KEY=' "$STATE/sb.env" || fail "the stack $PROJECT gave no keys (is it running?)"
}

# ---- data steps (idempotent) ------------------------------------------------------------------------------------
seed_live_like() {
  note "seed-live-like.sql (lab copy only)"
  psql_lab -q < "$HERE/seed-live-like.sql" >/dev/null || fail "seed-live-like.sql failed on $DBC"
  touch "$STATE/seeded"
}
set_roles() {
  # mkcfg.mjs writes postgres://vamos_public:vamos_public@... and vamos_edge:vamos_edge@...
  psql_lab -q -c "alter role vamos_public with login password 'vamos_public'; alter role vamos_edge with login password 'vamos_edge';" >/dev/null \
    || fail "could not set the vamos_public / vamos_edge passwords on $DBC"
  # marker role the repo's local tests look for (scripts/mark-test-stack.mjs does the same on a loopback database)
  psql_lab -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='vamos_throwaway_test_stack') then create role vamos_throwaway_test_stack nologin; end if; end \$\$; comment on role vamos_throwaway_test_stack is 'throwaway test stack marker - never on a hosted project';" >/dev/null \
    || fail "could not create the marker role on $DBC"
}
make_admin() {
  local email="lab-admin@vamos.local" uid exists
  exists=$(psql_lab -c "select id from auth.users where email='$email'")
  if [ -n "$exists" ] && [ -f "$STATE/admin.txt" ]; then uid=$exists; else
    umask 077
    printf '%s\n' "$(openssl rand -base64 18 | tr -d '/+=')" > "$STATE/admin.pw"
    umask 022
    uid=$(LAB_EMAIL="$email" LAB_EXISTS="$exists" LAB_STATE="$STATE" node -e '
      const fs=require("fs");
      const env=Object.fromEntries(fs.readFileSync(process.env.LAB_STATE+"/sb.env","utf8").split("\n").filter(Boolean).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
      const pw=fs.readFileSync(process.env.LAB_STATE+"/admin.pw","utf8").trim();
      const h={apikey:env.SERVICE_ROLE_KEY,authorization:"Bearer "+env.SERVICE_ROLE_KEY,"content-type":"application/json"};
      const id=process.env.LAB_EXISTS;
      (async()=>{
        const r=await fetch(env.API_URL+"/auth/v1/admin/users"+(id?"/"+id:""),{method:id?"PUT":"POST",headers:h,body:JSON.stringify({email:process.env.LAB_EMAIL,password:pw,email_confirm:true})});
        const j=await r.json();
        if(r.status>=300){console.error("admin user "+r.status);process.exit(1)}
        console.log(j.id||id);
      })();') || fail "could not make the dashboard admin user"
    {
      echo "email=$email"
      echo "password=$(cat "$STATE/admin.pw")"
    } > "$STATE/admin.txt"
    chmod 600 "$STATE/admin.txt"
    rm -f "$STATE/admin.pw"
  fi
  psql_lab -q -c "insert into public.staff (user_id, role, full_name, accepted_at) select '$uid', 'admin', 'Lab Admin', now() where not exists (select 1 from public.staff where user_id='$uid')" >/dev/null \
    || fail "could not make the staff row for the lab admin"
}
data_steps() { seed_live_like; set_roles; make_admin; }

# ---- build and patch --------------------------------------------------------------------------------------------
newest_source_mtime() {
  local m
  if stat -f %m / >/dev/null 2>&1; then m='stat -f %m'; else m='stat -c %Y'; fi
  (cd "$TREE" && git ls-files -z -c -o --exclude-standard -- apps/web app packages package.json pnpm-lock.yaml 2>/dev/null \
     | xargs -0 $m 2>/dev/null | sort -n | tail -1)
}
needs_build() { # prints the reason, returns 0 when a build is needed
  local w="$WEB/.open-next/worker.js" wm sm
  [ -f "$w" ] || { echo "worker.js is missing"; return 0; }
  if stat -f %m / >/dev/null 2>&1; then wm=$(stat -f %m "$w"); else wm=$(stat -c %Y "$w"); fi
  sm=$(newest_source_mtime)
  [ -n "$sm" ] && [ "$sm" -gt "$wm" ] && { echo "sources are newer than worker.js"; return 0; }
  return 1
}
patch_worker() {
  local w="$WEB/.open-next/worker.js" cur
  if head -1 "$w" | grep -q "E2E_FETCH_PATCH P6"; then
    cur=$(head -1 "$w" | sed -n 's#.*http://127\.0\.0\.1:\([0-9]*\)"+m.*#\1#p')
    [ "$cur" = "$FAKE" ] && { note "worker.js already patched for fakes port $FAKE"; return 0; }
    fail "worker.js is patched for fakes port ${cur:-?}, this lab needs $FAKE: run 'lab.sh up $NAME --rebuild'"
  fi
  { printf '/*E2E_FETCH_PATCH P6*/const __e2eF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"/__stripe","challenges.cloudflare.com":"/__turnstile","api.mapbox.com":"/__mapbox","api.resend.com":"/__resend"}[u.hostname];if(m){const n="http://127.0.0.1:%s"+m+u.pathname+u.search;return __e2eF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __e2eF(i,o)};\n' "$FAKE"; cat "$w"; } > "$w.lab" && mv "$w.lab" "$w"
  note "worker.js patched for fakes port $FAKE (build output only)"
}

# ---- subcommands ------------------------------------------------------------------------------------------------
cmd_up() {
  need_name "${1:-}"; shift
  local rebuild=0 dash=1 a
  for a in "$@"; do case "$a" in --rebuild) rebuild=1;; --no-dash) dash=0;; *) fail "unknown option $a";; esac; done
  mkdir -p "$STATE/logs"
  if [ -f "$STATE/lab.env" ]; then
    load_env; set_ports "$LAB_SLOT"
    [ "${LAB_TREE:-}" = "$TREE" ] || fail "lab $NAME belongs to another tree (${LAB_TREE:-?}); use another name or destroy it from there"
  else
    pick_slot || fail "no free slot in 1..9 (ports busy or slots held by other labs)"
  fi
  # Two labs of one tree would overwrite each other's wrangler.e2e.jsonc and .dev.vars.
  local d p
  for d in "$LABHOME"/lab-*; do
    [ -f "$d/lab.env" ] || continue
    [ "$d" = "$STATE" ] && continue
    grep -q "^LAB_TREE=$TREE\$" "$d/lab.env" || continue
    [ -s "$d/pids" ] || continue
    for p in $(cat "$d/pids"); do
      alive "$p" && fail "lab $(basename "$d") already runs from this tree and shares its wrangler config files: down it first"
    done
  done
  stop_services  # a re-run restarts this lab's own Workers (recorded PIDs only)
  local busy; busy=$(busy_of $(worker_ports))
  [ -z "$busy" ] || fail "port(s)$busy busy (not started by this lab): choose another slot with LAB_SLOT=<n>"
  if ! stack_running; then
    busy=$(busy_of $(stack_ports))
    [ -z "$busy" ] || fail "port(s)$busy busy (not this lab's stack): choose another slot with LAB_SLOT=<n>"
  fi
  make_workdir; check_own_stack
  {
    echo "LAB_NAME=$NAME"; echo "LAB_SLOT=$SLOT"; echo "LAB_TREE=$TREE"
    echo "LAB_PUB=$PUB"; echo "LAB_DASH_PORT=$DASH"; echo "LAB_FAKE_PORT=$FAKE"; echo "LAB_INSPECT=$INSP"; echo "LAB_INSPECT_DASH=$INSP_DASH"
    echo "LAB_SB_API=$SB_API"; echo "LAB_SB_DB=$SB_DB"; echo "LAB_DB_CONTAINER=$DBC"
  } > "$STATE/lab.env"

  if stack_running; then note "stack $PROJECT already running"; else
    note "supabase start ($PROJECT, api $SB_API, db $SB_DB); log $STATE/logs/supabase-start.log"
    sb_cli start > "$STATE/logs/supabase-start.log" 2>&1 || { tail -5 "$STATE/logs/supabase-start.log"; fail "supabase start failed (log $STATE/logs/supabase-start.log)"; }
  fi
  write_sb_env
  if [ ! -f "$STATE/seeded" ]; then data_steps; else set_roles; make_admin; fi

  note "sync-dc-mock-to-public"
  (cd "$TREE" && node scripts/sync-dc-mock-to-public.mjs >/dev/null) || fail "sync-dc-mock-to-public failed"
  local why="--rebuild" build=1
  [ "$rebuild" = 1 ] || { why=$(needs_build) || build=0; }
  if [ "$build" = 1 ]; then
    note "build: needed ($why); log $STATE/logs/build.log"
    (cd "$TREE" && pnpm --filter web exec opennextjs-cloudflare build > "$STATE/logs/build.log" 2>&1) \
      || { tail -15 "$STATE/logs/build.log"; fail "build failed (log $STATE/logs/build.log)"; }
  else
    note "build: skipped (worker.js is current)"
  fi
  patch_worker

  # mkcfg takes the API and DB ports from the environment
  SB_API_PORT=$SB_API SB_DB_PORT=$SB_DB node "$WEB/tests/e2e-worker/mkcfg.mjs" "$WEB" "$STATE/sb.env" "$STATE/hook-secret" p6 \
    || fail "mkcfg.mjs failed"
  # Without VAMOS_QS_SECRET no visitor cookie is minted and every quote call falls into the 4-a-minute bare-IP bucket:
  # home -> /checkout -> voucher -> PAY then hits 429. With it the real 8-a-minute verified bucket applies, as live.
  grep -q '^VAMOS_QS_SECRET=' "$WEB/.dev.vars" || printf 'VAMOS_QS_SECRET="lab-local-qs-secret-0123456789abcdef"\n' >> "$WEB/.dev.vars"
  hash_cfg > "$STATE/cfg.sha"

  cd "$WEB" || fail "no $WEB"
  rm -rf ".wrangler/lab-$NAME" ".wrangler/lab-$NAME-dash"
  : > "$PIDS"
  E2E_FAKE_PORT=$FAKE nohup node tests/e2e-worker/fakes.mjs > "$STATE/logs/fakes.log" 2>&1 &
  echo $! >> "$PIDS"
  nohup pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$PUB" --ip 0.0.0.0 --local --persist-to ".wrangler/lab-$NAME" --inspector-port "$INSP" > "$STATE/logs/public.log" 2>&1 &
  echo $! >> "$PIDS"
  if [ "$dash" = 1 ]; then
    nohup pnpm exec wrangler dev -c wrangler.e2e.jsonc --port "$DASH" --ip 0.0.0.0 --local --persist-to ".wrangler/lab-$NAME-dash" --inspector-port "$INSP_DASH" --var VAMOS_SURFACE:auto > "$STATE/logs/dashboard.log" 2>&1 &
    echo $! >> "$PIDS"
  fi
  local ready=0 i
  for i in $(seq 60); do
    sleep 2
    if curl -s -o /dev/null "http://localhost:$PUB/api/auth/session" \
       && { [ "$dash" = 0 ] || curl -s -o /dev/null "http://localhost:$DASH/api/auth/session"; } \
       && curl -s -o /dev/null "http://127.0.0.1:$FAKE/__stats"; then ready=1; break; fi
  done
  if [ "$ready" != 1 ]; then
    stop_services
    fail "the Workers did not come up in 120 s (logs $STATE/logs/public.log, dashboard.log, fakes.log)"
  fi
  echo "up | public http://localhost:$PUB | dashboard http://dashboard.localhost:$DASH | fakes http://127.0.0.1:$FAKE | db $DBC | state $STATE"
}

cmd_status() {
  need_name "${1:-}"
  [ -f "$STATE/lab.env" ] || fail "no lab named $NAME ($STATE)"
  load_env; set_ports "$LAB_SLOT"
  echo "lab $NAME | slot $SLOT | tree $LAB_TREE"
  echo "ports | public $PUB | dashboard $DASH | fakes $FAKE | inspectors $INSP $INSP_DASH | supabase api $SB_API db $SB_DB shadow $SB_SHADOW"
  local p n=0 live=0
  if [ -f "$PIDS" ]; then for p in $(cat "$PIDS"); do n=$((n+1)); alive "$p" && live=$((live+1)); done; fi
  echo "pids | $live of $n alive"
  if stack_running; then echo "stack | running ($DBC)"; else echo "stack | not running ($DBC)"; fi
  local u
  for u in "http://localhost:$PUB/api/auth/session" "http://127.0.0.1:$FAKE/__stats"; do
    echo "http | $u | $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$u")"
  done
}

cmd_env() {
  need_name "${1:-}"
  [ -f "$STATE/lab.env" ] || fail "no lab named $NAME ($STATE)"
  load_env
  printf 'export LAB_NAME=%q\n' "$NAME"
  printf 'export LAB_BASE=%q\n' "http://localhost:$LAB_PUB"
  printf 'export LAB_DASH=%q\n' "http://dashboard.localhost:$LAB_DASH_PORT"
  printf 'export LAB_FAKE=%q\n' "http://127.0.0.1:$LAB_FAKE_PORT"
  printf 'export LAB_DB_CONTAINER=%q\n' "$LAB_DB_CONTAINER"
  printf 'export LAB_STATE=%q\n' "$STATE"
  printf 'export LAB_ADMIN_FILE=%q\n' "$STATE/admin.txt"
  printf 'export WEB_DIR=%q\n' "$LAB_TREE/apps/web"
}

cmd_reseed() {
  need_name "${1:-}"
  [ -f "$STATE/lab.env" ] || fail "no lab named $NAME ($STATE)"
  load_env; set_ports "$LAB_SLOT"
  check_own_stack
  stack_running || fail "stack $PROJECT is not running: lab.sh up $NAME first"
  note "supabase db reset (own workdir $SB)"
  sb_cli db reset > "$STATE/logs/reset.log" 2>&1 || { tail -5 "$STATE/logs/reset.log"; fail "db reset failed (log $STATE/logs/reset.log)"; }
  rm -f "$STATE/seeded" "$STATE/admin.txt"
  write_sb_env
  data_steps
  echo "PASS | reseed | $NAME reseeded; restart the Workers if they hold open connections: lab.sh up $NAME"
}

cmd_down() {
  need_name "${1:-}"
  [ -f "$STATE/lab.env" ] || fail "no lab named $NAME ($STATE)"
  load_env
  stop_services
  if [ -f "$STATE/cfg.sha" ] && [ "$(cat "$STATE/cfg.sha")" = "$(hash_cfg)" ]; then
    rm -f "$WEB/wrangler.e2e.jsonc" "$WEB/.dev.vars"
    note "removed wrangler.e2e.jsonc and .dev.vars (written by this lab)"
  else
    note "left wrangler.e2e.jsonc / .dev.vars (not written by this lab, or changed since)"
  fi
  echo "PASS | down | $NAME Workers and fakes stopped; stack $PROJECT left running (destroy removes it)"
}

cmd_destroy() {
  need_name "${1:-}"
  [ -f "$STATE/lab.env" ] || fail "no lab named $NAME ($STATE)"
  load_env
  check_own_stack
  cmd_down "$NAME" >/dev/null
  sb_cli stop --no-backup > "$STATE/logs/stop.log" 2>&1 || { tail -5 "$STATE/logs/stop.log"; fail "supabase stop failed (log $STATE/logs/stop.log)"; }
  case "$STATE" in "$LABHOME"/lab-?*) rm -rf "$STATE";; *) fail "refusing to delete $STATE";; esac
  echo "PASS | destroy | $NAME stack and state removed"
}

# ---- gates ------------------------------------------------------------------------------------------------------
GATE_FAIL=0
gate() { # gate <name> <cmd...>
  local name=$1 out rc; shift
  out=$("$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    echo "PASS | $name | $(printf '%s' "$out" | grep -v '^\s*$' | tail -1 | cut -c1-160)"
  else
    GATE_FAIL=1
    echo "FAIL | $name | $(printf '%s' "$out" | grep -v '^\s*$' | head -3 | tr '\n' ' ' | cut -c1-300)"
  fi
}
cmd_gates() {
  cd "$TREE" || exit 2
  local base=${1:-}
  [ -n "$base" ] || base=$(git merge-base HEAD origin/main 2>/dev/null) || fail "no merge-base with origin/main; pass a base"
  local changed
  changed=$( { git diff --name-only --diff-filter=ACMR "$base" 2>/dev/null; git ls-files -o --exclude-standard; } | sort -u)
  gate typecheck pnpm -s typecheck
  local js; js=$(printf '%s\n' "$changed" | grep -E '\.(ts|tsx|js|mjs)$' | while read -r f; do [ -f "$f" ] && echo "$f"; done)
  if [ -n "$js" ]; then gate eslint bash -c "pnpm exec eslint $(printf '%s ' $js) && echo \"$(printf '%s\n' $js | wc -l | tr -d ' ') changed files clean\""; else echo "PASS | eslint | no changed ts/tsx/js/mjs files"; fi
  gate i18n:check pnpm -s i18n:check
  gate check:numbers pnpm -s check:numbers
  gate check:db-fences pnpm -s check:db-fences
  gate check:legal-claims pnpm -s check:legal-claims
  local pkg files rel
  for pkg in apps/web packages/*; do
    [ -f "$pkg/vitest.config.ts" ] || continue
    files=$(printf '%s\n' "$changed" | grep -E "^$pkg/.*\.(ts|tsx|js|mjs)\$" | grep -v '\.local\.test\.ts$' | sed "s#^$pkg/##")
    [ -n "$files" ] || continue
    [ "$pkg" = apps/web ] && node scripts/sync-dc-mock-to-public.mjs >/dev/null 2>&1
    gate "vitest:$pkg" bash -c "cd '$pkg' && pnpm exec vitest related --run --passWithNoTests --exclude '**/*.local.test.ts' $(printf '%s ' $files)"
  done
  [ $GATE_FAIL -eq 0 ]
}

case "${1:-}" in
  up) shift; cmd_up "$@";;
  status) shift; cmd_status "$@";;
  env) shift; cmd_env "$@";;
  reseed) shift; cmd_reseed "$@";;
  down) shift; cmd_down "$@";;
  destroy) shift; cmd_destroy "$@";;
  gates) shift; cmd_gates "$@";;
  *) echo "usage: lab.sh up <name> [--rebuild] [--no-dash] | status|env|reseed|down|destroy <name> | gates [base]"; exit 2;;
esac
