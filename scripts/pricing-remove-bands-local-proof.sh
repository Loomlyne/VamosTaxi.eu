#!/usr/bin/env bash
# Local proof for docs/runbook/pricing-remove-bands-premiums.sql and Part B
# (packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql).
# Owner decisions 2026-10-13 items 10 and 13.
#
# LOCAL PROOF ONLY - NEVER ON LIVE. Refuses any database that is not a native lab on 127.0.0.1:45n22 carrying the
# throwaway marker role vamos_throwaway_test_stack. The controller runs the real script on live, on the owner's word.
#
# Usage: bash scripts/pricing-remove-bands-local-proof.sh [lab-name]      (default pricing-pol; native lab must be up)
#
# Order proved (runbook docs/runbook/pricing-remove-bands-premiums.md):
#   lab at the Part A schema (Part B held out of the tree for one `lab.sh reseed`)  ->  fixture: 20 km bands and 5
#   region % rows in two retired books, 0 rules  ->  (a) Part B refuses, nothing applied  ->  (a2) a wrong count makes
#   the script abort, nothing changed  ->  (b) the script runs: 20/5/0 deleted, backups 20/5/0, triggers on  ->
#   (c) a second run aborts, nothing changed  ->  (d) Part B applies; tables and surcharges.rule_id gone.
# On exit, whatever happened: Part B is back in the tree and the lab is reseeded to the full schema.
# Synthetic values only (per_km_rappen 1, percent 1); no amount is a price.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LAB="${1:-pricing-pol}"
SQL="$ROOT/docs/runbook/pricing-remove-bands-premiums.sql"
MIG="$ROOT/packages/db/supabase/migrations"
MB="20261012300000_pricing_drop_bands_premiums_rules.sql"

# ---- Local-only guard: nothing runs before this passes -------------------------------------------------------------
ENVOUT="$(scripts/test-lab/lab.sh env "$LAB")" || { echo "refusing: no lab named $LAB" >&2; exit 1; }
unset LAB_DB_URL LAB_PSQL
eval "$ENVOUT"
if [ -z "${LAB_DB_URL:-}" ] || ! printf '%s' "$LAB_DB_URL" | grep -Eq '@127\.0\.0\.1:45[0-9]22/'; then
  echo "refusing: database is not a native lab on 127.0.0.1:45n22 (got '${LAB_DB_URL:-}')" >&2; exit 1
fi
if [ -z "${LAB_PSQL:-}" ] || [ ! -x "$LAB_PSQL" ]; then
  echo "refusing: LAB_PSQL is not set (the proof runs on the native lab only)" >&2; exit 1
fi
psql_() { "$LAB_PSQL" "$LAB_DB_URL" -X -At -v ON_ERROR_STOP=1 "$@"; }
psql_ -c 'select 1' >/dev/null 2>&1 || { echo "refusing: lab $LAB is not running (scripts/test-lab/lab.sh up $LAB)" >&2; exit 1; }
[ "$(psql_ -c "select count(*) from pg_roles where rolname = 'vamos_throwaway_test_stack'")" = 1 ] \
  || { echo "refusing: marker role vamos_throwaway_test_stack is missing (not a throwaway lab)" >&2; exit 1; }
git diff --quiet HEAD -- "packages/db/supabase/migrations/$MB" && git ls-files --error-unmatch "packages/db/supabase/migrations/$MB" >/dev/null 2>&1 \
  || { echo "refusing: $MB has uncommitted changes or is not committed (it is moved out of the tree for one reseed)" >&2; exit 1; }

TMP="$(mktemp -d)"
HELD="$TMP/held"
FAILS=0
RESEED=0
pass() { echo "PASS | pricing proof | $1"; }
fail() { echo "FAIL | pricing proof | $1"; FAILS=$((FAILS + 1)); }

restore_file() {
  if [ -f "$HELD/$MB" ]; then mv "$HELD/$MB" "$MIG/$MB"; fi
  return 0
}

on_exit() {
  local code=$?
  restore_file
  if [ "$RESEED" = 1 ]; then
    scripts/test-lab/lab.sh reseed "$LAB" >"$TMP/reseed-full.log" 2>&1 \
      && echo "lab $LAB reseeded to the full schema (Part A + Part B)" \
      || { echo "WARNING: could not reseed lab $LAB to the full schema; run: scripts/test-lab/lab.sh reseed $LAB"; tail -3 "$TMP/reseed-full.log"; }
  fi
  rm -rf "$TMP"
  exit "$code"
}
trap on_exit EXIT

n() { psql_ -c "$1"; }
tables_exist() { [ "$(n "select (to_regclass('public.distance_bands') is not null)::int + (to_regclass('public.region_premiums') is not null)::int + (to_regclass('public.rate_version_rules') is not null)::int")" = 3 ]; }
has_rule_id() { [ "$(n "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'surcharges' and column_name = 'rule_id'")" = 1 ]; }
has_guard() { [ -n "$(n "select to_regproc('app.pricing_assert_bands_premiums_rules_gone')")" ]; }

# ---- Part A schema (Part B held out for one reseed) ----------------------------------------------------------------
mkdir -p "$HELD"
mv "$MIG/$MB" "$HELD/$MB"
RESEED=1   # from here the lab must be reseeded to the full schema at the end, whatever happens
scripts/test-lab/lab.sh reseed "$LAB" >"$TMP/reseed-pre.log" 2>&1 || { restore_file; tail -5 "$TMP/reseed-pre.log"; echo "refusing: reseed failed" >&2; exit 1; }
restore_file
cmp -s "$MIG/$MB" <(git show "HEAD:packages/db/supabase/migrations/$MB") || { fail "$MB differs from HEAD after restore"; exit 1; }
if tables_exist && has_rule_id && ! has_guard \
   && n "select pg_get_functiondef('public.tg_pricing_row_frozen()'::regprocedure)" | grep -q 'cannot leave a published rate_version'; then
  pass "lab $LAB is at the Part A schema (three tables and surcharges.rule_id present, lock check in place, no Part B guard)"
else fail "lab is not at the Part A schema"; exit 1; fi

# ---- Fixture: two retired synthetic books, 20 bands, 5 region % rows, 0 rules ---------------------------------------
# Rows are inserted while the books are drafts (no frozen trigger involved); then the books are set to retired with
# only rate_versions_transition switched off, by name, inside this lab transaction.
psql_ -q >/dev/null <<'SQL'
begin;
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('prb-proof', 3, 3);
insert into public.service_zones (slug, iata) values ('prb-z1', null), ('prb-z2', null), ('prb-z3', null);
insert into public.rate_versions (slug, label) values ('prb-ret-1', 'pricing proof retired 1'), ('prb-ret-2', 'pricing proof retired 2');
insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
select rv.id, vc.id, g, g + 1, 1
  from public.rate_versions rv, public.vehicle_classes vc, generate_series(0, 9) g
 where rv.slug in ('prb-ret-1', 'prb-ret-2') and vc.slug = 'prb-proof';
insert into public.region_premiums (rate_version_id, zone_id, percent)
select rv.id, z.id, 1
  from public.rate_versions rv, public.service_zones z
 where (rv.slug = 'prb-ret-1' and z.slug in ('prb-z1', 'prb-z2', 'prb-z3'))
    or (rv.slug = 'prb-ret-2' and z.slug in ('prb-z1', 'prb-z2'));
alter table public.rate_versions disable trigger rate_versions_transition;
update public.rate_versions set status = 'retired', published_at = now() where slug in ('prb-ret-1', 'prb-ret-2');
alter table public.rate_versions enable trigger rate_versions_transition;
commit;
SQL

COUNTS="$(n "select concat_ws('/', (select count(*) from public.distance_bands), (select count(*) from public.region_premiums), (select count(*) from public.rate_version_rules), (select count(*) from public.surcharges where rule_id is not null))")"
INRET="$(n "select count(*) from (select rate_version_id from public.distance_bands union all select rate_version_id from public.region_premiums) t join public.rate_versions rv on rv.id = t.rate_version_id where rv.status = 'retired'")"
if [ "$COUNTS" = "20/5/0/0" ] && [ "$INRET" = 25 ] \
   && [ "$(n "select tgenabled from pg_trigger where tgname = 'rate_versions_transition'")" = O ]; then
  pass "fixture: 20 bands, 5 region % rows (all 25 in retired books), 0 rules, 0 rule links"
else fail "fixture is not the expected shape (counts $COUNTS, in retired books $INRET)"; exit 1; fi

sig() {
  n "select md5(concat_ws('|',
    (select string_agg(id::text, ',' order by id) from public.distance_bands),
    (select string_agg(id::text, ',' order by id) from public.region_premiums),
    (select string_agg(id::text, ',' order by id) from public.rate_version_rules),
    (select string_agg(id::text || ':' || coalesce(rule_id::text, ''), ',' order by id) from public.surcharges),
    (select string_agg(tgname || tgenabled::text, ',' order by tgname) from pg_trigger
      where tgname like 'distance_bands_frozen%' or tgname like 'region_premiums_frozen%' or tgname like 'rate_version_rules_frozen%'),
    (select count(*)::text from pg_namespace where nspname = 'backup_pricing_20261014')))"
}
SIG0="$(sig)"

# ---- (a) Part B refuses while rows exist ---------------------------------------------------------------------------
OUT="$(psql_ -1 -f "$MIG/$MB" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'pricing-bands-premiums-rules-present: public.distance_bands' \
   && tables_exist && has_rule_id && ! has_guard && [ "$(sig)" = "$SIG0" ]; then
  pass "(a) Part B refuses with rows present (pricing-bands-premiums-rules-present); tables, rule_id and rows unchanged"
else fail "(a) Part B did not refuse: $(printf '%s' "$OUT" | tail -2)"; fi

# ---- (a2) a wrong expected count makes the script abort -------------------------------------------------------------
sed 's/^select 20::int as expected_bands,/select 21::int as expected_bands,/' "$SQL" >"$TMP/wrong-count.sql"
cmp -s "$SQL" "$TMP/wrong-count.sql" && { fail "sed did not change the expected count"; exit 1; }
awk '/^begin;$/{f=1} f{print} /^commit;$/{f=0}' "$TMP/wrong-count.sql" >"$TMP/wrong-step1.sql"
OUT="$(psql_ -f "$TMP/wrong-step1.sql" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'PRICING abort: 20 distance_bands rows found, expected 21. Nothing was changed.' && [ "$(sig)" = "$SIG0" ]; then
  pass "(a2) wrong-count abort: PRICING abort, nothing changed"
else fail "(a2) wrong-count abort: $(printf '%s' "$OUT" | tail -2)"; fi

# ---- (b) STEP 1 of the real file -------------------------------------------------------------------------------------
awk '/^begin;$/{f=1} f{print} /^commit;$/{f=0}' "$SQL" >"$TMP/step1.sql"
head -1 "$TMP/step1.sql" | grep -qx 'begin;' && tail -1 "$TMP/step1.sql" | grep -qx 'commit;' || { fail "could not extract STEP 1"; exit 1; }
OUT="$(psql_ -f "$TMP/step1.sql" 2>&1 || true)"
printf '%s\n' "$OUT" | grep 'PRICING' || true
BK="$(n "select concat_ws('/', (select count(*) from backup_pricing_20261014.distance_bands), (select count(*) from backup_pricing_20261014.region_premiums), (select count(*) from backup_pricing_20261014.rate_version_rules), (select count(*) from backup_pricing_20261014.surcharges_rule_links))" 2>&1 || true)"
LEFT="$(n "select concat_ws('/', (select count(*) from public.distance_bands), (select count(*) from public.region_premiums), (select count(*) from public.rate_version_rules), (select count(*) from public.surcharges where rule_id is not null))")"
NOT_ON="$(n "select count(*) from pg_trigger where (tgname like 'distance_bands_frozen%' or tgname like 'region_premiums_frozen%' or tgname like 'rate_version_rules_frozen%') and tgenabled <> 'O'")"
ON="$(n "select count(*) from pg_trigger where (tgname like 'distance_bands_frozen%' or tgname like 'region_premiums_frozen%' or tgname like 'rate_version_rules_frozen%') and tgenabled = 'O'")"
if printf '%s' "$OUT" | grep -q 'PRICING: 20 bands, 5 premiums, 0 rules, 0 rule links found (match expected)' \
   && printf '%s' "$OUT" | grep -q 'PRICING done: 20 bands, 5 premiums, 0 rules removed, 0 rule links' \
   && [ "$BK" = "20/5/0/0" ] && [ "$LEFT" = "0/0/0/0" ] && [ "$NOT_ON" = 0 ] && [ "$ON" = 6 ]; then
  pass "(b) script ran: NOTICE 20/5/0; backup 20/5/0/0; tables empty; 6 frozen triggers enabled"
else fail "(b) script: BK=$BK LEFT=$LEFT NOT_ON=$NOT_ON ON=$ON; $(printf '%s' "$OUT" | tail -2)"; fi
[ "$(n "select count(*) from backup_pricing_20261014.distance_bands where per_km_rappen = 1")" = 20 ] \
  && [ "$(n "select count(*) from backup_pricing_20261014.region_premiums where percent = 1")" = 5 ] \
  && pass "(b) backup rows are the fixture rows (all columns kept)" || fail "(b) backup rows do not match the fixture"

# ---- (c) a second run aborts and changes nothing -------------------------------------------------------------------
SIG_C="$(sig)"
OUT="$(psql_ -f "$TMP/step1.sql" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'PRICING abort: schema backup_pricing_20261014 already exists' && [ "$(sig)" = "$SIG_C" ]; then
  pass "(c) second run aborts (backup schema exists); nothing changed"
else fail "(c) second run: $(printf '%s' "$OUT" | tail -2)"; fi

# ---- (d) Part B applies after the script ---------------------------------------------------------------------------
OUT="$(psql_ -1 -f "$MIG/$MB" 2>&1 || true)"
if ! printf '%s' "$OUT" | grep -q 'ERROR' && ! tables_exist && ! has_rule_id && has_guard \
   && [ "$(n "select (to_regclass('public.distance_bands') is null and to_regclass('public.region_premiums') is null and to_regclass('public.rate_version_rules') is null)::text")" = true ]; then
  pass "(d) Part B applies: three tables and surcharges.rule_id gone, guard function present"
else fail "(d) Part B: $(printf '%s' "$OUT" | grep ERROR | head -2)"; fi
if OUT="$(n 'select app.pricing_assert_bands_premiums_rules_gone();' 2>&1)"; then
  pass "(d) guard passes after Part B"
else fail "(d) guard raised after Part B: $OUT"; fi
[ "$(n "select (pg_get_functiondef('public.ops_vehicle_class_set_status(uuid, text, text)'::regprocedure) ~ 'distance_bands|rate_version_rules|rule_id')::text || '/' || (pg_get_functiondef('public.ops_vehicle_class_delete_or_hide(uuid, text)'::regprocedure) ~ 'distance_bands|rate_version_rules|rule_id')::text")" = "false/false" ] \
  && pass "(d) the two class functions no longer name the dropped objects" || fail "(d) a class function still names a dropped object"
[ "$(n "select concat_ws('/', (select count(*) from backup_pricing_20261014.distance_bands), (select count(*) from backup_pricing_20261014.region_premiums))")" = "20/5" ] \
  && pass "(d) the backup schema survives Part B (20/5)" || fail "(d) backup schema changed by Part B"

echo "----"
if [ "$FAILS" = 0 ]; then echo "PASS | pricing proof | all checks passed"; else echo "FAIL | pricing proof | $FAILS check(s) failed"; exit 1; fi
