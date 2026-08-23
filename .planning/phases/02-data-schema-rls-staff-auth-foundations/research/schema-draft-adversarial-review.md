# Adversarial review of 02-SCHEMA-DRAFT.md (2026-08-23)

## Verdict

The identity boundary, the guest-token design, the charge gate and the exclusion constraints are
genuinely well built and survive attack — the `vamos_edge`-holds-no-grant structure, the definer
token helper and the trigger-derived `rate_version_is_live` all do what the prose claims. Four HIGH
findings break the draft's own stated invariants: a dispatch-only free-text field is granted to
customers and to anyone holding an emailed manage link, `settings_versions` is called immutable but
is dispatcher-writable, `TRUNCATE` bypasses all four append-only layers for a leaked `service_role`,
and the "most guarded statement in the schema" guards only `UPDATE`, so a `live` rate version can be
`INSERT`ed past the completeness gate. **Coverage bound:** I reviewed the DDL in 02-SCHEMA-DRAFT.md
plus ADR-014 and 02-CONTEXT D-29…D-38; I did not read `research/rls-hyperdrive.md`,
`research/manage-token.md`, `research/staff-mfa.md`, `research/price-snapshot.md` or the nine
`*-PLAN.md` files, and I executed no SQL — Postgres-semantics claims below (TRUNCATE not firing row
triggers, `ALTER DEFAULT PRIVILEGES … REVOKE FROM <role>` not touching the PUBLIC default,
restrictive-`FOR ALL` hiding rows from a policy subquery) are from documented behaviour, not a live
probe, and each has a pgTAP assertion proposed at the end.

## Findings

| ID | Severity | Draft lines | Title |
|---|---|---|---|
| F-01 | high | 843, 921, 1806, 1869 | `bookings.note` / `booking_legs.note` is the dispatcher-only note, granted table-wide to `authenticated` **and** `vamos_guest` |
| F-02 | high | 312–344, 1916, 1919–1927 | `settings_versions` is documented "Immutable" but a dispatcher holds `UPDATE`/`DELETE` on it |
| F-03 | high | 1591–1642, 119–125 | `TRUNCATE` is never revoked and does not fire the row-level `tg_append_only` — a leaked `service_role` erases the whole evidence set |
| F-04 | high | 545–548, 570–624 | The rate-version publish gate is `BEFORE UPDATE` only; `INSERT … status='live'` bypasses transition, completeness and attribution |
| F-05 | medium | 1803–1817, 1919, 1943, 2218–2221 | `0022` revokes the `authenticated` grants `0020` created — the whole signed-in customer surface returns `42501` |
| F-06 | medium | 1291–1310, 1327–1365 | Charge gate never checks the payment's snapshot is the booking's *bound* snapshot, and nothing stops two successful payments on one booking |
| F-07 | medium | 720–757 | Coupon `global_limit` / `per_user_limit` are enforced nowhere in the schema; concurrent redemption is a plain race |
| F-08 | medium | 1035, 1056–1067, 1083, 1916–1921 | `booking_access_tokens.token_hash` is readable by every dispatcher, and the hash *is* the bearer credential |
| F-09 | medium | 1083–1135 | `manage_booking_cancel` enforces no cancellation window and no future-pickup check; its docstring claims a snapshot read the body never performs |
| F-10 | medium | 1573–1578, 1596–1615, 1686–1690 | Erasure and append-only contradict each other: the documented `consent_log.customer_id → NULL` step is blocked by `tg_append_only`, and `audit_log` keeps pre-redaction PII forever |
| F-11 | medium | 1425–1445, 1625–1642, 1941–1950 | `stripe_events.payload` (raw Stripe objects) is readable by every dispatcher; `stripe_events` / `booking_notifications` are outside `FORCE RLS` and `service_role` keeps `DELETE` |
| F-12 | medium | 685–719 | `tg_pricing_row_frozen` fires on `UPDATE OR DELETE` only — new priced rows can be inserted straight into the live version |
| F-13 | medium | 94–125 | `ALTER DEFAULT PRIVILEGES … REVOKE … FROM anon, authenticated` is a no-op against PUBLIC's default `EXECUTE`; no default privileges at all in schema `app`; `CREATE` on schema `public` never revoked |
| F-14 | medium | 1298, 1186, 1352–1355 | `charged_currency = 'CHF'` CHECK is incompatible with ADR-014 §1 (charge in the customer's chosen currency), and the fix under time pressure is to relax the charge gate |
| F-15 | medium | 328, 358, 312–344, 2239–2244 | Draft still reflects ADR-002/pre-ADR-014 policy seeds; `first` still shipped; `round_trip_discount_percent` and the night window have no column |
| F-16 | low | 794–813, 1916–1921, 2172 | `next_booking_reference()` is not executable by `vamos_staff`, but §14c grants staff `INSERT` on `bookings` whose `DEFAULT` calls it |
| F-17 | low | 263, 848 | `rappen` domain carries no `check (value >= 0)`; `bookings.price_total_rappen` is the one money column with no check of its own |
| F-18 | low | 1975–1978, 1990–2010 | The `_admin_update` escape hatch on `distance_rates` / `fixed_routes` / `surcharges` can never evaluate true for a dispatcher, and the comment says the opposite |
| F-19 | low | 498–512 | The access-token hook does not strip an inbound `app_metadata.vamos_role` when no active staff row exists |
| F-20 | low | 685, 983, 1245, 1327, 1374, 1591 | Six trigger functions omit `set search_path`, breaking the file's own convention |
| F-21 | low | 84–128 | The draft never states the trust assumption that holding the `vamos_edge` password is equivalent to full admin impersonation |
| F-22 | low | 1636–1641, 1560–1585, 2070–2092 | `FORCE RLS` + zero `INSERT` policy on `audit_log` / `consent_log` makes the definer write path depend on an unstated `postgres` `BYPASSRLS` attribute |

---

### F-01 · high · `bookings.note` / `booking_legs.note` reach the customer and the manage-link bearer

Lines 843 (`bookings.note text not null default ''`), 921 (`booking_legs.note`), 1806 and 1869
(`grant select on public.bookings, public.booking_legs … to authenticated` / `… to vamos_guest`).

The draft column-scopes `customers` for exactly this reason and says so at 1810–1813: *"`customers`
also carries `note` (dispatch's private note about this customer …) … With `grant select` they could
read a note written for staff eyes about themselves."* The same field on `bookings` and
`booking_legs` gets a **table-wide** grant to both `authenticated` and `vamos_guest`. The mock
settles the audience: `app/ops/OpsDetail.dc.html:139` labels it `dispatcherNote: 'Dispatcher note'`
with placeholder `'Add a note visible to dispatch only…'`.

Exploit — no privilege needed beyond an emailed link that mail gateways prefetch:

```sql
-- as vamos_edge, in the guest transaction wrapper
begin;
  set local role vamos_guest;
  select set_config('request.vamos.manage_token_hash', '<sha256 of the token in the link>', true);
  select reference, note from public.bookings;                       -- dispatcher note
  select leg_seq, note from public.booking_legs;                     -- per-leg dispatcher note
commit;
```

and the signed-in equivalent under `authenticated` returns the same column for every booking the
customer owns. Dispatch notes are precisely where Art. 9-adjacent free text lands (mobility aid,
medical need, "difficult passenger"), and the guest path exposes it to a bearer token, not a
session.

Fix — split the audience, do not rely on the API layer:

```sql
alter table public.bookings     add column ops_note text not null default '';
alter table public.booking_legs add column ops_note text not null default '';
-- `note` keeps its customer-authored meaning ("driver, please call on arrival").
revoke select on public.bookings, public.booking_legs from authenticated, vamos_guest;
grant select (id, reference, customer_id, contact_name, contact_email, contact_phone,
              is_return, status, locale, display_currency, price_snapshot_id,
              price_total_rappen, note, created_at)
  on public.bookings to authenticated, vamos_guest;
grant select (id, booking_id, leg_seq, direction, pickup_text, pickup_place_id,
              dropoff_text, dropoff_place_id, scheduled_at, scheduled_local, flight_no,
              vehicle_class_id, pax, bags, status, note, created_at)
  on public.booking_legs to authenticated, vamos_guest;
```

Column grants also close the incidental exposure of `idempotency_key`, `quote_id`, `erased_at` and
the assignment columns to a guest.

---

### F-02 · high · `settings_versions` is immutable in the comment only

Line 342: `comment on table public.settings_versions is 'Immutable policy history…'`. Line 1916
puts `settings_versions` in §14c's **ops working set**, so line 1920 executes
`grant select, insert, update, delete on public.settings_versions to vamos_staff`, gated only by
`settings_versions_staff_gate` (`app.is_staff()` — dispatcher **or** admin). There is no
`tg_append_only` trigger on it (the trigger list at 1607–1621 omits it), no `revoke update, delete`
(1625–1630 omits it), no `force row level security` (1636–1641 omits it), and no admin-only
restrictive policy (only `rate_versions` and `staff` get one, 1974–1982). `tg_audit_row` records
the change but does not prevent it.

Exploit — a dispatcher session, aal2, no admin:

```sql
begin;
  set local role vamos_staff;
  select set_config('request.jwt.claims',
    '{"sub":"<dispatcher uid>","aal":"aal2","app_metadata":{"vamos_role":"dispatcher"}}', true);
  update public.settings_versions
     set free_cancel_hours = 0,
         cancellation_tiers = '[{"from_hours_before":0,"refund_percent":0}]'::jsonb,
         airport_waiting_minutes = 0
   where slug = 'launch-baseline';                                    -- succeeds
commit;
```

Every `price_snapshots.settings_version_id` (line 1183, `on delete restrict`) now points at a row
that no longer says what it said when the booking was sold. This is the exact failure the draft
argues against for pricing rows at 583–587 (*"a snapshot's provenance would start pointing at
mutated rows. That is the exact failure `price_snapshots` exists to prevent"*). Money impact is
bounded because `price_snapshots.policy` carries a copy (1188, 1233–1239) — but the versioned
history that proves what the copy was taken from is rewritable, which is a repudiation hole, not a
cosmetic one.

Fix — give it the same four layers `price_snapshots` gets:

```sql
create trigger settings_versions_append_only before update or delete on public.settings_versions
  for each row execute function public.tg_append_only();
revoke update, delete on public.settings_versions
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;
alter table public.settings_versions force row level security;
create policy settings_versions_admin_write on public.settings_versions
  as restrictive for insert to vamos_staff with check ((select app.is_admin()));
```

---

### F-03 · high · `TRUNCATE` bypasses all four append-only layers

Lines 1591–1605 define `tg_append_only()` and 1607–1621 attach it as `before update or delete …
for each row`. Line 1625 revokes `update, delete` — not `truncate`. Lines 119–125 revoke default
privileges from `vamos_edge, vamos_public, anon, authenticated` — **not** from `service_role`, and
Supabase's project default is `alter default privileges in schema public grant all on tables to
… service_role`, where `ALL` includes `TRUNCATE`. `TRUNCATE` fires only `BEFORE TRUNCATE`
*statement* triggers, of which there are none, and RLS (including `FORCE`) does not apply to
`TRUNCATE` at all. The word `truncate` appears nowhere in the draft as a privilege (only
`ip_truncated` and prose about `db reset`).

Exploit — the exact scenario the STRIDE table names ("Audit rows mutated or deleted by
`service_role` (carries BYPASSRLS)"), e.g. a service-role key leaked into a Queue consumer:

```sql
-- one statement, as service_role
truncate public.audit_log, public.booking_events, public.consent_log,
         public.price_snapshots, public.price_snapshot_legs, public.booking_refunds cascade;
```

No trigger fires, no policy applies, no error. §14e's promise at 2107–2114 (*"The append-only
triggers in §10 still bind the service role, because a trigger is not RLS"*) is false for this verb.
`stripe_events` is worse still: `service_role` also keeps plain `DELETE` there (F-11), which is the
webhook-replay attack the draft itself describes at 1932–1934.

Fix — close the privilege and add the missing trigger level:

```sql
revoke truncate on all tables in schema public
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;
alter default privileges in schema public revoke truncate on tables from service_role;

-- tg_append_only already raises unconditionally outside its price_snapshots carve-out,
-- and that carve-out is guarded by tg_op = 'UPDATE', so it is safe as a statement trigger.
create trigger price_snapshots_no_truncate     before truncate on public.price_snapshots
  execute function public.tg_append_only();
create trigger price_snapshot_legs_no_truncate before truncate on public.price_snapshot_legs
  execute function public.tg_append_only();
create trigger booking_events_no_truncate      before truncate on public.booking_events
  execute function public.tg_append_only();
create trigger booking_refunds_no_truncate     before truncate on public.booking_refunds
  execute function public.tg_append_only();
create trigger audit_log_no_truncate           before truncate on public.audit_log
  execute function public.tg_append_only();
create trigger consent_log_no_truncate         before truncate on public.consent_log
  execute function public.tg_append_only();
create trigger stripe_events_no_truncate       before truncate on public.stripe_events
  execute function public.tg_append_only();
create trigger booking_notifications_no_truncate before truncate on public.booking_notifications
  execute function public.tg_append_only();
```

---

### F-04 · high · a `live` rate version can be created by `INSERT`, skipping the launch gate

Line 623: `create trigger rate_versions_transition **before update** on public.rate_versions`. The
function at 570–620 enforces legal transitions, matrix completeness and `published_at`/`published_by`
attribution — all on the `old.status → new.status` diff, so none of it runs on `INSERT`. The only
insert-time guard is the CHECK at 546–547, `status = 'draft' or published_at is not null`, which the
attacker satisfies by supplying `published_at`. The partial unique index at 555–556
(`rate_versions_one_live`) only bites if a live row already exists — and before launch, by design,
none does.

Exploit — an admin at aal2 (or anything holding `service_role`, or a seed file), one statement:

```sql
begin;
  set local role vamos_staff;
  select set_config('request.jwt.claims',
    '{"sub":"<admin uid>","aal":"aal2","app_metadata":{"vamos_role":"admin"}}', true);
  insert into public.rate_versions (slug, label, status, published_at, published_by)
  values ('backdoor', 'x', 'live', now(), '00000000-0000-0000-0000-000000000000');
commit;
```

`pricing_live` — defined at 528–530 as *"exactly one version has `status='live'`"* — is now true.
Every completeness check the draft calls "the most guarded statement in the schema" (566–569) was
skipped, `published_by` is attacker-supplied rather than stamped, and combined with F-12 the
attacker then inserts priced children into it. `charge_gate.test.sql` (2170) does not cover this
path; `rate_version_publish.test.sql` (2166) tests only `UPDATE`.

Fix:

```sql
create or replace function public.tg_rate_version_insert_draft() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'draft' then
    raise exception 'a rate_version is created draft and published by UPDATE, never inserted live'
      using errcode = 'restrict_violation';
  end if;
  new.published_at := null; new.published_by := null;
  return new;
end $$;

create trigger rate_versions_insert_draft before insert on public.rate_versions
  for each row execute function public.tg_rate_version_insert_draft();
```

---

### F-05 · medium · `0022` subtracts the grants `0020` and `0021` established

The draft asserts twice that the policy migrations are additive after `0020`'s clean slate — at
1858–1861 and 2218–2221. They are not. `0022`'s ops loop at 1919 runs

```sql
execute format('revoke all on public.%I from anon, authenticated, vamos_edge, vamos_public', t);
```

over an array (1913–1918) that includes **`customers`, `bookings`, `booking_legs`**, and the ledger
loop at 1943 runs the same revoke (plus `vamos_staff`) over an array (1937–1940) that includes
**`price_snapshots`, `price_snapshot_legs`**. Those are exactly the five tables `0020` granted to
`authenticated` at 1806–1807 and 1814–1816. `0023` re-grants only `content_strings`, `reviews`,
`vehicle_classes`, `service_zones` (2026–2031), so the five never come back.

After a clean `supabase db reset`, every signed-in customer query raises `42501` — `/account`,
`/account/bookings`, `/account/bookings/[ref]`, the whole of DATA-02. It fails **closed**, so this is
availability rather than confidentiality, but it is the single most likely thing to break on day
one, and `bookings_customer_rls.test.sql` (2161) is the test that will surface it as a confusing
`42501` rather than as "wrong rows".

(`vamos_guest` survives only because it is absent from both revoke lists — which is luck, not
design: reordering `0021` after `0022` would silently kill DATA-03 too.)

Fix — make the per-table revokes name only the roles that must not hold the table, and never the
ones an earlier migration deliberately granted:

```sql
-- in 0022, ops working set
execute format('revoke all on public.%I from anon, vamos_edge, vamos_public', t);
-- and, for the five tables the customer/guest roles legitimately read, do not revoke at all:
--   customers, bookings, booking_legs, price_snapshots, price_snapshot_legs
```

plus a pgTAP assertion that `authenticated` holds `SELECT` on exactly those five and on nothing
else (see acceptance criteria).

---

### F-06 · medium · the charge gate does not bind the payment to the booking's *chosen* snapshot

`tg_payment_matches_snapshot` (1327–1365) checks `is_chargeable`, non-draft version, non-expired
quote, `charged_rappen = s.total_rappen` and `new.booking_id = s.booking_id`. It never checks
`new.snapshot_id = (select price_snapshot_id from public.bookings where id = new.booking_id)`.

`price_snapshots_quote_class` (1263) makes one row per `(quote_id, vehicle_class_id)` — the quote
endpoint prices **every** class in one call (1174–1177). `booking_id` is set by the one permitted
append-only mutation (1596–1602), and nothing makes it unique per booking: `price_snapshots_booking`
(1264) is a plain index. So a server path (or `service_role` in a Queue consumer) can bind the
Economy snapshot to a booking whose legs are a Van, and the gate approves the Economy total.

Separately, PAY-05's "cannot double-charge" rests on `bookings.idempotency_key` (855–858, 872–873),
which protects *booking creation*. Two distinct PaymentIntents against one booking both reaching
`status='succeeded'` violate the `bookings` comment at 852 ("one price, one Stripe charge") and
nothing in the schema notices.

Fix:

```sql
-- inside tg_payment_matches_snapshot, after the booking_id check
if new.snapshot_id is distinct from
   (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id) then
  raise exception 'payment cites snapshot %, but booking % is bound to %',
    new.snapshot_id, new.booking_id,
    (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id)
    using errcode = 'restrict_violation';
end if;

create unique index booking_payments_one_success
  on public.booking_payments (booking_id) where status = 'succeeded';
create unique index price_snapshots_one_per_booking
  on public.price_snapshots (booking_id) where booking_id is not null;
```

---

### F-07 · medium · coupon caps are advisory

`coupons.global_limit` and `per_user_limit` (728–729) have `check (… >= 0)` and nothing else.
`coupon_redemptions` (747–756) enforces only `unique (coupon_id, booking_id)` — one redemption per
*booking*, which is not a cap. No trigger, no exclusion constraint, no counter column.

Exploit on a `global_limit = 1` code (and identically on `per_user_limit = 1`), two concurrent
sessions under the default READ COMMITTED:

```
S1: begin; select count(*) from coupon_redemptions where coupon_id = 7;   -- 0, under limit
S2: begin; select count(*) from coupon_redemptions where coupon_id = 7;   -- 0, under limit
S1: insert into coupon_redemptions (coupon_id, booking_id) values (7, :b1); commit;
S2: insert into coupon_redemptions (coupon_id, booking_id) values (7, :b2); commit;
-- both succeed; a single-use code redeemed twice
```

`coupon_redemptions_customer` (758) is an index, not a constraint. D-29 (02-CONTEXT:179) moves
consumption to payment time, which narrows the window but does not serialise it.

Fix — serialise on the coupon row inside the redemption:

```sql
create or replace function public.tg_coupon_redemption_caps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.coupons%rowtype; n integer;
begin
  select * into c from public.coupons where id = new.coupon_id for update;   -- the lock point
  if c.id is null or not c.active then
    raise exception 'coupon unavailable' using errcode = 'restrict_violation';
  end if;
  if c.valid_from is not null and now() < c.valid_from
     or c.valid_until is not null and now() >= c.valid_until then
    raise exception 'coupon outside its window' using errcode = 'restrict_violation';
  end if;
  if c.global_limit is not null then
    select count(*) into n from public.coupon_redemptions where coupon_id = new.coupon_id;
    if n >= c.global_limit then
      raise exception 'coupon global limit reached' using errcode = 'restrict_violation';
    end if;
  end if;
  if c.per_user_limit is not null and new.customer_id is not null then
    select count(*) into n from public.coupon_redemptions
     where coupon_id = new.coupon_id and customer_id = new.customer_id;
    if n >= c.per_user_limit then
      raise exception 'coupon per-user limit reached' using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end $$;

create trigger coupon_redemptions_caps before insert on public.coupon_redemptions
  for each row execute function public.tg_coupon_redemption_caps();
```

---

### F-08 · medium · the manage-token hash is a bearer credential that every dispatcher can read

`booking_access_tokens.token_hash bytea not null unique` (1035) is compared hash-to-hash by
`app.booking_has_manage_token` (1056–1064) and is accepted **directly as an argument** by
`manage_booking_cancel(p_token_hash bytea, …)` (1083–1085). It is therefore not a verifier in the
password sense — it is the credential, and possession of it is sufficient. §14c puts
`booking_access_tokens` in the ops working set (1916), so line 1920 grants every dispatcher
`select, insert, update, delete` on it, table-wide.

Exploit — dispatcher at aal2, or anything that later reads a backup, a support export or an
ops-side SQL injection:

```sql
begin; set local role vamos_staff;
  select set_config('request.jwt.claims',
    '{"sub":"<dispatcher uid>","aal":"aal2","app_metadata":{"vamos_role":"dispatcher"}}', true);
  select booking_id, encode(token_hash,'hex') from public.booking_access_tokens;   -- every link
commit;

begin; set local role vamos_guest;
  select set_config('request.vamos.manage_token_hash', '<the hex above>', true);
  select * from public.bookings;                                        -- the guest surface
  select * from public.manage_booking_cancel(decode('<the hex above>','hex'), null);
commit;
```

A dispatcher can already read bookings, so the marginal read is small; what is new is (a) an
unaudited mutation path that leaves `actor_kind='guest'` rather than `staff`, and (b) permanent
harvestability of every customer's manage credential. The resend-link flow the table exists for
(1020–1022) needs `id, booking_id, expires_at, revoked_at, use_count` — never the hash.

Fix:

```sql
revoke all on public.booking_access_tokens from vamos_staff;
grant select (id, booking_id, purpose, created_at, expires_at, revoked_at, last_used_at, use_count)
  on public.booking_access_tokens to vamos_staff;
grant update (revoked_at) on public.booking_access_tokens to vamos_staff;
-- issuance and rotation move to a SECURITY DEFINER function, as mutations already do for guests.
```

Residual worth recording in the draft rather than fixing: the hash appears as a bind parameter on
both the read path (`set_config('request.vamos.manage_token_hash', …)`) and the write path, so a
database with `log_statement = 'all'` logs a working credential. The §8 claim at 1026–1028 ("the
raw value never reaches `pg_stat_statements` or a query log") is true of the *raw token* and
irrelevant to the attacker, who only needs the hash. An HMAC with a server-held pepper would restore
the property; at minimum say so.

---

### F-09 · medium · `manage_booking_cancel` enforces no cancellation window

The docstring at 1126–1127 says *"The refund percent comes from the snapshot's stored policy, never
today's settings (LIFE-03)"*. The body never reads `price_snapshots.policy`, never reads
`settings_versions`, never looks at `booking_legs.scheduled_at`, and returns `null::numeric` (1130).
The only guard is the booking-status list at 1096–1099.

Exploit — a guest with a valid, unexpired token, at any moment including after the pickup time has
passed and the driver is at the kerb:

```sql
begin; set local role vamos_guest;
  select * from public.manage_booking_cancel(decode('<hash>','hex'), 2::smallint);
commit;
-- leg 2 -> 'cancelled', booking rolled to 'partially_cancelled'
```

Two consequences beyond the obvious: the cancelled leg drops out of both exclusion-constraint
predicates (964, 971), silently freeing an assignment that Phase 8 believes is held; and a
zero-notice cancellation is recorded with no tier, so Phase 9 has no basis to reconstruct what
should have been refunded. Phase 2 ships this function live to `vamos_guest` (1135), so "Phase 9
fills the tier calculation" is not a deferral — it is an open window in the interim.

Fix — read the policy from the snapshot the booking pinned, in the same function, and refuse a
past-pickup cancellation outright:

```sql
-- after the status check, before the leg UPDATE
if exists (select 1 from public.booking_legs l
            where l.booking_id = v.id
              and (p_leg_seq is null or l.leg_seq = p_leg_seq)
              and l.scheduled_at <= now()) then
  raise exception 'not_cancellable' using errcode = 'P0001';
end if;

select (s.policy ->> 'free_cancel_hours')::numeric into v_free
  from public.price_snapshots s where s.id = v.price_snapshot_id;
-- v_free (and the cancellation_tiers array in the same jsonb) is the LIFE-03 basis;
-- record it on the booking_events row Phase 9 writes, even while refund_percent stays null.
```

---

### F-10 · medium · erasure and append-only are mutually exclusive as written

Line 1690 states the erasure step: *"On erasure, `customer_id → NULL`; the row itself stays."* Line
1617 attaches `tg_append_only` to `consent_log`, and 1603–1605 raise on **any** `UPDATE` that is not
the `price_snapshots.booking_id` carve-out. The documented erasure step therefore raises
`restrict_violation`. Line 1625–1630 also revokes `UPDATE` on `consent_log` from `service_role`, so
there is not even a role that could attempt it.

Second half: `tg_audit_row` (1560–1573) is attached to `customers` (1575–1578, deliberately —
*"`before_value`/`after_value` on customers are the redaction evidence Phase 10 needs"*). It copies
`to_jsonb(old)` and `to_jsonb(new)` whole, so every historical `full_name`, `email`, `phone` and
`note` lands in `audit_log`, which then gets the full four-layer append-only treatment (1619,
1625–1630, 1640). After a redaction, the pre-redaction PII survives in a table that, by design, has
no reachable erasure path — and `booking_events.payload` (1526) and `consent_log.user_agent` /
`ip_truncated` (1682–1683) are in the same position.

This is a legal finding, not an attack: it needs counsel's sign-off, not just a schema change. The
minimal DDL that makes the *documented* behaviour possible:

```sql
-- (a) allow exactly the one erasure mutation on consent_log, mirroring the price_snapshots carve-out
--     inside tg_append_only:
if tg_op = 'UPDATE' and tg_table_name = 'consent_log'
   and old.customer_id is not null and new.customer_id is null
   and to_jsonb(new) - 'customer_id' = to_jsonb(old) - 'customer_id' then
  return new;
end if;
grant update (customer_id) on public.consent_log to service_role;

-- (b) keep the audit diff without keeping the identifiers:
--     in tg_audit_row, for customers only, strip the PII and store a digest instead.
case when tg_table_name = 'customers'
     then (to_jsonb(old) - 'full_name' - 'email' - 'phone' - 'note')
          || jsonb_build_object('pii_digest',
               encode(extensions.digest(coalesce(old.email,'')::text, 'sha256'), 'hex'))
     else to_jsonb(old) end
```

---

### F-11 · medium · `stripe_events.payload` is dispatcher-readable, and the table is outside the append-only set

`stripe_events.payload jsonb not null` (1440) is the raw Stripe event: cardholder name, billing
address, email, card brand and last four, and for `customer.*` events the whole customer object.
§14c's ledger loop (1937–1951) grants `select` on it to **`vamos_staff`** — i.e. to every dispatcher,
not to admins. Compare `audit_log` and `consent_log`, which the same migration correctly restricts to
`app.is_admin()` (1963–1969).

Second half: `stripe_events` and `booking_notifications` appear in neither the `tg_append_only`
trigger list (1607–1621), the `revoke update, delete` (1625–1630), nor the `force row level
security` block (1636–1641) — which is defensible, since both legitimately take `UPDATE`
(`processed_at`, `attempts`; `sent_at`, `failed_at`). But no narrower control replaces the blanket
one, so `service_role` retains **`DELETE`** on `stripe_events`. That is precisely the attack the
draft describes at 1932–1934 (*"With `DELETE` on `stripe_events` they can drop an idempotency row so
a replayed webhook re-runs"*), closed for `vamos_staff` and left open for the role that is far more
likely to leak into a Queue consumer. §13's summary line at 1783–1786 ("the six append-only tables")
also does not match the task's expectation that `stripe_events` and `booking_notifications` are in
the evidence set — worth stating explicitly either way.

Fix:

```sql
revoke select on public.stripe_events from vamos_staff;
grant select (id, type, stripe_created, object_id, received_at, processed_at, attempts, last_error)
  on public.stripe_events to vamos_staff;                 -- payload stays out of the ops console
create policy stripe_events_admin_payload on public.stripe_events
  as restrictive for select to vamos_staff using ((select app.is_staff()));

revoke delete on public.stripe_events, public.booking_notifications from service_role;
create trigger stripe_events_no_delete before delete on public.stripe_events
  for each row execute function public.tg_append_only();
create trigger booking_notifications_no_delete before delete on public.booking_notifications
  for each row execute function public.tg_append_only();
```

---

### F-12 · medium · priced rows can be inserted straight into a live version

Lines 714–719 attach `tg_pricing_row_frozen` as `before **update or delete**` on `distance_rates`,
`surcharges` and `fixed_routes`. There is no `INSERT` branch. §6's opening claim at 526–528 —
*"Publishing a price change inserts a new version; it never `UPDATE`s a live row"* — is therefore
enforced only in one direction.

Exploit — admin at aal2 (`fixed_routes_admin_insert`, 1996–1998, is satisfied):

```sql
insert into public.fixed_routes
  (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
select rv.id, z1.id, z2.id, vc.id, 100, true                  -- CHF 1.00 ZRH -> Zermatt
  from public.rate_versions rv, public.service_zones z1, public.service_zones z2,
       public.vehicle_classes vc
 where rv.status = 'live' and z1.slug='zrh-airport' and z2.slug='zermatt' and vc.slug='van';
```

The route is immediately sellable at a price that never went through `tg_rate_version_transition`'s
completeness gate, with no new version, no `published_by`, and — because the freeze trigger does not
fire on `INSERT` — nothing recording that the live matrix was extended out-of-band.
`unique (rate_version_id, vehicle_class_id)` (642) bounds the `distance_rates` case to classes that
do not yet have a row; `fixed_routes` (655) and `surcharges` (679) are unbounded.

Fix — extend the existing trigger rather than writing a new one:

```sql
create trigger distance_rates_frozen_ins before insert on public.distance_rates
  for each row execute function public.tg_pricing_row_frozen();
create trigger surcharges_frozen_ins     before insert on public.surcharges
  for each row execute function public.tg_pricing_row_frozen();
create trigger fixed_routes_frozen_ins   before insert on public.fixed_routes
  for each row execute function public.tg_pricing_row_frozen();
```

`tg_pricing_row_frozen` already resolves the version via `coalesce(new.rate_version_id,
old.rate_version_id)` (689–690) and its `tg_op = 'UPDATE'` guard (692) means an `INSERT` against a
non-draft version falls straight through to the `raise`, which is the wanted behaviour.

---

### F-13 · medium · the "nothing new ever leaks a grant" comment is not what the DDL does

Lines 113–125. The comment at 113–118 claims *"Nothing new ever leaks a grant to ANY client-facing
role by default."* Three gaps:

1. **Functions.** Line 123–124 is
   `alter default privileges in schema public revoke all on functions from vamos_edge, vamos_public,
   anon, authenticated;`. Postgres grants `EXECUTE` on a new function to **PUBLIC**, not to those
   roles individually, and a `REVOKE … FROM anon` removes only a direct grant to `anon` — it does
   not remove the PUBLIC grant that `anon` enjoys by membership. The line is a no-op for the case it
   is written to cover. Today nothing is exploitable, because every SQL-callable `public.*` function
   is individually revoked from `public` (812, 1134, 512, 2093) and the rest return `trigger` and
   cannot be invoked directly. The invariant is what is missing, and it is the invariant a future
   migration will rely on.
2. **Schema `app`.** No `alter default privileges in schema app` exists at all, while line 101 grants
   `usage on schema app` to `anon, authenticated, vamos_guest, vamos_staff`. A new `app.*` function
   is therefore callable by all four unless someone remembers a `revoke`. `app.manage_token_hash()`
   (146) already sits in this state — harmless, since it only reports the caller's own GUC, but it
   shows the pattern is not held.
3. **`CREATE` on schema `public`.** Never revoked. Line 67 sets the database `search_path` to
   `"$user", public, extensions`, and six trigger functions omit `set search_path` (F-20). On a
   Supabase project provisioned before the PG15 default change, `anon`/`authenticated` hold `ALL` on
   schema `public`, which includes `CREATE`.

Fix:

```sql
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app    revoke execute on functions from public;
alter default privileges in schema app    revoke all    on tables    from public,
  vamos_edge, vamos_public, anon, authenticated, vamos_guest, vamos_staff;
revoke create on schema public from public, anon, authenticated,
  vamos_guest, vamos_staff, vamos_edge, vamos_public;
-- and make the ADP statements explicit about whose objects they cover:
alter default privileges for role postgres, supabase_admin in schema public
  revoke all on tables from vamos_edge, vamos_public, anon, authenticated;
```

---

### F-14 · medium · `charged_currency = 'CHF'` is incompatible with ADR-014 §1

Line 1298: `charged_currency char(3) not null default 'CHF' check (charged_currency = 'CHF')`, and
line 1186 the same for `price_snapshots.currency`. ADR-014 §1 (accepted 2026-08-22, *"binds Phase 2
migrations"*) says the charge currency is **the currency the customer chose**, that Stripe charges in
that currency, and that the customer may change it again on the Stripe Checkout page. The draft
predates that and still carries ADR-004's superseded rule at 33–35, 249 and 651.

The sharp edge is not the CHECK — it is the charge gate. Line 1352–1355 compares
`new.charged_rappen` to `s.total_rappen`, which is a CHF minor-unit figure. A EUR settlement will
never equal it, so shipping ADR-014 §1 means either weakening the one comparison the draft calls
*"the layer of QUOTE-10 with no off switch"* (1293–1295), or discovering the conflict in Phase 7
under launch pressure. That is how price-integrity checks get deleted.

Fix — separate the locked CHF figure from the settlement figure so the gate keeps comparing
like with like:

```sql
alter table public.booking_payments
  drop constraint if exists booking_payments_charged_currency_check,
  add  constraint booking_payments_charged_currency
       check (charged_currency in ('CHF','EUR','USD','AED')),
  add  column chf_total_rappen rappen not null,      -- what the gate compares
  add  column fx_rate          numeric(18,8),        -- null iff charged_currency = 'CHF'
  add  column fx_source        text,                 -- 'stripe'
  add  column fx_quoted_at     timestamptz,
  add  constraint booking_payments_fx_pair
       check ((charged_currency = 'CHF') = (fx_rate is null));
-- in tg_payment_matches_snapshot, replace the amount check with:
--   if new.chf_total_rappen is distinct from s.total_rappen then raise …
```

`price_snapshots.currency` stays `CHF`-only — the snapshot is the locked CHF total, which is exactly
what ADR-014 §1 says ("The locked number is the **CHF rappen total**").

---

### F-15 · medium · the draft is pre-ADR-014 on policy seeds, `first`, and two missing columns

`research/doc-drift-2026-08-23.md` audited CLAUDE.md, PROJECT.md, the ADRs and GSD-LAUNCH — it did
not audit 02-SCHEMA-DRAFT.md, and the draft is the artefact the migrations get cut from. Four
concrete conflicts with ADR-014 §5/§6 and 02-CONTEXT D-35/D-36:

| Draft | Says | ADR-014 / D-35 / D-36 says |
|---|---|---|
| 328 (comment) | `ADR-002: SEED NULL. Never 60 / 15.` | airport 60, city 15 — ADR-002 is closed |
| 2239 (seed) | `airport_waiting_minutes` and `city_waiting_minutes` **NULL**; `min_advance_minutes` NULL | 60 / 15 / 180 |
| 2238 (seed) | `manage_link_validity_days = NULL` | 30 days |
| 358, 2235 | `check (slug in ('economy','business','first','van'))`; seed "economy 3/3, business, first, van 8/8" | `first` does not ship; Economy 3/3, Business 3/3, Van 8/8 |

The manage-link one is a launch blocker rather than drift: `booking_access_tokens.expires_at` is
`NOT NULL` (1037–1039) and is *"last leg's `scheduled_at` + `settings.manage_link_validity_days`"*,
with issuance told to refuse rather than invent a window. Seeding NULL means **no guest manage link
can be issued in a fresh environment** — DATA-03 dead on arrival.

Two columns named by D-35 do not exist anywhere in the schema: `round_trip_discount_percent` (10 %)
and the night-window predicate (`20:00–06:00 Europe/Zurich`). `settings_versions` (312–344) has no
home for either, so the Phase 4 engine will hard-code them — which is exactly the LIFE-03 failure
`settings_versions` exists to prevent, and puts a number the owner approved outside the versioned
record.

Fix:

```sql
alter table public.settings_versions
  add column round_trip_discount_percent numeric(5,2) check (round_trip_discount_percent between 0 and 100),
  add column night_window_start time,
  add column night_window_end   time;

alter table public.vehicle_classes
  drop constraint vehicle_classes_slug_check,
  add  constraint vehicle_classes_slug_check check (slug in ('economy','business','van'));
```

and in the seed row: `airport_waiting_minutes = 60`, `city_waiting_minutes = 15`,
`min_advance_minutes = 180`, `manage_link_validity_days = 30`,
`round_trip_discount_percent = 10`, `night_window_start = '20:00'`, `night_window_end = '06:00'`,
three vehicle classes. Every `*_rappen` and `percent` **stays NULL** — none of the above is a CHF
price, and the draft's Law-04 discipline at 2263–2268 is correct and must not be loosened.

---

### F-16 · low · `next_booking_reference()` is unreachable from the path that needs it

`bookings.reference` defaults to `public.next_booking_reference()` (817–818). A column default is
evaluated as the **inserting** role. Line 812–813 revokes the function from `public` and grants it to
`service_role` only, and `reference_format.test.sql` (2172) *asserts* it is not executable by
`vamos_staff`. But §14c grants `vamos_staff` `INSERT` on `bookings` (1916, 1920) for OPS-04's
phone booking. A dispatcher creating a booking without an explicit `reference` gets
`42501 permission denied for function next_booking_reference`.

This is a functional break, but the reason to flag it is the repair someone will reach for at 2 a.m.
— `grant execute … to authenticated` — which re-opens exactly the anonymous counter-exhaustion the
comment at 789–793 exists to prevent. Fix: keep the revoke, grant narrowly, and update the test.

```sql
grant execute on function public.next_booking_reference() to vamos_staff;
-- reference_format.test.sql asserts NOT executable by anon and authenticated; vamos_staff yes.
```

### F-17 · low · the `rappen` domain constrains nothing

Line 263: `create domain rappen as integer;`. Every non-negativity check is repeated per column
(639–641, 649, 671, 730, 1186–1189, 1290+, 1398–1402) and one is missing:
`bookings.price_total_rappen` (848) has none. It is a denormalised cache, so the blast radius is a
wrong number on the ops board — but the pattern guarantees the next money column will miss too. All
amounts in the schema are stored non-negative (`discount_rappen` is positive and subtracted, 1190),
so the domain can carry the check:

```sql
create domain rappen as integer check (value >= 0);
```

### F-18 · low · the dispatcher escape hatch on priced children can never evaluate true

Lines 1990–2010 build a restrictive `_admin_update` policy whose `USING` is
`app.is_admin() or exists (select 1 from public.rate_versions rv where rv.id = X.rate_version_id and
rv.status <> 'draft')`, with the comment at 1987–1989 explaining that *"UPDATE stays open to a
dispatcher because the freeze trigger has already narrowed it to the `live` / `available` toggle"*.
That subquery reads `public.rate_versions` **as `vamos_staff`**, and `rate_versions_admin_write`
(1974–1976) is `as restrictive for all`, so for a dispatcher the subquery returns zero rows — the
draft itself notes this consequence at 2012–2014. The `exists` is therefore always false for a
dispatcher and the policy collapses to `is_admin()`.

It fails closed, so it is low. The reason to record it: the natural "fix" is to narrow
`rate_versions_admin_write` from `FOR ALL` to `FOR INSERT, UPDATE, DELETE`, which restores dispatcher
`SELECT` — and re-opens `update rate_versions set status='live'` to a dispatcher through the
permissive `rate_versions_staff_all`, the exact hazard 1971–1973 was written to close. The correct
fix is a definer helper:

```sql
create or replace function app.rate_version_published(p_id bigint) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rate_versions rv where rv.id = p_id and rv.status <> 'draft')
$$;
revoke all on function app.rate_version_published(bigint) from public;
grant execute on function app.rate_version_published(bigint) to vamos_staff;
-- then use app.rate_version_published(X.rate_version_id) in the three _admin_update policies.
```

### F-19 · low · the hook does not strip an inbound `vamos_role`

`custom_access_token_hook` (498–510) writes `app_metadata.vamos_role` only `if v_role is not null`.
GoTrue merges `auth.users.raw_app_meta_data` into the `app_metadata` claim before the hook runs, so
a `vamos_role` already present there survives untouched when no active staff row exists.
`app.is_staff()` still requires the `public.staff` row (165), so there is no escalation today — the
belt holds. The exposure is a future consumer that trusts the claim alone (Next middleware, a log
enricher, a Realtime policy written from the claim). Make the hook authoritative in both directions:

```sql
  claims := event->'claims';
  claims := jsonb_set(claims, '{app_metadata}',
                      coalesce(claims->'app_metadata','{}'::jsonb) - 'vamos_role');
  if v_role is not null then
    claims := jsonb_set(claims, '{app_metadata,vamos_role}', to_jsonb(v_role));
  end if;
```

### F-20 · low · six trigger functions omit `set search_path`

`tg_pricing_row_frozen` (685–686), `tg_leg_snapshot_buffer` (983–984),
`tg_snapshot_rate_version_flag` (1245–1246), `tg_payment_matches_snapshot` (1327–1328),
`tg_payment_update_whitelist` (1374–1375) and `tg_append_only` (1591–1592) all declare
`language plpgsql as $$` with no `set search_path = ''`. Every other function in the file pins it,
and 494–497 states the rule. All six are `SECURITY INVOKER` and reference their tables
schema-qualified, so there is no live escalation — but combined with F-13's un-revoked `CREATE` on
schema `public` the exception is not worth keeping. Add `set search_path = ''` to all six.

### F-21 · low · the actual trust assumption is never written down

Lines 84–90 say *"The security boundary is the grant, not the claim"*, which is true and well
implemented. What the draft never says is the corollary a reviewer needs: `request.jwt.claims` is an
unauthenticated GUC that any session can `set_config`, and `vamos_edge` is granted `SET ROLE` into
`vamos_staff` (108). So **anyone holding the `vamos_edge` password can mint an admin session**:

```sql
-- as vamos_edge, with a staff user_id read from any leaked booking_events.actor_id
begin;
  set local role vamos_staff;
  select set_config('request.jwt.claims',
    '{"sub":"<any active staff uid>","aal":"aal2","app_metadata":{"vamos_role":"admin"}}', true);
  select * from public.customers;
commit;
```

`app.is_staff()`'s third condition (165, the active `staff` row) makes this need a *real* staff
`sub`, which is defence in depth worth crediting — but staff uuids appear in `booking_events.actor_id`
and `audit_log.actor_id`, so it is not a secret. The honest statement is: **the `vamos_edge` password
has the same blast radius as the `service_role` key and must be handled in the same tier.** Add it to
§2 next to line 128, and to the Phase 3 secrets matrix.

### F-22 · low · assert the `postgres` `BYPASSRLS` assumption rather than depending on it

`audit_log` and `consent_log` get `force row level security` (1640–1641) and have **no `INSERT`
policy for any role**. Both are written by `SECURITY DEFINER` functions owned by the migration role
(`tg_audit_row`, 1560; `record_consent`, 2075). `FORCE ROW LEVEL SECURITY` subjects the table owner
to RLS; only the `BYPASSRLS` role attribute overrides it. Supabase's `postgres` carries `BYPASSRLS`,
so this works — but it is an unstated environment dependency, and the standard hardening move for a
definer function (re-own it to a minimal non-`BYPASSRLS` role) would silently break every audited ops
write and the entire public cookie banner. Either state it, or remove the dependency:

```sql
create policy audit_log_definer_insert   on public.audit_log   for insert to postgres with check (true);
create policy consent_log_definer_insert on public.consent_log for insert to postgres with check (true);
```

and assert both write paths in pgTAP under `FORCE RLS`.

---

## Passed checks

- **Fail-closed identity boundary (tables).** `vamos_edge` is `login … noinherit` with `inherit
  false, set true` memberships and holds no table grant; a query without the transaction wrapper
  raises `42501`. Closing statement, line 87–90: *"A query issued without the transaction wrapper
  raises `42501 insufficient_privilege`; it does not return the previous request's rows."* PASS on
  tables; see F-13 for functions.
- **Helper hygiene.** `app.jwt()`, `app.uid()`, `app.manage_token_hash()` are `stable set search_path
  = ''` (133–148); `app.is_staff()`, `app.is_admin()`, `app.booking_has_manage_token()` are `stable
  security definer set search_path = ''` (160–190) and all three are revoked from `public`
  (191–192). `app.jwt()` handles the unset GUC with `coalesce(nullif(…,'')::jsonb,'{}')` (135).
  Closing statement, line 199–201.
- **Guest token, read path.** Hash-to-hash only, `token_hash bytea not null unique` with an
  `octet_length = 32` check (1035, 1041); `vamos_guest` holds no grant on the token table, so the
  policy must go through the definer helper (1866–1871); `revoked_at is null` and `expires_at >
  now()` are enforced in the helper the **policy** calls, not in app code (1060–1064); an unset GUC
  yields zero rows rather than an error. Closing statement, line 1895–1897.
- **Child-row policies genuinely inherit the parent.** `legs_select_via_parent`,
  `snapshots_select_via_parent`, `snapshot_legs_select_via_parent` (1826–1841) and their guest
  equivalents (1880–1888) subquery a table the invoking role is itself RLS-filtered on, so parent and
  child cannot disagree. Closing statement, line 1824–1825.
- **AUTH-05 is enforced in SQL, not middleware.** `app.is_staff()` requires the `app_metadata`
  role claim **and** `aal = 'aal2'` **and** an active `public.staff` row (160–166); it is ANDed onto
  every ops table by a restrictive `_staff_gate` policy (1922–1924), onto the ledger set (1946–1948),
  and onto the Realtime channel (2146–2148). A `staff.active = false` user holding a still-valid JWT
  is refused by the third condition on the next query, not the next token. Closing statement, line
  2150–2153.
- **Ledger set is read-only for staff.** Separate loop, `revoke all` then `grant select` only, plus a
  restrictive `with check (false)` (1941–1951), with the forgery scenarios spelled out. Closing
  statement, line 1928–1935.
- **Consent cannot be forged.** `record_consent` takes the subject from a server-set GUC and the
  customer from the verified JWT; neither is an argument (2066–2092), and no role holds `INSERT` on
  the table. Closing statement, line 2097–2099.
- **`rate_version_is_live` is not caller-supplied.** Overwritten by a `BEFORE INSERT` trigger from
  `rate_versions.status`, with a hard raise if the version does not exist (1245–1259). Closing
  statement, line 1176–1181.
- **Charge gate covers four of five cases.** Non-chargeable snapshot, still-draft version, expired
  quote and amount mismatch are all refused server-side by a trigger with no off switch
  (1331–1360), and the placement at intent-creation rather than webhook time is correctly reasoned.
  Closing statement, line 1293–1295. (Fifth case — the snapshot/booking binding — is F-06.)
- **`booking_payments` update whitelist is diff-based.** `to_jsonb(new) - 'status' - 'captured_at' is
  distinct from to_jsonb(old) - …` (1377–1380) means a column added later is protected by default
  rather than forgotten. Closing statement, line 1367–1372.
- **Exclusion constraints are correctly scoped.** Two independent partial constraints rather than one
  combined (955–957); the `where` predicate excludes a NULL resource and `cancelled` / `no_show`
  (964, 971), so an unassigned or cancelled leg neither blocks nor is blocked; the empty-range hole
  is closed twice — `greatest(coalesce(duration,0), 30)` in the generated column (940) and
  `greatest(chauffeur_turnaround_minutes, 1)` in the buffer trigger (996) — and a third time by
  `booking_legs_assignable` / `booking_legs_range_nonempty` (925–933). `stored` is explicit and
  correct for PG 17.6. Closing statement, line 1003–1006.
- **Trigger ordering around the generated column is safe.** `tg_leg_snapshot_buffer` is `before
  insert or update of assigned_chauffeur_id, assigned_vehicle_id … for each row` (999–1001); BEFORE
  row triggers run before the `STORED` generated column is computed and before constraint checking,
  so the buffer is always in the range the exclusion constraint sees. `DEFERRABLE INITIALLY
  IMMEDIATE` changes when the check runs, not what it sees. Closing statement, line 946–953.
- **`settings` is not exposed raw.** `settings_public` is a deliberately definer-semantics view over
  seven customer-facing columns with `id = 1` fixed; `public.settings` stays revoked from every
  public role, and the reasoning for not using `security_invoker` is correct. Closing statement, line
  2055.
- **Realtime is closed to customers.** Broadcast on a private channel rather than Postgres Changes,
  no ops table in the `supabase_realtime` publication, no permissive `authenticated` policy added to
  any ops table, `select` gated on `realtime.topic() = 'ops:board' and app.is_staff()` (2140–2142),
  and client publishing blocked by a restrictive `with check (false)` (2144–2145). Closing statement,
  line 2150–2153.
- **The access-token hook is correctly scoped.** `supabase_auth_admin`-only `EXECUTE`, revoked from
  `authenticated`/`anon`/`public` (511–512), pinned `search_path`, an explicit
  `staff_auth_admin_read` policy so the grant is not silently defeated by RLS (482–484), reads
  `staff` and never `user_metadata`, and never writes the top-level `role` claim. Closing statement,
  line 519–521.
- **Seed obeys Law 04.** One `draft` rate version and never `live`, every `*_rappen` / `percent`
  NULL, `is_chargeable` therefore false everywhere, and the charge gate refuses every insert in a
  fresh environment — by data, not by a UI conditional. Closing statement, line 2266–2268.

## Threat coverage

The ten STRIDE rows from `02-RESEARCH.md` § Security Domain:

| # | Pattern | STRIDE | Status | Note |
|---|---|---|---|---|
| 1 | Identity leak across a pooled Hyperdrive connection | Info. Disclosure | **partial** | Structurally closed for a *missing* wrapper (fails `42501`). A `set_config(…, is_local => false)` — session-scoped instead of transaction-scoped — still persists onto the pooled connection and the next request inherits the previous identity. Nothing in SQL can detect it; needs a two-requests-one-connection integration test in Phase 3. |
| 2 | Forgotten RLS wrapper on a query path | Elev. of Privilege | **closed** | Privilege-less `vamos_edge` + fail-closed `revoke all` baseline (87–90, 1803–1804). |
| 3 | User-writable role claim via `user_metadata` | Spoofing | **closed** | Hook reads `public.staff` only; `app.is_staff()` re-checks the row (160–166). F-19 is hardening, not a hole. |
| 4 | Enrolled-but-unverified MFA factor treated as authenticated | Spoofing | **closed** | `aal = 'aal2'` is checked in SQL inside `app.is_staff()`/`app.is_admin()` and ANDed onto every ops table and the Realtime channel; `staff.mfa_enrolled` is explicitly labelled a UX gate (461). |
| 5 | Single-use manage token burned by mail-client prefetch | DoS | **closed** | Reusable, hashed, revocable, rotatable (1024–1045). |
| 6 | Double-charge on a retried checkout submission | Tampering | **partial** | `bookings.idempotency_key` is unique-partial but **nullable** (855, 872) so idempotency is opt-in, and it protects booking creation, not settlement — two PaymentIntents on one booking both succeed (F-06). |
| 7 | Charging against a non-live or since-edited rate version | Tampering | **partial** | Gate is strong (F-06 PASS list) but the version can be born `live` without the completeness check (F-04) and the live matrix can be extended by `INSERT` (F-12). |
| 8 | Audit rows mutated or deleted by `service_role` | Repudiation | **open** | `TRUNCATE` bypasses all four layers (F-03); `service_role` keeps `DELETE` on `stripe_events` (F-11); `settings_versions` has none of the four layers (F-02). |
| 9 | Driver or vehicle double-booked | Tampering | **closed** | Two partial GiST constraints, empty-range closed three ways, NULL and cancelled correctly excluded. |
| 10 | Erasure cascading away the 10-year statutory record | Repudiation | **partial** | Redact-in-place and `erased_at` are right, and the `on delete restrict` FKs hold. The inverse now fails: the documented erasure write is blocked by `tg_append_only`, and `audit_log` retains pre-redaction PII permanently (F-10). |

## Recommended acceptance criteria

pgTAP assertions the phase plans should add, beyond the sixteen files listed at 2160–2179. Grouped by
the finding they prove closed.

**`grant_matrix.test.sql`** (F-01, F-05, F-08, F-11, F-13) — assert the whole grant surface as data,
not per-table:

```sql
-- exactly five tables reachable by `authenticated`, and the column set on each
select set_eq(
  $$ select table_name::text from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public' $$,
  $$ values ('customers'),('bookings'),('booking_legs'),
            ('price_snapshots'),('price_snapshot_legs'),
            ('content_strings'),('reviews'),('vehicle_classes'),('service_zones') $$);
-- the dispatcher-only note is not among the granted columns
select is_empty($$ select 1 from information_schema.column_privileges
                    where grantee in ('authenticated','vamos_guest')
                      and table_name in ('bookings','booking_legs') and column_name = 'ops_note' $$);
select is_empty($$ select 1 from information_schema.column_privileges
                    where grantee = 'vamos_staff'
                      and table_name = 'booking_access_tokens' and column_name = 'token_hash' $$);
select is_empty($$ select 1 from information_schema.column_privileges
                    where grantee = 'vamos_staff'
                      and table_name = 'stripe_events' and column_name = 'payload' $$);
-- no function in public or app is executable by PUBLIC
select is_empty($$ select p.oid::regprocedure::text from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname in ('public','app')
                     and has_function_privilege('public', p.oid, 'execute') $$);
select ok(not has_schema_privilege('authenticated','public','create'), 'no CREATE on public');
```

**`truncate_denied.test.sql`** (F-03):

```sql
select throws_ok($$ set role service_role; truncate public.audit_log $$, '42501');
select throws_ok($$ set role service_role; truncate public.booking_events $$, '42501');
-- and the trigger layer, proved as the owner where the grant no longer bites
select throws_ok($$ reset role; truncate public.consent_log $$, 'P0001');
select is_empty($$ select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relkind='r'
                      and has_table_privilege('service_role', c.oid, 'truncate') $$);
```

**`settings_versions_immutable.test.sql`** (F-02) — mirror `append_only.test.sql` exactly:
a dispatcher at aal2 `update settings_versions set free_cancel_hours = 0` raises
`restrict_violation`; a `delete` raises; an admin `insert` succeeds; a non-admin `insert` raises.

**`rate_version_publish.test.sql` additions** (F-04, F-12):

```sql
select throws_ok($$ insert into public.rate_versions (slug,label,status,published_at)
                    values ('x','x','live',now()) $$, 'P0001');
select throws_ok($$ insert into public.fixed_routes
                      (rate_version_id,origin_zone_id,dest_zone_id,vehicle_class_id,price_rappen,live)
                    select id, :z1, :z2, :vc, 100, true from public.rate_versions
                     where status = 'live' $$, 'P0001');
select is(public.next_booking_reference() is not null, true);   -- as vamos_staff, F-16
```

**`charge_gate.test.sql` additions** (F-06, F-14): a payment citing a snapshot that is not
`bookings.price_snapshot_id` raises; a second `status='succeeded'` row on the same booking raises
`23505`; a non-CHF `charged_currency` with a matching `chf_total_rappen` is accepted and one with a
mismatched `chf_total_rappen` raises.

**`coupon_caps.test.sql`** (F-07): two `pg_background`/`dblink` sessions, or a serialised
`FOR UPDATE` proof — `global_limit = 1` admits exactly one redemption and the second raises
`restrict_violation`; the same for `per_user_limit = 1` with two bookings by one customer.

**`manage_token_window.test.sql`** (F-09): `manage_booking_cancel` on a leg whose `scheduled_at` is
in the past raises `P0001`; on a future leg it succeeds and returns a non-null `refund_percent`
sourced from `price_snapshots.policy -> 'cancellation_tiers'`.

**`erasure.test.sql`** (F-10): after the redaction routine runs, `select count(*) from
public.consent_log where customer_id = :victim` is `0` (proving the update path exists at all), and
`select after_value ? 'email' from public.audit_log where table_name='customers'` is false.

**`policy_seed.test.sql`** (F-15): the `launch-baseline` row has `airport_waiting_minutes = 60`,
`city_waiting_minutes = 15`, `min_advance_minutes = 180`, `round_trip_discount_percent = 10`;
`settings.manage_link_validity_days = 30`; `select count(*) from vehicle_classes` is `3` and no row
has `slug = 'first'`; and — the law that must not regress — every `*_rappen` and `percent` column
across `distance_rates`, `fixed_routes`, `surcharges` and `coupons` is NULL, with zero
`rate_versions` rows at `status = 'live'`.

**`force_rls_write_paths.test.sql`** (F-22): as the definer owner under `FORCE RLS`, an audited
`update public.settings` writes one `audit_log` row, and `record_consent()` with a bound subject
writes one `consent_log` row — both asserted to succeed, so a future re-owning of either function
fails the gate instead of the cookie banner.
