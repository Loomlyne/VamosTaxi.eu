-- 20260823000021_rls_customer.sql
--
-- DATA-02 (customer, `authenticated`). This is the FIRST of the four policy migrations
-- (...21-...24) and it must stay first: it opens with `revoke all on all tables in schema
-- public`, the D-02 fail-closed baseline every later grant is additive on top of. D-25: if the
-- hosted grant probe (Plan 02-10) finds `grant authenticated to vamos_edge` refused, every
-- `to authenticated` in THIS FILE becomes `to vamos_customer` -- no other change.
--
-- F-01: bookings/booking_legs are COLUMN-SCOPED here, exactly like customers -- not table-wide
-- as an earlier draft had it. `note` on both tables is dispatcher-only free text
-- (app/ops/OpsDetail.dc.html:139: "Add a note visible to dispatch only...") and often lands
-- Art. 9-adjacent (mobility aid, medical need). A table-wide grant would hand that text to
-- every customer here and, through ...22, to anyone holding an emailed manage link a mail
-- gateway prefetched.

-- Start from zero on every table in the schema, whatever a Supabase project default or an
-- earlier migration left behind. This is what makes "the grant is the stronger of the two
-- gates" (D-02) true rather than aspirational -- without it, `authenticated` retains the
-- project's default ALL on every table these migrations created and only default-deny RLS
-- stands between a customer JWT and the ops tables.
revoke all on all tables in schema public
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public;
-- Sequences back the identity columns; no client-facing role ever needs one directly.
revoke all on all sequences in schema public
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public;

grant select on public.price_snapshots, public.price_snapshot_legs to authenticated;

-- F-01: bookings, COLUMN-SCOPED -- every column the mock/ops screen shows a customer, EXCLUDING
-- `note` (dispatcher-only), `idempotency_key` and `quote_id` (operational plumbing) and
-- `erased_at` (an erasure fact, never a customer-visible flag). Derived from
-- ...10_bookings.sql as actually written.
grant select (id, reference, customer_id, contact_name, contact_email, contact_phone, is_return,
              status, locale, display_currency, price_snapshot_id, price_total_rappen,
              created_at, updated_at)
  on public.bookings to authenticated;

-- F-01: booking_legs, the same discipline -- EXCLUDING `note` (dispatcher-only) and the
-- assignment/estimate columns (`assigned_chauffeur_id`, `assigned_vehicle_id`,
-- `estimated_duration_minutes`, `turnaround_buffer_minutes`), which are internal dispatch
-- facts, not something a customer reads on their own trip. Derived from ...11_booking_legs.sql
-- as actually written; `scheduled_range` (the STORED generated exclusion column) stays visible
-- -- it carries no information a customer doesn't already have from `scheduled_at`.
grant select (id, booking_id, leg_seq, direction, pickup_text, pickup_place_id, pickup_lat,
              pickup_lng, dropoff_text, dropoff_place_id, dropoff_lat, dropoff_lng,
              origin_zone_id, dest_zone_id, scheduled_at, scheduled_local, flight_no,
              vehicle_class_id, pax, bags, status, scheduled_range, created_at, updated_at)
  on public.booking_legs to authenticated;

-- COLUMN-SCOPED, not table-wide. `customers` also carries `note` (dispatch's private note about
-- this customer -- the mock seeds 'Invoiced monthly'), `type`, `company`, `since` and
-- `erased_at`. A row policy constrains WHICH ROW, never which column: with `grant update` a
-- customer could set `type='corporate'` to reach corporate-only pricing, or clear `erased_at`
-- to resurrect a redacted row. With `grant select` they could read a note written for staff
-- eyes about themselves.
grant select (id, user_id, full_name, email, phone, type, company, since, created_at)
  on public.customers to authenticated;
grant update (full_name, phone, company) on public.customers to authenticated;

-- DATA-02 -- a customer reads only their own bookings.
create policy bookings_select_own on public.bookings
  for select to authenticated
  using ((select app.uid()) is not null
         and customer_id in (select c.id from public.customers c where c.user_id = (select app.uid())));

-- Belt: a RESTRICTIVE policy refusing to serve `authenticated` when no identity was bound at
-- all. Restrictive policies AND with the permissive set, so nothing added later can OR past it.
create policy bookings_require_identity on public.bookings
  as restrictive for all to authenticated
  using ((select app.uid()) is not null);

-- Child rows reach identity through the parent; the inner select is itself RLS-filtered as the
-- same role, so the two can never disagree.
create policy legs_select_via_parent on public.booking_legs
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_legs.booking_id));

create policy snapshots_select_via_parent on public.price_snapshots
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = price_snapshots.booking_id));

create policy snapshot_legs_select_via_parent on public.price_snapshot_legs
  for select to authenticated
  using (exists (select 1 from public.price_snapshots s where s.id = price_snapshot_legs.snapshot_id));

-- A customer reads and edits only their own customer row.
create policy customers_select_own on public.customers
  for select to authenticated using (user_id = (select app.uid()));
create policy customers_update_own on public.customers
  for update to authenticated
  using (user_id = (select app.uid())) with check (user_id = (select app.uid()));

-- No INSERT policy on bookings for `authenticated`: a quote is created by a server-authoritative
-- route, never by the browser. No UPDATE grant on bookings for `authenticated` at all -- reads
-- only; a customer's own mutation paths (manage token cancel, account edits to `customers`) are
-- separate, narrower surfaces.
