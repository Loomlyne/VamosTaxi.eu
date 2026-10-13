#!/usr/bin/env bash
# Local proof for docs/runbook/p30-remove-test-classes.sql (plan 30-09, CLS-13).
#
# Local proof only. Refuses any database that is not this lab.
# The owner runs the real script on live himself; an agent never does.
#
# Usage: bash scripts/p30-local-proof.sh [lab-name]      (default p30; the native lab must be up)
#
# Order proved (decision 1, the script runs FIRST on today's schema):
#   lab at the schema BEFORE 20261012200000  ->  fixtures  ->  aborts  ->  real run  ->  apply the two
#   Phase 30 migrations  ->  select app.p30_assert_test_classes_gone();
# To get the pre-Phase-30 schema the script moves the two Phase 30 migration files out of the tree for
# one `lab.sh reseed` (a trap puts them back), and at the end it reseeds the lab to the full schema.
# Only this lab's database is reset (lab.sh refuses any other stack). Native stack only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LAB="${1:-p30}"
SQL="$ROOT/docs/runbook/p30-remove-test-classes.sql"
MIG="$ROOT/packages/db/supabase/migrations"
M1="20261012200000_class_lifecycle.sql"
M2="20261012210000_assign_refuses_retired_class.sql"

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

TMP="$(mktemp -d)"
HELD="$TMP/held"
FAILS=0
APPLIED=0
pass() { echo "PASS | p30 proof | $1"; }
fail() { echo "FAIL | p30 proof | $1"; FAILS=$((FAILS + 1)); }

restore_files() {
  local f
  if [ -d "$HELD" ]; then
    for f in "$M1" "$M2"; do [ -f "$HELD/$f" ] && mv "$HELD/$f" "$MIG/$f"; done
  fi
  return 0
}

cleanup_fixture() {
  psql_ >/dev/null 2>&1 <<'SQL' || true
drop schema if exists backup_p30_20261012 cascade;
begin;
set local session_replication_role = replica;
delete from public.surcharges where code = 'p30proof';
delete from public.chauffeurs where licence_number = 'P30PROOF';
delete from public.rate_version_rules where rate_version_id in (select id from public.rate_versions where slug = 'p30-proof-retired');
delete from public.distance_bands where rate_version_id in (select id from public.rate_versions where slug = 'p30-proof-retired');
delete from public.fixed_routes where rate_version_id in (select id from public.rate_versions where slug = 'p30-proof-retired');
delete from public.distance_rates where rate_version_id in (select id from public.rate_versions where slug = 'p30-proof-retired');
delete from public.rate_versions where slug = 'p30-proof-retired';
delete from public.reviews where external_ref in ('rv-1','rv-2','rv-3','rv-4','rv-5','p30-keep-review');
delete from public.vehicle_classes where slug in ('first','mahaha','p30-keep');
commit;
SQL
}

on_exit() {
  local code=$?
  restore_files
  cleanup_fixture
  if [ "$APPLIED" = 1 ]; then
    # The lab now holds hand-applied Phase 30 migrations and no test classes: put it back to the full
    # schema from the real migration files (lab.sh reseed = db reset + seed), as the other plans expect.
    scripts/test-lab/lab.sh reseed "$LAB" >"$TMP/reseed-full.log" 2>&1 \
      && echo "lab $LAB reseeded to the full Phase 30 schema" \
      || { echo "WARNING: could not reseed lab $LAB to the full schema; run: scripts/test-lab/lab.sh reseed $LAB"; tail -3 "$TMP/reseed-full.log"; }
  fi
  rm -rf "$TMP"
  exit "$code"
}
trap on_exit EXIT

has_guard() { [ -n "$(psql_ -c "select to_regproc('app.p30_assert_test_classes_gone')")" ]; }

# ---- Pre-Phase-30 schema -------------------------------------------------------------------------------------------
if has_guard; then
  echo "... lab $LAB holds the Phase 30 schema; reseeding it to the schema before $M1"
  git diff --quiet -- "packages/db/supabase/migrations/$M1" "packages/db/supabase/migrations/$M2" \
    || { echo "refusing: the two Phase 30 migration files have uncommitted changes" >&2; exit 1; }
  mkdir -p "$HELD"
  mv "$MIG/$M1" "$HELD/$M1"; mv "$MIG/$M2" "$HELD/$M2"
  scripts/test-lab/lab.sh reseed "$LAB" >"$TMP/reseed-pre.log" 2>&1 || { restore_files; tail -5 "$TMP/reseed-pre.log"; echo "refusing: reseed failed" >&2; exit 1; }
  restore_files
  APPLIED=1   # the lab must be reseeded to the full schema at the end, whatever happens
fi
if has_guard; then fail "lab is still at the Phase 30 schema"; exit 1; fi
pass "lab $LAB is at the schema before $M1 (app.p30_assert_test_classes_gone is absent)"

# ---- Fixture: synthetic rows only ----------------------------------------------------------------------------------
# A closed (retired) price book of its own holds the child rows; the frozen triggers are bypassed with
# session_replication_role = replica inside this lab transaction only (the lab is a throwaway copy).
psql_ -q >/dev/null <<'SQL'
begin;
set local session_replication_role = replica;
insert into public.vehicle_classes (slug, active, passenger_capacity, luggage_capacity)
  values ('first', false, 3, 2), ('mahaha', false, 3, 2), ('p30-keep', false, 3, 2)
  on conflict (slug) do nothing;
update public.vehicle_classes set active = false where slug in ('business','economy','first','van','mahaha');
insert into public.rate_versions (slug, label, status, published_at) values ('p30-proof-retired', 'p30 proof (retired)', 'retired', now());
insert into public.distance_rates (rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen, min_fare_rappen, max_pax)
  select v.id, c.id, 100, 10, 100, 4
    from public.rate_versions v, public.vehicle_classes c
   where v.slug = 'p30-proof-retired' and c.slug in ('first','mahaha','p30-keep');
insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen)
  select v.id, z.a, z.b, c.id, 100
    from public.rate_versions v, public.vehicle_classes c,
         (select (array_agg(id order by slug))[1] as a, (array_agg(id order by slug))[2] as b from public.service_zones) z
   where v.slug = 'p30-proof-retired' and c.slug in ('first','mahaha');
insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
  select v.id, c.id, 0, 10, 10
    from public.rate_versions v, public.vehicle_classes c
   where v.slug = 'p30-proof-retired' and c.slug in ('first','mahaha');
insert into public.rate_version_rules (rate_version_id, kind, payload)
  select v.id, 'city_pair', jsonb_build_object('pairId', 'p30proof', 'vehicleClassId', c.id::text)
    from public.rate_versions v, public.vehicle_classes c
   where v.slug = 'p30-proof-retired' and c.slug in ('first','mahaha');
insert into public.reviews (external_ref, source, author_name, rating, body, published, vehicle_class_id)
  select 'rv-' || g, 'manual', 'P30 proof ' || g, 5, 'synthetic', true,
         case when g = 1 then (select id from public.vehicle_classes where slug = 'business') end
    from generate_series(1, 5) g;
-- rows that must survive: a class outside the five with a price row, and a review that is not rv-1..rv-5
insert into public.reviews (external_ref, source, author_name, rating, body, published)
  values ('p30-keep-review', 'manual', 'P30 keeper', 4, 'synthetic', true);
commit;
SQL

# A signature of everything the script may touch, to prove an abort changes nothing.
sig() {
  psql_ -c "select md5(concat_ws('|',
    (select string_agg(id::text || active::text, ',' order by id) from public.vehicle_classes),
    (select string_agg(id::text, ',' order by id) from public.distance_rates),
    (select string_agg(id::text, ',' order by id) from public.fixed_routes),
    (select string_agg(id::text, ',' order by id) from public.distance_bands),
    (select string_agg(id::text, ',' order by id) from public.rate_version_rules),
    (select string_agg(id::text || coalesce(vehicle_class_id::text, ''), ',' order by id) from public.reviews),
    (select string_agg(tgname || tgenabled::text, ',' order by tgname) from pg_trigger
      where tgname in ('distance_rates_frozen','fixed_routes_frozen','distance_bands_frozen','rate_version_rules_frozen')),
    (select count(*)::text from pg_namespace where nspname = 'backup_p30_20261012')))"
}
n() { psql_ -c "$1"; }

SIG0="$(sig)"
[ "$(n "select count(*) from public.vehicle_classes where slug in ('business','economy','first','van','mahaha')")" = 5 ] \
  && [ "$(n "select count(*) from public.reviews where external_ref like 'rv-%'")" = 5 ] \
  && pass "fixture: 5 classes with children in a retired book, 5 reviews rv-1..rv-5" \
  || { fail "fixture is not the expected shape"; exit 1; }

# ---- (a0) the Phase 30 migration refuses while the five classes exist ----------------------------------------------
OUT="$(psql_ -1 -f "$MIG/$M1" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'p30-test-classes-present' && ! has_guard; then
  pass "migration $M1 refuses while the test classes exist and applies nothing"
else fail "migration did not refuse: $(printf '%s' "$OUT" | tail -2)"; fi

# ---- (a) wrong count aborts ----------------------------------------------------------------------------------------
sed 's/^select 5::int as expected_classes,/select 4::int as expected_classes,/' "$SQL" >"$TMP/wrong-count.sql"
cmp -s "$SQL" "$TMP/wrong-count.sql" && { fail "sed did not change the expected count"; exit 1; }
OUT="$(psql_ -f "$TMP/wrong-count.sql" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'P30 abort: 5 of the test classes found, expected 4' && [ "$(sig)" = "$SIG0" ]; then
  pass "wrong-count abort: P30 abort, nothing changed"
else fail "wrong-count abort: $(printf '%s' "$OUT" | tail -2)"; fi

sed 's/^select 5::int as expected_classes,/select 5::int as expected_classes,/; s/^       5::int as expected_reviews,/       6::int as expected_reviews,/' "$SQL" >"$TMP/wrong-reviews.sql"
OUT="$(psql_ -f "$TMP/wrong-reviews.sql" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'P30 abort: 5 of the test reviews' && [ "$(sig)" = "$SIG0" ]; then
  pass "wrong review count abort: P30 abort, nothing changed"
else fail "wrong review count abort: $(printf '%s' "$OUT" | tail -2)"; fi

# ---- (b) a reference aborts ----------------------------------------------------------------------------------------
psql_ -q >/dev/null <<'SQL'
begin;
set local session_replication_role = replica;
insert into public.chauffeurs (full_name, phone, licence_number, vehicle_class_id)
  select 'P30 proof', '000', 'P30PROOF', id from public.vehicle_classes where slug = 'first';
commit;
SQL
SIG_B="$(sig)"
OUT="$(psql_ -f "$SQL" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'P30 abort: 1 booking leg, price snapshot, vehicle or chauffeur row' && [ "$(sig)" = "$SIG_B" ]; then
  pass "reference abort (a chauffeur on a test class): P30 abort, nothing changed"
else fail "reference abort: $(printf '%s' "$OUT" | tail -2)"; fi
psql_ -q -c "begin; set local session_replication_role = replica; delete from public.chauffeurs where licence_number = 'P30PROOF'; commit;" >/dev/null
[ "$(sig)" = "$SIG0" ] || fail "fixture differs after removing the planted chauffeur"

# ---- (b2) a surcharge on a city_pair rule of these classes aborts --------------------------------------------------
psql_ -q >/dev/null <<'SQL'
begin;
set local session_replication_role = replica;
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, rule_id)
  select r.rate_version_id, 'p30proof', 'amount', 100, r.id
    from public.rate_version_rules r
   where r.payload ->> 'pairId' = 'p30proof'
   order by r.id limit 1;
commit;
SQL
SIG_B2="$(sig)"
OUT="$(psql_ -f "$SQL" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'P30 abort: a surcharge is attached to a price rule of these classes' && [ "$(sig)" = "$SIG_B2" ] \
   && [ "$(n "select count(*) from public.surcharges where code = 'p30proof'")" = 1 ]; then
  pass "surcharge abort: P30 abort, nothing changed"
else fail "surcharge abort: $(printf '%s' "$OUT" | tail -2)"; fi
psql_ -q -c "begin; set local session_replication_role = replica; delete from public.surcharges where code = 'p30proof'; commit;" >/dev/null
[ "$(sig)" = "$SIG0" ] || fail "fixture differs after removing the planted surcharge"

# ---- (c) the real file ---------------------------------------------------------------------------------------------
N_RATES="$(n "select count(*) from public.distance_rates where vehicle_class_id in (select id from public.vehicle_classes where slug in ('business','economy','first','van','mahaha'))")"
N_ROUTES="$(n "select count(*) from public.fixed_routes where vehicle_class_id in (select id from public.vehicle_classes where slug in ('business','economy','first','van','mahaha'))")"
N_BANDS="$(n "select count(*) from public.distance_bands where vehicle_class_id in (select id from public.vehicle_classes where slug in ('business','economy','first','van','mahaha'))")"
N_RULES="$(n "select count(*) from public.rate_version_rules where kind = 'city_pair' and payload ->> 'vehicleClassId' in (select id::text from public.vehicle_classes where slug in ('business','economy','first','van','mahaha'))")"
OTHER_REVIEWS="$(n "select count(*) from public.reviews where external_ref is null or external_ref not like 'rv-%'")"
OTHER_RATES="$(n "select count(*) from public.distance_rates where vehicle_class_id not in (select id from public.vehicle_classes where slug in ('business','economy','first','van','mahaha'))")"
OUT="$(psql_ -f "$SQL" 2>&1 || true)"
echo "$OUT" | grep 'P30' || true
BK="$(n "select concat_ws(',', (select count(*) from backup_p30_20261012.vehicle_classes), (select count(*) from backup_p30_20261012.reviews), (select count(*) from backup_p30_20261012.distance_rates), (select count(*) from backup_p30_20261012.fixed_routes), (select count(*) from backup_p30_20261012.distance_bands), (select count(*) from backup_p30_20261012.rate_version_rules))" 2>&1 || true)"
LEFT="$(n "select (select count(*) from public.vehicle_classes where slug in ('business','economy','first','van','mahaha')) + (select count(*) from public.reviews where external_ref like 'rv-%')")"
OFF="$(n "select count(*) from pg_trigger where tgname in ('distance_rates_frozen','fixed_routes_frozen','distance_bands_frozen','rate_version_rules_frozen') and tgenabled = 'D'")"
ON="$(n "select count(*) from pg_trigger where tgname in ('distance_rates_frozen','fixed_routes_frozen','distance_bands_frozen','rate_version_rules_frozen') and tgenabled = 'O'")"
if printf '%s' "$OUT" | grep -q 'P30 done: 5 classes, 5 reviews removed' \
   && [ "$LEFT" = 0 ] && [ "$OFF" = 0 ] && [ "$ON" = 4 ] \
   && [ "$BK" = "5,5,$N_RATES,$N_ROUTES,$N_BANDS,$N_RULES" ]; then
  pass "real run: P30 done; 0 rows left for the slugs and refs; backup counts $BK; 4 frozen triggers enabled, 0 disabled"
else fail "real run: LEFT=$LEFT OFF=$OFF ON=$ON BK=$BK expected 5,5,$N_RATES,$N_ROUTES,$N_BANDS,$N_RULES; $(printf '%s' "$OUT" | tail -2)"; fi
# only the target rows went: other price rows and other reviews are untouched
[ "$OTHER_RATES" = 1 ] && [ "$OTHER_REVIEWS" = 1 ] && [ "$(n "select count(*) from public.distance_rates")" = "$OTHER_RATES" ] && [ "$(n "select count(*) from public.reviews")" = "$OTHER_REVIEWS" ] \
  && pass "nothing else deleted: other distance_rates ($OTHER_RATES) and other reviews ($OTHER_REVIEWS) unchanged" \
  || fail "rows outside the target set changed"
[ "$(n "select count(*) from public.reviews where external_ref like 'rv-%'")" = 0 ] \
  && [ "$(n "select count(*) from backup_p30_20261012.reviews where vehicle_class_id is not null")" = 1 ] \
  || fail "backup review row did not keep its class link"

# ---- (c2) then the Phase 30 migrations, then the guard -------------------------------------------------------------
SIG_C="$(sig)"
APPLIED=1
OUT1="$(psql_ -1 -f "$MIG/$M1" 2>&1 || true)"
OUT2="$(psql_ -1 -f "$MIG/$M2" 2>&1 || true)"
if has_guard && ! printf '%s%s' "$OUT1" "$OUT2" | grep -q 'ERROR'; then
  pass "migrations $M1 and $M2 apply after the script (guard inside the file passed)"
else fail "migrations did not apply: $(printf '%s %s' "$OUT1" "$OUT2" | grep ERROR | head -2)"; fi
if OUT="$(psql_ -c 'select app.p30_assert_test_classes_gone();' 2>&1)"; then
  pass "guard passes after script"
else fail "guard raised after the script: $OUT"; fi
# the guard must RAISE when a test slug is back (rolled back, nothing kept)
OUT="$(psql_ 2>&1 <<'SQL' || true
begin;
insert into public.vehicle_classes (slug, active, passenger_capacity, luggage_capacity) values ('mahaha', false, 3, 2);
select app.p30_assert_test_classes_gone();
rollback;
SQL
)"
if printf '%s' "$OUT" | grep -q 'p30-test-classes-present'; then
  pass "guard raises p30-test-classes-present when a test slug is present"
else fail "guard did not raise: $OUT"; fi
[ "$(n "select count(*) from public.vehicle_classes where slug = 'mahaha'")" = 0 ] || fail "guard probe row was kept"

# ---- (d) a second real run aborts and changes nothing --------------------------------------------------------------
SIG_D="$(sig)"
OUT="$(psql_ -f "$SQL" 2>&1 || true)"
if printf '%s' "$OUT" | grep -q 'P30 abort' && [ "$(sig)" = "$SIG_D" ]; then
  pass "second run aborts: $(printf '%s' "$OUT" | grep -o 'P30 abort: [^.]*' | head -1); nothing changed"
else fail "second run: $(printf '%s' "$OUT" | tail -2)"; fi

echo "----"
if [ "$FAILS" = 0 ]; then echo "PASS | p30 proof | all checks passed"; else echo "FAIL | p30 proof | $FAILS check(s) failed"; exit 1; fi
