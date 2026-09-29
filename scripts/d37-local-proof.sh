#!/usr/bin/env bash
# Local proof for docs/runbook/d37-delete-test-bookings.sql (plan 26.3-17, D-37).
#
# LOCAL ONLY. Refuses to run unless the database is the port-shifted 26.3 stack on
# 127.0.0.1:55322. Never carries a hosted project ref or URL. The owner runs the real script on
# live himself; an agent never does.
#
# Does not reset the stack (other work shares it). It seeds a small namespaced fixture set into an
# EMPTY bookings table, runs the script, and cleans up after itself.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/docs/runbook/d37-delete-test-bookings.sql"
CONTAINER="supabase_db_vamos-taxi-263"
DB_URL="postgres://postgres:postgres@127.0.0.1:55322/postgres"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$DB_URL" in
  *@127.0.0.1:55322/*) ;;
  *) echo "refusing: database is not 127.0.0.1:55322" >&2; exit 1 ;;
esac
port="$(docker port "$CONTAINER" 5432/tcp 2>/dev/null || true)"
case "$port" in
  *:55322) ;;
  *) echo "refusing: container $CONTAINER is not published on 55322 (got '$port')" >&2; exit 1 ;;
esac

psql_() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }

n_bookings="$(psql_ -c 'select count(*) from public.bookings')"
if [ "$n_bookings" != "0" ]; then
  echo "refusing: local bookings table is not empty ($n_bookings rows); not touching others' data" >&2
  exit 1
fi
if [ "$(psql_ -c "select count(*) from pg_namespace where nspname='backup_d37_20261001'")" != "0" ]; then
  echo "refusing: backup_d37_20261001 already exists locally" >&2
  exit 1
fi

cleanup_fixture() {
  psql_ >/dev/null <<'SQL' || true
drop schema if exists backup_d37_20261001 cascade;
begin;
set local session_replication_role = replica;
delete from public.consent_log where policy_version = 'd37-proof';
commit;
delete from public.coupons where code = 'D37PROOF';
SQL
}
trap 'cleanup_fixture; rm -rf "$TMP"' EXIT

# ---- Fixtures: synthetic rappen only ------------------------------------------------------------
psql_ >"$TMP/seed.log" <<'SQL'
begin;
insert into public.coupons (code, kind, percent, global_limit, active) values ('D37PROOF', 'percent', 10, 100, true);

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       (select id from public.coupons where code = 'D37PROOF') as coupon_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where vc.slug = 'economy' and rv.slug = 'seed-placeholder' and sv.slug = 'launch-baseline';
grant select on fx to public;

create function pg_temp.d37_book(p_n int, p_coupon boolean)
returns table (booking_id uuid, reference text, snapshot_id bigint, payment_id bigint, replayed boolean)
language plpgsql volatile as $$
declare
  f fx%rowtype;
  v_sched timestamptz := now() + interval '3 days';
begin
  select * into f from fx;
  return query select * from public.checkout_create_booking(
    p_quote_id => ('d37d37d3-0000-4000-8000-00000000000' || p_n)::uuid,
    p_idempotency_key => 'd37-proof-' || p_n,
    p_contact => jsonb_build_object('contact_name','D37 Proof','contact_email','d37-' || p_n || '@example.test','contact_phone','+417****7082'),
    p_locale => 'en',
    p_display_currency => 'CHF',
    p_snapshot => jsonb_build_object(
      'vehicle_class_id', f.vehicle_class_id, 'rate_version_id', f.rate_version_id,
      'settings_version_id', f.settings_version_id, 'engine_version', 'quote-engine@d37-proof',
      'lock_exp', now() + interval '45 minutes', 'pax', 1, 'bags', 0,
      'lines', jsonb_build_array(jsonb_build_object('seq',1,'code','distance_fare','kind','fare','i18n_key','price.line.distance','amount_rappen',6)),
      'policy', jsonb_build_object('cancellation_tiers','[]'::jsonb,'free_cancel_hours',24,'airport_waiting_minutes',60,'city_waiting_minutes',15,'settings_version_id',f.settings_version_id,'modification_deadline_hours',24,'min_advance_minutes',180,'policy_doc','d37-proof'),
      'shown_alternatives','[]'::jsonb,'display_currency','CHF','source','web',
      'subtotal_rappen',6,'surcharges_rappen',0,'discount_rappen',0,'total_rappen',6,'distance_km',12.5,'duration_min',25),
    p_legs => jsonb_build_array(jsonb_build_object(
      'leg_seq',1,'direction','outbound','pickup_text','ZRH Airport','pickup_place_id',null,
      'pickup_lat',47.458056,'pickup_lng',8.549167,'dropoff_text','Zurich HB','dropoff_place_id',null,
      'dropoff_lat',47.378177,'dropoff_lng',8.540192,'scheduled_at',v_sched::text,
      'scheduled_local',to_char(v_sched,'YYYY-MM-DD"T"HH24:MI'),'flight_no',null,
      'vehicle_class_id',f.vehicle_class_id,'pax',1,'bags',0,'estimated_duration_minutes',25,
      'duration_min',25,'distance_km',12.5,'leg_subtotal_rappen',6,'booking_leg_id',null)),
    p_coupon_id => case when p_coupon then f.coupon_id end,
    p_coupon_code => case when p_coupon then 'D37PROOF' end,
    p_manage_token_hash => decode(repeat('c' || p_n, 32), 'hex'),
    p_manage_token_expires_at => now() + interval '30 days',
    p_stripe_payment_intent_id => 'pi_d37_' || p_n,
    p_stripe_checkout_session_id => 'cs_d37_' || p_n,
    p_charged_rappen => 6,
    p_actor_customer_id => null);
end $$;
grant execute on function pg_temp.d37_book(int, boolean) to public;

-- No rate version is live on the local stack, and going live would collide with other sessions'
-- tests, so only the chargeable-snapshot guard on booking_payments is switched off for these three
-- inserts (inside this transaction; switched back on straight after).
alter table public.booking_payments disable trigger booking_payments_match_snapshot;
set local role vamos_checkout;
create temporary table b1 as select * from pg_temp.d37_book(1, false);
create temporary table b2 as select * from pg_temp.d37_book(2, true);
create temporary table b3 as select * from pg_temp.d37_book(3, false);
reset role;
alter table public.booking_payments enable trigger booking_payments_match_snapshot;

-- b1: paid, with a refund row and a notification. b3: pay-link booking.
set local session_replication_role = replica;
update public.booking_payments set status = 'succeeded', captured_at = now() where booking_id = (select booking_id from b1);
update public.bookings set pay_link_sent_at = now() where id = (select booking_id from b3);
set local session_replication_role = origin;
insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent, refund_rappen, tier_applied, hours_before)
select booking_id, snapshot_id, payment_id, 'test_booking', 6, 100, 6, '{}'::jsonb, 72 from b1;
insert into public.booking_notifications (booking_id, kind, locale, dedupe_key)
select booking_id, 'confirmation', 'en', 'd37-proof-note' from b1;
-- b2: coupon redemption exists via the RPC; add a consent row (set null on delete).
insert into public.consent_log (consent_subject_id, booking_id, policy_version, method, locale)
select gen_random_uuid(), booking_id, 'd37-proof', 'accept_all', 'en' from b2;
commit;
SQL

count_of() { psql_ -c "select count(*) from public.$1"; }
seeded_bookings="$(count_of bookings)"
seeded_legs="$(count_of booking_legs)"
seeded_pay="$(count_of booking_payments)"
seeded_refund="$(count_of booking_refunds)"
seeded_note="$(count_of booking_notifications)"
seeded_redeem="$(count_of coupon_redemptions)"
seeded_consent="$(psql_ -c "select count(*) from public.consent_log where booking_id is not null")"
seeded_events="$(count_of booking_events)"
echo "seeded: bookings=$seeded_bookings legs=$seeded_legs payments=$seeded_pay refunds=$seeded_refund notifications=$seeded_note redemptions=$seeded_redeem consent=$seeded_consent events=$seeded_events"
[ "$seeded_bookings" = "3" ] || { echo "FAIL: expected 3 seeded bookings" >&2; exit 1; }
for v in "$seeded_refund" "$seeded_note" "$seeded_redeem" "$seeded_consent" "$seeded_events"; do
  [ "$v" -ge 1 ] || { echo "FAIL: a fixture table is empty" >&2; exit 1; }
done

# ---- Local copy of the script: cutoff tomorrow, expected = fixture count ----------------------
sed -e "s/timestamptz '2026-09-29 00:00:00+00' as cutoff/now() + interval '1 day' as cutoff/" \
    -e "s/33::int  /3::int   /" "$SQL" > "$TMP/ok.sql"
sed -e "s/timestamptz '2026-09-29 00:00:00+00' as cutoff/now() + interval '1 day' as cutoff/" \
    -e "s/33::int  /4::int   /" "$SQL" > "$TMP/wrong.sql"
grep -q "now() + interval '1 day' as cutoff" "$TMP/ok.sql" || { echo "FAIL: cutoff substitution" >&2; exit 1; }
grep -q "3::int   *as expected" "$TMP/ok.sql" || { echo "FAIL: expected substitution" >&2; exit 1; }

# ---- Run 1: wrong expected count must abort and change nothing --------------------------------
if psql_ <"$TMP/wrong.sql" >"$TMP/wrong.log" 2>&1; then
  echo "FAIL: wrong expected count did not abort" >&2; exit 1
fi
grep -q "D-37 abort: 3 bookings before the cutoff, expected 4" "$TMP/wrong.log" || { cat "$TMP/wrong.log"; echo "FAIL: wrong abort message" >&2; exit 1; }
[ "$(count_of bookings)" = "3" ] || { echo "FAIL: abort changed bookings" >&2; exit 1; }
[ "$(psql_ -c "select count(*) from pg_namespace where nspname='backup_d37_20261001'")" = "0" ] || { echo "FAIL: abort left a backup schema" >&2; exit 1; }
echo "ok: wrong expected count aborts, nothing changed"

# ---- Run 2: the real run ----------------------------------------------------------------------
psql_ <"$TMP/ok.sql" >"$TMP/ok.log" 2>&1 || { cat "$TMP/ok.log"; echo "FAIL: script failed" >&2; exit 1; }
grep -E "NOTICE|D-37" "$TMP/ok.log" || true

bk() { psql_ -c "select count(*) from backup_d37_20261001.$1"; }
[ "$(bk bookings)" = "$seeded_bookings" ] || { echo "FAIL: backup bookings" >&2; exit 1; }
[ "$(bk booking_legs)" = "$seeded_legs" ] || { echo "FAIL: backup legs" >&2; exit 1; }
[ "$(bk booking_payments)" = "$seeded_pay" ] || { echo "FAIL: backup payments" >&2; exit 1; }
[ "$(bk booking_refunds)" = "$seeded_refund" ] || { echo "FAIL: backup refunds" >&2; exit 1; }
[ "$(bk booking_notifications)" = "$seeded_note" ] || { echo "FAIL: backup notifications" >&2; exit 1; }
[ "$(bk coupon_redemptions)" = "$seeded_redeem" ] || { echo "FAIL: backup redemptions" >&2; exit 1; }
[ "$(bk consent_log)" = "$seeded_consent" ] || { echo "FAIL: backup consent" >&2; exit 1; }
[ "$(bk booking_events)" = "$seeded_events" ] || { echo "FAIL: backup events" >&2; exit 1; }
for t in bookings booking_legs price_snapshots price_snapshot_legs booking_payments booking_refunds booking_notifications coupon_redemptions booking_access_tokens booking_events booking_edit_requests reviews booking_disputes; do
  [ "$(count_of "$t")" = "0" ] || { echo "FAIL: public.$t not empty after delete" >&2; exit 1; }
done
[ "$(psql_ -c "select count(*) from public.consent_log where policy_version='d37-proof'")" = "$seeded_consent" ] || { echo "FAIL: consent rows must be kept" >&2; exit 1; }
[ "$(psql_ -c "select count(*) from public.consent_log where booking_id is not null")" = "0" ] || { echo "FAIL: consent still linked" >&2; exit 1; }
[ "$(psql_ -c "select count(*) from pg_trigger where tgenabled='D' and not tgisinternal")" = "0" ] || { echo "FAIL: a trigger is still disabled" >&2; exit 1; }
echo "proved: backed up and deleted bookings=$seeded_bookings legs=$seeded_legs payments=$seeded_pay refunds=$seeded_refund notifications=$seeded_note redemptions=$seeded_redeem consent(kept, detached)=$seeded_consent events=$seeded_events; triggers on"

echo "PROOF OK"
