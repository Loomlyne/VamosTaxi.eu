# Coupons & Extras — Phase 4 Research Brief

**Lane:** coupons-extras · **Phase:** 4 (Quote & Pricing Engine)
**Covers:** QUOTE-06 (coupons), QUOTE-11 (extras), U7 (coupon consumption timing)
**Sibling lanes (their ground, not mine — referenced, not redone):** quote-engine-core (the
`/api/quote` pipeline shape and the round-trip discount), geo-routing (Mapbox Directions/waypoints),
quote-lock-expiry (the 30-minute TTL sweep machinery), abuse-ratelimit (Turnstile/rate limiting on
`/api/quote`).
**Date:** 2026-08-22

---

## 0. What Phase 2 already commits this lane to

Read before designing anything (all confirmed against `02-SCHEMA-DRAFT.md` and its `price-snapshot.md`
research lane, all read-only in this pass):

| Source | Binding fact |
|---|---|
| `02-SCHEMA-DRAFT.md` §6 (`0008_coupons.sql`) | `coupons` — `code text unique check (code = upper(code))`, `kind coupon_kind` (`percent`\|`amount`), `percent`/`amount_rappen` mutually exclusive and **nullable** (Law 04 — value not owner-approved yet), `valid_from`/`valid_until`, `global_limit`, `per_user_limit`, `active`. |
| `02-SCHEMA-DRAFT.md` §6 | `coupon_redemptions(id, coupon_id, booking_id not null, customer_id nullable, redeemed_at)`, `unique(coupon_id, booking_id)`. Comment: *"Consumed at payment time pending UNCERTAIN U7."* — my lane settles this. |
| `02-SCHEMA-DRAFT.md` §6 (`surcharges`) | `code, kind(amount\|percent\|included), amount_rappen, percent, applies_to('leg'\|'booking'), active`, one row per `rate_version_id`. Seeded codes already include `extra_stop` and `child_seat` (`applies_to='leg'`). Frozen once its `rate_version` leaves `draft` (`tg_pricing_row_frozen`). |
| `02-SCHEMA-DRAFT.md` §9 (`price_snapshots`) | `subtotal_rappen` (base fare), `surcharges_rappen`, `discount_rappen`, `total_rappen`, CHECK `total = subtotal + surcharges − discount`; `coupon_id`, `coupon_code`; `lines jsonb` (D8: i18n key + params, never prose); `is_chargeable` STORED generated. |
| `02-SCHEMA-DRAFT.md` §9 (`booking_payments` / `tg_payment_matches_snapshot`) | The row is inserted **at PaymentIntent creation**, `status='requires_payment'`, in the **same transaction** that extends `price_snapshots.expires_at` to cover the payment window. The webhook only *updates* `status`/`captured_at` under a column whitelist — it never inserts. This ordering is deliberate and documented, and it is the anchor my coupon-reservation design reuses (§3). |
| `02-SCHEMA-DRAFT.md` §14c | `distance_rates`, `fixed_routes`, `surcharges`, `coupons`, `coupon_redemptions`, `rate_versions` are **staff-only** — revoked from `anon`, `authenticated`, `vamos_edge`, `vamos_public`. No identity-scoped role (customer, guest, anon) has a grant on any pricing table. `price_snapshots` INSERT is granted to none of `anon`/`authenticated`/`vamos_guest`/`vamos_staff` either (confirmed by `ops_write_denied.test.sql` expecting `vamos_staff` to get `42501` on `insert into price_snapshots`). |
| `docs/build/GSD-LAUNCH.md:113-115` | *"price per class = fixed-route override ∥ per-km rate × distance + surcharges − coupon."* Coupon is subtracted **after** surcharges are summed, not before. |
| `docs/build/OWNER-ANSWERS.md` | "extra-stop fee" and "oversized-item fee" are both listed as still-open blanks — confirms `oversized_luggage` is a real, expected surcharge, just unpriced, same as the other seven. |
| `app/pages/checkout.dc.html:110-114,221-222,250,253` | Extras (child seat checkbox, additional-stop counter, max 3) and the coupon field are **both on the checkout page**, not the home widget. The mock's `applyCoupon` does `coupon.toUpperCase()` client-side before storing it. No server round-trip exists in the mock — production must add one. |
| `app/vamos-ops-data.js:234-236,295-303` | Coupon seed: `WELCOME` (percent), `CORPORATE` (percent), `SKI` (amount) — mirrors `coupons`. Surcharge seed: 8 codes, `child_seat` and `extra_stop` both `kind:'amount'`. No `oversized_luggage` code exists in the mock — this is a **new** code QUOTE-11 requires that the mock never had. |

**What this settles before I design anything:** the home booking widget's initial quote (pax/bags
only) cannot see a coupon or an extra — neither field exists there. Coupons and extras are entered,
together, in one step: checkout. And because no customer/guest/anon role can read `coupons` or
`surcharges` at all, both the informational validation shown at checkout and the authoritative
enforcement happen **server-side under `service_role`**, never through `withIdentity()`'s
anon/authenticated/guest/staff roles. That single fact is what makes the U7 answer in §3 possible
without a second (KV) system.

---

## RECOMMENDATION (one decision)

> **Extras are `surcharges` rows, nothing new.** Add a ninth seeded code, `oversized_luggage`
> (`kind='amount'`, `applies_to='leg'`, amount NULL until the matrix lands), to the same table
> `child_seat` and `extra_stop` already live in. No parallel "extras" table.
>
> **A coupon is validated twice, by the same rule, and consumed exactly once.** `evaluate_coupon()`
> is a single SQL function both call. At quote time (checkout's re-price step) it runs
> **informationally** — no write, just a rule code the UI turns into one of seven refusal messages
> or an applied discount line. At **PaymentIntent-creation time** — the existing, already-designed
> moment `booking_payments` is inserted inside `tg_payment_matches_snapshot`'s transaction — a
> sibling trigger re-runs the same rule under a `SELECT … FOR UPDATE` lock on the `coupons` row and,
> if still valid, inserts the one `coupon_redemptions` row that makes the code spent. **This settles
> U7: consumed at payment time, specifically at PaymentIntent creation, not at webhook
> confirmation — and no KV reservation is needed**, because the coupon field does not exist before
> checkout, and checkout is the same step that creates the booking and the PaymentIntent. A KV
> layer would be solving a race that the schema's own ordering already prevents.
>
> **Order of operations, per class:** `subtotal_rappen` (fixed-route price or per-km × routed
> distance) → **+** every `surcharges_rappen` line, including the three extras, each its own line →
> **−** `discount_rappen` (coupon, computed against the *sum* of the first two, matching
> GSD-LAUNCH's stated formula and the `price_snapshots_total_sums` CHECK) → `total_rappen`. An
> additional stop changes `subtotal_rappen` (it lengthens the routed distance) **and** adds its own
> `extra_stop` surcharge line (the stop itself, not the extra kilometres) — never both effects
> folded into one number, or the two are impossible to explain separately on a refund.

Everything below is the reasoning and the DDL/SQL.

---

## 1. Extras (QUOTE-11): where the catalogue lives

**Decision: the existing `surcharges` table. No new table.**

Rejected: a parallel `extras` table keyed by booking/leg. Every property an extras catalogue needs —
versioned with `rate_version_id` so a price change never rewrites a historical booking, frozen once
published (`tg_pricing_row_frozen`), included in the "may not go live half-priced" check
(`tg_rate_version_transition`'s `surcharges` completeness scan), an i18n-key stem for its label and
rule text — is a property `surcharges` already has, built in Phase 2, tested by
`tests/rate_version_publish.test.sql`. A second table duplicates all of it for zero new capability,
and doubles the places `tg_rate_version_transition` has to check for "unpriced and about to go
live." The mock itself already treats `child_seat` and `extra_stop` as ordinary surcharges
(`app/vamos-ops-data.js:301,300`), sitting next to `night` and `airport_pickup` in the same list —
QUOTE-11 is not asking for a new mechanism, it is asking for three specific rows plus the pricing
lines that reference them.

### 1.1 The ninth code

```sql
-- Addendum to Phase 2's seed obligations (packages/db/seed/pricing.sql), not a new migration —
-- `surcharges` and its freeze/transition triggers ship as-is from 02-SCHEMA-DRAFT.md §6.
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, percent, applies_to, active)
values (:draft_rate_version_id, 'oversized_luggage', 'amount', null, null, 'leg', true);
-- amount_rappen NULL: OWNER-ANSWERS.md lists "oversized-item fee" as an open blank (Law 04).
-- The rate_versions live-transition trigger already refuses to publish a version with this row
-- still unpriced (tg_rate_version_transition's surcharges completeness scan) — no new check needed.
```

`content_strings` rows this adds (Law 03; en is the source, de/fr/ar ship in the same pass):

| key | en | de (ss, not ß) | fr | ar |
|---|---|---|---|---|
| `price.surcharge.oversized_luggage.label` | Oversized luggage | Übergrosses Gepäck | Bagage volumineux | أمتعة كبيرة الحجم |
| `price.surcharge.oversized_luggage.rule` | Per declared item | Pro angegebenes Stück | Par article déclaré | لكل قطعة معلنة |

(`price.surcharge.child_seat.*` and `price.surcharge.extra_stop.*` already exist as seed obligations
from Phase 2's `research/price-snapshot.md` §6 — this table only adds the new one.)

### 1.2 Booking-level UI, leg-level pricing — and what that means for a return trip

The checkout mock renders **one** child-seat checkbox and **one** stops counter for the whole
booking (`checkout.dc.html:94,97`), not one per leg. But `surcharges.applies_to` for both codes is
already `'leg'` (Phase 2's choice, not mine to relitigate) — and that is the correct scope for a
*physical* fact: a child seat has to be fitted in whichever vehicle shows up for **each** leg, and a
stop happens on **one** leg's route, not both. ADR-006 already establishes that a return trip is two
legs, potentially two different vehicles, and can be partially cancelled — a leg-level fact belongs
on `booking_legs`/`price_snapshot_legs`, not smeared across the booking.

**Decision:** a booking-level `child_seat` toggle **duplicates onto both legs** of a return (the
same child travels out and back, so the fee is charged once per leg — this is not a bug, a fitted
seat is a per-journey service cost, not a per-booking flat fee). `extra_stop` count, because the mock
asks for it once, is applied to **leg 1 (outbound) only** at MVP — a return leg's own stops are not
collectable through today's UI at all. `oversized_luggage`, like `child_seat`, is a standing fact
about the party's luggage and duplicates onto both legs.

This is flagged in §6 as **UNCERTAIN** rather than asserted as final, because "duplicate the flat
extras, single-leg the counted one" is an inference from the existing UI shape, not an owner
decision — the real fix is a per-leg extras UI in a later phase, at which point this whole paragraph
becomes moot. Until then, each duplicated line still gets its own `leg_seq`, `source_row`, and
`amount_rappen` in `lines[]` — never one line silently covering two legs, because a leg-only
cancellation (ADR-006) has to be able to drop exactly its own extras and nothing else.

### 1.3 The interface with geo-routing: distance vs. the stop's own line

An additional stop must not be priced twice under two different names for the same thing. The rule:

- **`subtotal_rappen`** (the `distance_fare` line) is computed against the **routed** distance —
  i.e. geo-routing's Mapbox Directions call must include every additional stop as an intermediate
  waypoint before the per-km rate is applied, so the base fare already reflects the real detour in
  kilometres. That call and its waypoint ordering is geo-routing's ground; this lane's requirement on
  it is simply: **stops go in before `distance_km` is read**, not after.
- **The `extra_stop` surcharge line** is priced *per stop*, independent of how many kilometres that
  stop added — it is the fixed operational cost of stopping (pulling over, loading, waiting for the
  passenger), the same fee whether the stop added 200 m or 4 km.

So one stop shows up in two places in `lines[]` with two different reasons, and the reasons must not
collapse into each other: the distance line's `basis.distance_km` already includes the detour: the
surcharge line's `basis` never repeats a kilometre figure, only `{ "rule": "per_unit", "count": 1,
"unit_amount_rappen": null }`.

### 1.4 `lines[]` shape for the three extras (extends `price-snapshot.md` §3.4's example)

```json
[
  { "seq": 5, "leg_seq": 1, "kind": "surcharge", "code": "child_seat",
    "i18n_key": "price.surcharge.child_seat.label",
    "params": { "count": 1 },
    "basis": { "rule": "per_unit", "count": 1, "unit_amount_rappen": null },
    "source_row": { "table": "surcharges", "id": 24, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 6, "leg_seq": 2, "kind": "surcharge", "code": "child_seat",
    "i18n_key": "price.surcharge.child_seat.label",
    "params": { "count": 1 },
    "basis": { "rule": "per_unit", "count": 1, "unit_amount_rappen": null },
    "source_row": { "table": "surcharges", "id": 24, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 7, "leg_seq": 1, "kind": "surcharge", "code": "extra_stop",
    "i18n_key": "price.surcharge.extra_stop.label",
    "params": { "count": 2 },
    "basis": { "rule": "per_unit", "count": 2, "unit_amount_rappen": null,
               "note": "distance already reflects the routed detour; this line prices the stop itself" },
    "source_row": { "table": "surcharges", "id": 25, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 8, "leg_seq": 1, "kind": "surcharge", "code": "oversized_luggage",
    "i18n_key": "price.surcharge.oversized_luggage.label",
    "params": { "declared": true },
    "basis": { "rule": "flat" },
    "source_row": { "table": "surcharges", "id": 26, "rate_version_id": 7 },
    "amount_rappen": null }
]
```

`amount_rappen` is `null` throughout because no `rate_version` is `live` yet (QUOTE-10) — this is
the shape once the matrix lands, with the `unit_amount_rappen × count` (or the flat amount) filled
in and each line's `amount_rappen` rounded half-up per the `rappen` domain's binding rounding rule
(Phase 2, D6).

---

## 2. Coupons (QUOTE-06): validation, one rule function, seven refusals

### 2.1 The seven rules, in the order they are checked

| # | Rule | Fires when | Message key |
|---|---|---|---|
| 1 | not found | no row for `upper(code)` | `quote.coupon.error.not_found` |
| 2 | inactive | `not active` | `quote.coupon.error.inactive` |
| 3 | not yet valid | `valid_from is not null and now() < valid_from` | `quote.coupon.error.not_yet_valid` |
| 4 | expired | `valid_until is not null and now() >= valid_until` | `quote.coupon.error.expired` |
| 5 | unpriced | `kind='percent' and percent is null`, or `kind='amount' and amount_rappen is null` — the coupon exists and is inside its window, but the discount value is a Law-04 gap (`02-SCHEMA-DRAFT.md:737`: *"the quote engine refuses to APPLY an unpriced coupon"*) | `quote.coupon.error.unpriced` |
| 6 | global cap reached | `global_limit is not null and count(coupon_redemptions where coupon_id=…) >= global_limit` | `quote.coupon.error.usage_cap` |
| 7 | per-user cap reached | `per_user_limit is not null and count(…, matched by customer_id or contact_email) >= per_user_limit` | `quote.coupon.error.per_user_cap` |

**Case handling.** The mock uppercases client-side before it ever "sends" the code
(`checkout.dc.html:221`, `applyCoupon`). Never trust that: `coupons.code` itself is constrained
`check (code = upper(code))`, so the lookup always normalises server-side too —
`where code = upper($1)` — regardless of what the client sent. `price_snapshots.coupon_code` stores
the **normalised** (uppercased) value, matching both the column's own convention and what the mock
already displays back to the customer as a `Tag`.

**Per-user identity for a guest.** `coupon_redemptions.customer_id` is nullable — a guest checkout
(no account) has none. `bookings.contact_email` (`citext`, `not null`) is what stands in: the
per-user count joins `coupon_redemptions → bookings` and matches on `customer_id` **or**
`contact_email`, so a guest cannot bypass a one-per-customer coupon by simply not creating an
account, and a returning signed-in customer's history is not lost if they once checked out as a
guest with the same address. No schema change needed — `bookings.contact_email` already exists and
is always populated by the time a booking row is created (`02-SCHEMA-DRAFT.md` §9's own narrative:
name/email are collected at the *Details* step, before this rule ever runs).

### 2.2 One rule function, called twice for two different purposes

```sql
-- packages/db/migrations/00xx_coupon_evaluation.sql (Phase 4 addendum to Phase 2's 0008_coupons.sql)

create or replace function public.evaluate_coupon(
  p_code          text,
  p_customer_id   uuid,
  p_contact_email extensions.citext
) returns table (
  coupon_id     bigint,
  rule          text,          -- 'ok' | one of the seven refusal codes above
  kind          coupon_kind,
  percent       numeric(5,2),
  amount_rappen rappen
) language sql stable as $$
  select
    c.id,
    case
      when not c.active                                              then 'inactive'
      when c.valid_from  is not null and now() < c.valid_from        then 'not_yet_valid'
      when c.valid_until is not null and now() >= c.valid_until      then 'expired'
      when (c.kind = 'percent' and c.percent      is null)
        or (c.kind = 'amount'  and c.amount_rappen is null)          then 'unpriced'
      when c.global_limit is not null and (
             select count(*) from public.coupon_redemptions r
              where r.coupon_id = c.id
           ) >= c.global_limit                                       then 'usage_cap'
      when c.per_user_limit is not null and (
             select count(*) from public.coupon_redemptions r
             join public.bookings b on b.id = r.booking_id
              where r.coupon_id = c.id
                and ((p_customer_id is not null and b.customer_id = p_customer_id)
                     or b.contact_email = p_contact_email)
           ) >= c.per_user_limit                                     then 'per_user_cap'
      else 'ok'
    end as rule,
    c.kind, c.percent, c.amount_rappen
  from public.coupons c
  where c.code = upper(p_code);
$$;
```

Zero rows returned ⇒ application code treats it as `not_found` (no coupon row exists to project the
other six checks over). `language sql stable`, not `security definer` — it is only ever called from
inside a `service_role` connection (the quote/checkout backend already bypasses RLS as `service_role`;
see §0), so it needs no privilege escalation of its own.

**Called informationally** — at checkout, when the customer applies a code (or on every re-price
while extras change), the quote engine calls `evaluate_coupon()`, and:
- `rule <> 'ok'` → the checkout UI shows the matching refusal message and applies **no** discount
  line; the price stands as if no code were entered.
- `rule = 'ok'` → the engine adds the discount line to the *draft* price it is about to write into a
  fresh `price_snapshots` row (§2.3), with `coupon_id` and `coupon_code` set.

This call has **no side effect** — nothing is written, nothing is reserved. An abandoned re-price
(the customer types a code, sees the discount, then closes the tab) costs the coupon nothing,
because nothing was consumed yet.

### 2.3 Where the coupon percentage lands in the arithmetic

Per GSD-LAUNCH's stated formula (§0) and the `price_snapshots_total_sums` CHECK
(`total = subtotal + surcharges − discount`), the coupon is computed against the **sum of the base
fare and every surcharge line, extras included** — not against the base fare alone. Worked example,
one-way ZRH → city, Business class, one additional stop, one child seat, coupon `WELCOME` applied
(percent, value not yet approved — every amount below is the Law-04 placeholder, never a real
number):

| Line | kind | amount |
|---|---|---|
| `distance_fare` (routed distance already includes the stop's detour) | fare | CHF 000 |
| `airport_pickup` | surcharge | CHF 000 |
| `child_seat` × 1 | surcharge | CHF 000 |
| `extra_stop` × 1 | surcharge | CHF 000 |
| `waiting_airport` (included) | included | CHF 000 (not summed into `surcharges_rappen`) |
| **`subtotal_rappen`** (fare lines only) | — | **CHF 000** |
| **`surcharges_rappen`** (surcharge lines only) | — | **CHF 000** |
| pre-discount = `subtotal_rappen + surcharges_rappen` | — | CHF 000 |
| `coupon WELCOME` (percent of pre-discount, half-up rounded per rappen's rounding rule) | discount | − CHF 000 |
| **`total_rappen`** | — | **CHF 000** |

For an `amount`-kind coupon, `discount_rappen = least(coupon.amount_rappen, subtotal_rappen +
surcharges_rappen)` — clamped so it can never push `total_rappen` negative (the column already has
`check (total_rappen >= 0)`; clamping in the engine is what stops that CHECK from ever firing on an
ordinary over-generous flat coupon).

**Interface note, not this lane's to settle:** the round-trip discount (ADR-006, U16) is a second,
separate `kind:"discount"` line (`code:"return_trip"`), booking-level, percentage **not yet
decided**. If a round-trip discount and a coupon are both present, both are computed against the
same pre-discount `subtotal_rappen + surcharges_rappen` (not stacked/compounded — a customer with a
20% coupon and a 10% return discount gets 30% off the pre-discount total, not `0.8 × 0.9`), and
`discount_rappen` is their sum. This ordering choice belongs to quote-engine-core, which owns the
round-trip discount; flagged here only because the two discounts share one CHECK-constrained column.

---

## 3. U7 — settled: consumed at PaymentIntent creation, no KV reservation

### 3.1 The reasoning

Three independent facts, all already true of the schema before this lane touches anything, converge
on one answer:

1. **The abandoned-quote problem does not exist for this product.** A KV reservation "across the
   30-minute quote window" (the pending recommendation in `research/price-snapshot.md` §8, item 4)
   solves the case where an anonymous, rate-limited `/api/quote` call could burn a coupon use before
   any commitment is made. But the coupon field is not on the quote step at all — it is on checkout,
   entered after name, email and payment method (`checkout.dc.html:60-130`). There is no anonymous,
   pre-commitment path that can reach a coupon in this product's actual flow. Solving a race that
   cannot occur is the wrong trade: a KV reservation is a second system that must never disagree
   with Postgres about which slots are taken, and keeping two systems consistent under retries and
   partial failures is real, ongoing complexity for a race this product's own UI shape already rules
   out.
2. **`coupon_redemptions.booking_id` is `not null`.** The table, as Phase 2 designed it, structurally
   cannot hold a "reserved but not yet booked" row — there is no booking to reference until checkout
   has already collected contact details and created the `bookings` row. This is a strong signal,
   independent of my own preference, that redemption was always meant to happen no earlier than a
   real booking exists.
3. **Phase 2 already designed, and documented at length, the exact transactional moment "the
   customer commits to pay."** `tg_payment_matches_snapshot`'s own comment (`02-SCHEMA-DRAFT.md`
   §9) explains *why* `booking_payments` is inserted at PaymentIntent creation and not at webhook
   time: inserting at the webhook would mean Stripe could already have taken the customer's money
   before our own trigger discovers the quote expired, "money taken, booking stuck 'pending'
   forever." The identical argument applies to a coupon cap: if we only discovered a cap violation
   at webhook time, the fix would be *refund a completed charge* rather than *refuse to create the
   PaymentIntent* — strictly worse, and for no reason, since the row that already exists at the
   right moment is `booking_payments`, and it already sits inside a transaction, already has a
   trigger, already re-validates against the snapshot.

**Conclusion:** reuse that exact moment. A coupon reservation is a `BEFORE INSERT` trigger on
`booking_payments`, a sibling of `tg_payment_matches_snapshot`, ordered to run *after* it (so a
snapshot that is already unchargeable or expired fails first, with no coupon side effect at all).

### 3.2 The race — two customers redeeming the last use simultaneously

Both customers' checkouts reach PaymentIntent creation for the same `global_limit`-capped coupon at
close to the same instant. Both transactions run the new trigger. The lock that serializes them is a
plain `SELECT … FOR UPDATE` on the **`coupons`** row (not on `coupon_redemptions`, which has no
natural single row to lock): the first transaction to reach the trigger acquires the row lock, the
second blocks on the *same* `SELECT … FOR UPDATE` until the first commits or rolls back. Only then
does the second transaction's recount see the first's newly-inserted `coupon_redemptions` row and
correctly find the cap reached — the classic count-then-insert race is closed by locking the parent
before counting the children, not by locking the count itself (there is nothing to lock in a
`count(*)` that has not been computed yet).

```sql
-- packages/db/migrations/00xx_coupon_evaluation.sql (continued)

/**
 * Reserves a coupon use at the moment the customer commits to pay — the same transaction,
 * the same row, as tg_payment_matches_snapshot (02-SCHEMA-DRAFT.md §9). Runs SECOND: Postgres
 * fires same-event BEFORE triggers in alphabetical order of trigger name, and
 * 'booking_payments_match_snapshot' < 'booking_payments_reserve_coupon' — named deliberately so
 * an unchargeable or expired snapshot is refused with zero coupon side effect, before this ever
 * runs. If that ordering guarantee is ever weakened, this trigger stops being safe to keep as-is.
 */
create or replace function public.tg_reserve_coupon_redemption()
returns trigger language plpgsql as $$
declare
  s public.price_snapshots%rowtype;
  c public.coupons%rowtype;
  v_customer_id   uuid;
  v_contact_email extensions.citext;
  v_rule          text;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;
  if s.coupon_id is null then
    return new;   -- no coupon on this snapshot: nothing to reserve
  end if;

  -- Lock the coupon FIRST. Every concurrent redeemer of the SAME code queues on this row;
  -- nobody's recount below can be stale once they hold it.
  select * into c from public.coupons where id = s.coupon_id for update;

  select customer_id, contact_email into v_customer_id, v_contact_email
    from public.bookings where id = new.booking_id;

  select rule into v_rule from public.evaluate_coupon(c.code, v_customer_id, v_contact_email);
  if v_rule <> 'ok' then
    raise exception 'coupon % failed re-validation at payment time: %', c.code, v_rule
      using errcode = 'restrict_violation',
            hint = 'Re-quote without the coupon, or with a different code.';
  end if;

  -- ON CONFLICT DO NOTHING: a retried PaymentIntent for the SAME booking (the first attempt
  -- failed or was declined; PAY-05 allows a second booking_payments row for the same booking_id)
  -- must not re-raise a unique-violation for a reservation this booking already holds.
  insert into public.coupon_redemptions (coupon_id, booking_id, customer_id)
  values (c.id, new.booking_id, v_customer_id)
  on conflict (coupon_id, booking_id) do nothing;

  return new;
end $$;

create trigger booking_payments_reserve_coupon
  before insert on public.booking_payments
  for each row execute function public.tg_reserve_coupon_redemption();
```

If the cap was reached, the customer sees the refusal **before** Stripe is ever asked to create a
PaymentIntent — no charge to refund, no reconciliation. This is strictly better than "consume at
webhook time," which can only discover the same problem after money has already moved.

### 3.3 Releasing an abandoned reservation

A reservation written at PaymentIntent creation can still go nowhere — a declined card, a customer
who closes the 3-D Secure/TWINT sheet, a `booking_payments.status` that ends at `'failed'` or
`'canceled'` (both already-modelled statuses), or one that never receives any webhook at all. Unlike
`price_snapshots`/`booking_events`/etc., **`coupon_redemptions` carries no append-only trigger** in
Phase 2's design (`02-SCHEMA-DRAFT.md` §10's trigger list omits it) — it is an ordinary mutable
table, so releasing a dead reservation is a plain `DELETE`, not a schema violation:

```sql
-- Cron sweep (reuses whatever interval Phase 5/7 lands for U19's Stripe event sweep — do not
-- stand up a third, disagreeing cron job for what is the same "how long do we wait for Stripe"
-- question). Deletes a reservation only once we are confident the booking will never pay:
delete from public.coupon_redemptions cr
using public.bookings b
where cr.booking_id = b.id
  and b.status in ('quote', 'pending')
  and not exists (
        select 1 from public.booking_payments p
         where p.booking_id = b.id and p.status = 'succeeded'
      )
  and b.created_at < now() - (
        select coalesce(checkout_abandon_release_minutes, 120)
          from public.settings where id = 1
      ) * interval '1 minute';
```

`settings.checkout_abandon_release_minutes` does not exist in Phase 2's `settings` table yet — this
is a genuine addition this lane is flagging, not one it can make (Phase 2's migrations are closed
input to this lane; see §6, UNCERTAIN #3). Until it lands, hard-code a conservative default (2 h) in
the sweep query rather than inventing a "confirmed" settings value, matching the project's own
discipline everywhere else a policy number is not yet owner-approved.

---

## 4. Interaction ordering with quote-engine-core's pipeline

This lane does not own `/api/quote`'s overall shape (quote-engine-core does), but the two extras
inputs and the coupon input have to enter that pipeline at specific points, stated here as the
contract quote-engine-core should build against:

```
1. Resolve base fare candidates per eligible class:
     fixed_routes match?  → price_rappen (subtotal)
     else                 → distance_rates.per_km_rappen × distance_km  (subtotal),
                             clamped to min_fare_rappen
     ← distance_km comes from geo-routing's Directions call, WAYPOINTS INCLUDING every
       additional stop already resolved (§1.3) — extras must be known before this step runs,
       not layered on after.

2. Evaluate every applicable `surcharges` row for the class/rate_version:
     night, airport_pickup, waiting_* (included, amount_rappen null by design)
     + child_seat  × booking.child_seat_count   (this lane, §1)
     + extra_stop  × booking.stop_count         (this lane, §1)
     + oversized_luggage (declared boolean)     (this lane, §1)
   → surcharges_rappen = sum of every non-"included" line's amount_rappen

3. pre_discount = subtotal_rappen + surcharges_rappen

4. Evaluate discounts against pre_discount, summed (not compounded — §2.3):
     coupon_id set?        → evaluate_coupon() informationally (this lane, §2)
     round-trip applicable? → quote-engine-core / ADR-006, percentage not yet decided (U16)
   → discount_rappen = sum, clamped so total_rappen cannot go negative

5. total_rappen = subtotal_rappen + surcharges_rappen − discount_rappen

6. Write ONE price_snapshots row per class (or per the chosen class only on the
   post-extras re-price — U6/this checkout step is a fresh quote_id either way), lines[]
   carrying every line from steps 1–4 with i18n_key + params, never rendered text (D8).
```

Step 4's coupon call is **read-only** here (§2.2). The only write this lane makes is the trigger in
§3, fired later, by `booking_payments`, in a different request entirely (checkout's "Pay" action,
after the customer has already seen and accepted the priced-with-extras-and-coupon total).

---

## 5. Four languages, every extra and every refusal

Every string introduced by this lane ships `en`/`de`/`fr`/`ar` in the same pass (Law 03), in
`content_strings` (production) — listed here as the seed obligation this lane adds on top of Phase
2's:

| key | en | de | fr | ar |
|---|---|---|---|---|
| `price.surcharge.oversized_luggage.label` | Oversized luggage | Übergrosses Gepäck | Bagage volumineux | أمتعة كبيرة الحجم |
| `price.surcharge.oversized_luggage.rule` | Per declared item | Pro angegebenes Stück | Par article déclaré | لكل قطعة معلنة |
| `quote.coupon.error.not_found` | Check the coupon code | Prüfen Sie den Gutscheincode | Vérifiez le code du coupon | تحقّق من رمز القسيمة |
| `quote.coupon.error.inactive` | This code is no longer active | Dieser Code ist nicht mehr aktiv | Ce code n'est plus actif | لم يعد هذا الرمز نشطًا |
| `quote.coupon.error.not_yet_valid` | This code isn't active yet | Dieser Code ist noch nicht aktiv | Ce code n'est pas encore actif | هذا الرمز غير نشط بعد |
| `quote.coupon.error.expired` | This code has expired | Dieser Code ist abgelaufen | Ce code a expiré | انتهت صلاحية هذا الرمز |
| `quote.coupon.error.usage_cap` | This code has reached its limit | Dieser Code hat sein Limit erreicht | Ce code a atteint sa limite | بلغ هذا الرمز حده الأقصى |
| `quote.coupon.error.per_user_cap` | You've already used this code | Sie haben diesen Code bereits verwendet | Vous avez déjà utilisé ce code | لقد استخدمت هذا الرمز من قبل |
| `quote.coupon.error.unpriced` | This code isn't ready yet | Dieser Code ist noch nicht bereit | Ce code n'est pas encore prêt | هذا الرمز غير جاهز بعد |
| `quote.extras.error.max_stops` | Check the number of stops | Prüfen Sie die Anzahl der Stopps | Vérifiez le nombre d'arrêts | تحقّق من عدد التوقفات |
| `quote.extras.error.max_child_seats` | Check the number of child seats | Prüfen Sie die Anzahl der Kindersitze | Vérifiez le nombre de sièges enfant | تحقّق من عدد مقاعد الأطفال |

Voice check against `app/vamos-i18n-dict.js`'s existing pattern (§0): every refusal is an
instruction, never blame — "Check the coupon code," not "Invalid coupon." Matches
`'Check the email address'` / `'Check the number — include the country code'` already shipped.
`price.line.coupon` (the concatenated "Coupon {code}" line — `checkout.dc.html:253`) is not new; it
is Phase 2's existing `research/price-snapshot.md` §3.4 obligation, carried forward unchanged as a
`patterns` regex entry per Law 03's "strings the code concatenates" rule, because the coupon code
itself (`WELCOME`, `ZRH20`) is the one literal that stays literal — `.vt-dir-keep` in Arabic, same
treatment as a booking reference.

---

## 6. UNCERTAIN — and the check that settles each

| # | Item | Why uncertain | The check that settles it |
|---|---|---|---|
| 1 | Whether `extra_stop`/`child_seat`/`oversized_luggage` should duplicate onto both legs of a return, or offer a per-leg UI | Inferred from the checkout mock's single booking-level control (§1.2), not an owner decision; the mock has no return-trip extras UI at all to observe | Build the per-leg extras UI (a Phase 9-class enhancement) and ask the owner whether a child seat / declared oversized item is assumed for both legs by default, or must be confirmed per leg |
| 2 | Whether an `extra_stop`'s own kilometres should be billed at the same per-km rate as the rest of the route, or at a different (e.g. lower, "already slow anyway") rate | Not addressed anywhere in Phase 2 or the mock; §1.3 assumes "same rate, whatever the routed distance is" | Ask when the CHF matrix lands — if the owner wants a distinct stop-detour rate, `distance_rates` needs a second per-km column or `fixed_routes`-style override; until then, one rate for the whole route is the simplest correct default |
| 3 | `settings.checkout_abandon_release_minutes` does not exist in Phase 2's `settings` table | This lane cannot edit Phase 2's migrations (closed input); the sweep in §3.3 needs a number | Add the column in the Phase 5/7 migration that also lands the Stripe-event sweep (U19) — same "how long do we wait" decision, one column, one cron job |
| 4 | Whether `child_seat`/`oversized_luggage` should ever be a **count** greater than 1 (multiple seats, multiple oversized items), vs. the mock's boolean Checkbox | REQUIREMENTS.md QUOTE-11 says "a child seat" / "declare oversized luggage," singular; the mock's `Checkbox` component is binary | Ask the owner whether Business/Van-class families with 2+ children need 2+ seats priced separately; until answered, `params.count` stays `1` and the UI stays the mock's `Checkbox`, not a `Counter` |
| 5 | Whether `vamos_staff`'s existing direct `insert`/`update`/`delete` grant on `coupon_redemptions` (Phase 2 §14c, the "ops working set" list) is ever a real write path, or exists only for an ops correction/void | If a phone booking (OPS-04) is taken and paid by a route that never inserts into `booking_payments` the way the web checkout does, §3's trigger never fires and the redemption is never reserved by this lane's mechanism | Confirm in Phase 8 (ops booking creation) that every payment path — web and phone — ends in a `booking_payments` insert; if one does not, that path needs its own call to `evaluate_coupon()` plus the same `FOR UPDATE` discipline, not a bare `INSERT` |

---

## Sources

- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §6 (coupons,
  surcharges), §9 (price_snapshots, booking_payments, `tg_payment_matches_snapshot`), §14c (staff
  grants — pricing tables are staff-only)
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` D6–D9, D11, U6, U7, U16
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/price-snapshot.md` §1, §3.4,
  §5, §8 (the pending U7 recommendation this brief supersedes with a concrete answer)
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/rls-hyperdrive.md` §2
  (`withIdentity`, the role allowlist — confirms no identity-scoped role reaches pricing tables)
- `docs/build/GSD-LAUNCH.md` Phase 4 (the quote formula, "surcharges − coupon")
- `docs/build/OWNER-ANSWERS.md` (extra-stop fee, oversized-item fee both open blanks — Law 04)
- `app/pages/checkout.dc.html` (extras + coupon UI, `applyCoupon` uppercasing)
- `app/vamos-ops-data.js` (seeded coupons and surcharges)
- `app/vamos-i18n-dict.js` (existing refusal-message voice: "Check the …")
- [PostgreSQL 18 — Explicit Locking, `SELECT … FOR UPDATE`](https://www.postgresql.org/docs/current/explicit-locking.html) (row lock serializes concurrent transactions that also attempt to lock the same row; readers not requesting a lock are unaffected)
- [PostgreSQL 18 — Trigger Behavior](https://www.postgresql.org/docs/current/trigger-definition.html) (multiple triggers for the same event fire in alphabetical order of trigger name)
