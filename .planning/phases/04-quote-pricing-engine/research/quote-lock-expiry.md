# QUOTE-04 Research Brief — Quote Lock & Expiry

**Lane:** quote-lock-expiry · **Phase:** 4 (Quote & Pricing Engine)
**Builds on:** `02-SCHEMA-DRAFT.md` §9 (`price_snapshots`, `booking_payments`), §10 (append-only), §14 (RLS); `02-RESEARCH.md` U6/U7; `research/price-snapshot.md`; `research/rls-hyperdrive.md` (D1/D2/D3, `withIdentity`)
**Requirement:** QUOTE-04 — *"A quote holds its price for 30 minutes, and an expired quote is refused at payment time by the server, not merely hidden in the UI."*
**Date:** 2026-08-22

---

## 0. What Phase 2 already built for this (do not re-derive)

The lock mechanism already exists in the inherited schema and is *mostly* correct as drafted:

- `price_snapshots.expires_at timestamptz not null` — the lock (§9).
- `price_snapshots.is_chargeable` — `STORED generated always as (total_rappen is not null and rate_version_is_live)` — the pricing-live gate, orthogonal to expiry.
- `tg_payment_matches_snapshot()` — a `BEFORE INSERT` trigger on `booking_payments` that re-reads `price_snapshots` and `rate_versions` at the moment a PaymentIntent row is written and raises `restrict_violation` (`if s.expires_at <= now() then raise exception …`) if the quote has expired ([`02-SCHEMA-DRAFT.md:1350`](../02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md)).
- `price_snapshots_expiry` index on `(expires_at) where total_rappen is not null` — built for a sweep, per its own `LIFE-07` comment.
- `price_snapshots` is one of the six append-only tables under D19 (trigger + REVOKE + RLS-no-policy + FORCE RLS), with exactly **one** permitted mutation: `booking_id` NULL → non-NULL.

My job is not to invent this gate — it's to (a) pin down exactly where in the checkout flow it fires and prove a UI bypass still fails, (b) fix three concrete gaps I found in it while tracing that flow, (c) settle where the 30-minute lock *lives*, (d) reconcile the "sweep" requirement against the insert-only law, and (e) settle U7's interaction with this lane.

---

## 1. Where the lock lives — decision

**The lock lives in `price_snapshots.expires_at`, in Postgres, and nowhere else. No KV entry backs the lock.**

Three independent reasons, each sufficient on its own:

1. **KV's own consistency model is wrong for a security gate.** Workers KV writes are "immediately visible to other requests in the same global network location, but can take up to 60 seconds … to be visible in other parts of the world" ([Cloudflare KV — write](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)). A gate that can lag 60 s in *either direction* — a just-expired quote still reads "valid" at a distant PoP, or a just-extended quote still reads "expired" — is exactly backwards for a charge gate. KV's minimum `expirationTtl` is also 60 seconds, so it cannot even express "expires in this specific instant."
2. **Postgres is already the write path for the checkout POST, so KV buys no latency.** D3 already routes every identity-bound, payment-adjacent query through `HYPERDRIVE_NOCACHE` (cache-disabled), specifically because `pricing_live` must "not wait out a 60 s cache" (`rls-hyperdrive.md:520`). Reading `expires_at` from the same row the trigger will itself re-check is one extra column on a query that already has to happen; adding KV means synchronising two sources of truth for zero latency win.
3. **A second store is a second place for the invariant to rot.** The whole point of `tg_payment_matches_snapshot()` is that "a stale Worker deploy cannot charge the wrong number" (`price-snapshot.md:39`). A KV-first design reintroduces exactly the failure mode D19's append-only design exists to prevent: a value that can drift from the row it's supposed to describe.

**KV still has a legitimate, narrower job nearby** (Mapbox/AeroDataBox response caching, per `GSD-LAUNCH.md` Phase 4 — not this lane) and a role in the coupon question (§7 below) — but never as the quote-expiry lock itself.

---

## 2. Two gaps I found tracing the flow, and one contradiction — fix before Phase 4 writes code

### 2.1 Gap: an unbound quote has no RLS read path at all

I traced how the checkout POST is supposed to read the snapshot it's about to pay against, and it can't, as drafted. Every existing SELECT policy on `price_snapshots` keys off a `bookings` join:

```sql
-- 0020_rls_customer.sql
create policy snapshots_select_via_parent on public.price_snapshots
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = price_snapshots.booking_id));

-- 0021_rls_guest.sql
create policy snapshots_select_guest on public.price_snapshots
  for select to vamos_guest
  using (exists (select 1 from public.bookings b where b.id = price_snapshots.booking_id));
```

Both are `false` when `booking_id is null` — which is every quote before it becomes a purchase. `anon` holds **no grant at all** on `price_snapshots` (the only table-wide grant is `grant select … to authenticated` at line 1807; `anon` never appears). This is correct as a default-deny posture (a scraper must not be able to enumerate `quote_id`s), but it means nothing — not the checkout Worker, not a test, not staff — can read an unbound snapshot by `quote_id` through any policy that exists today. `/api/quote` itself doesn't need this (the Worker already holds the row from its own `INSERT … RETURNING`), but **checkout does**: it needs to read the chosen snapshot back by `(quote_id, vehicle_class_id)` before it calls Stripe.

**Fix — mirror the existing `app.booking_has_manage_token()` idiom exactly** (same file, §8): a narrow `SECURITY DEFINER` function, not a policy widening.

```sql
-- extends 0012_price_snapshots.sql (or a Phase 4 migration ahead of checkout)

/**
 * The one sanctioned way an anonymous or signed-in customer reads an UNBOUND quote
 * between /api/quote and checkout submit. No SELECT policy covers booking_id IS NULL,
 * by design (§14a/14b both key off a bookings join that does not exist yet) — a scraper
 * must not enumerate quote_ids. This returns only the columns checkout needs, only for
 * the exact (quote_id, vehicle_class_id) pair supplied, and never a bound snapshot.
 */
create or replace function app.checkout_quote(p_quote_id uuid, p_vehicle_class_id uuid)
returns table (
  snapshot_id     bigint,
  total_rappen    rappen,
  currency        char(3),
  is_chargeable   boolean,
  expires_at      timestamptz,
  rate_version_id bigint
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.total_rappen, s.currency, s.is_chargeable, s.expires_at, s.rate_version_id
    from public.price_snapshots s
   where s.quote_id = p_quote_id
     and s.vehicle_class_id = p_vehicle_class_id
     and s.booking_id is null
$$;

revoke all on function app.checkout_quote(uuid, uuid) from public;
grant execute on function app.checkout_quote(uuid, uuid) to anon, authenticated;
```

It deliberately does **not** filter out expired rows — `expires_at` in the past is a value the pre-flight check inspects to produce a friendly "your quote expired, here's the current price" response, not something the function should hide as a 404.

### 2.2 Gap: the charge-gate trigger is not hardened against its own RLS

`tg_payment_matches_snapshot()` as drafted has no `security definer` and no `if not found` guard:

```sql
select * into s from public.price_snapshots where id = new.snapshot_id;
if not s.is_chargeable then raise exception …
```

Trigger functions run as the *invoking* role by default (unqualified `plpgsql`, no `security definer`). If this ever runs as a role that RLS filters to zero rows for that `id` (e.g. `authenticated` reading someone else's snapshot, or the RLS gap in §2.1 before that fix lands), `select … into s` silently leaves `s` all-NULL rather than erroring — `not found` is never checked. The exception only fires by *accident*, because `NULL <= now()` and `not NULL` both evaluate to `NULL` (not `true`) in PL/pgSQL and the `IF` is skipped, but `new.charged_rappen is distinct from s.total_rappen` (`IS DISTINCT FROM` treats `NULL` as a real value) happens to still raise. That is not a design, it's a coincidence one refactor away from a silent pass-through.

**Fix — same pattern as `next_booking_reference()`, which this file already uses for a function that must see ground truth regardless of caller privilege:**

```sql
create or replace function public.tg_payment_matches_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.price_snapshots%rowtype; v_status public.rate_version_status;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;
  if not found then
    raise exception 'snapshot % does not exist', new.snapshot_id
      using errcode = 'restrict_violation';
  end if;
  if not s.is_chargeable then …  -- unchanged from here down
```

`security definer` here is the *correct* use of the escape hatch (Supabase's own hardening guidance, already quoted once in this file at the auth-hook function, applies: `set search_path = ''` is mandatory whenever `security definer` is added). This is the enforcement layer — it must see the row on its own authority, not the caller's.

### 2.3 Contradiction: the "extend `expires_at` at payment time" line doesn't survive the append-only trigger

`02-SCHEMA-DRAFT.md:1323` says: *"The snapshot's `expires_at` is extended to cover the payment window at intent creation, in the same transaction as this insert."* But `tg_append_only()` (§10) permits exactly one mutation shape on `price_snapshots`:

```sql
if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots'
   and old.booking_id is null and new.booking_id is not null
   and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
  return new;
end if;
raise exception 'append-only table …';
```

`to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id'` requires **every other column, including `expires_at`, to be byte-identical**. An UPDATE that also bumps `expires_at` fails this equality and raises `restrict_violation` — the "extension" the prose promises is not executable against the trigger the same document ships.

**Resolution: drop the extension. It was never necessary.** Re-reading exactly where the gate fires settles it: `booking_payments` is inserted "when the PaymentIntent is CREATED, with `status='requires_payment'`" — i.e. at the instant the customer clicks Pay, *before* any 3-D Secure / TWINT detour begins. `s.expires_at <= now()` is therefore checked once, at click-time. The webhook path that later flips `status → succeeded` goes through `tg_payment_update_whitelist()` only (`status`, `captured_at`), which has no expiry logic at all. So the scenario the "extension" was defending against — a customer stuck in a 3-D Secure sheet for 31 minutes getting charged and then rejected by our own trigger — **cannot happen**, because the gate already passed before the sheet opened. There is nothing left for an extension to protect. Carry this fix into the Phase 2 migration file (delete the prose sentence and the described behaviour) rather than trying to make the append-only trigger special-case a second column — that would weaken D19 for a benefit that doesn't exist.

---

## 3. The server-side refusal path — exact location and proof it isn't bypassable

### 3.1 Checkout POST, step by step

```ts
// apps/web/app/api/checkout/route.ts  (shape; Phase 4/5 owns the real handler)

export async function POST(req: Request) {
  const body = CheckoutSchema.parse(await req.json());   // quote_id, vehicle_class_id, contact, idempotency_key
  const identity = await resolveIdentity(req);            // anon | customer, per withIdentity()

  // 1) CHEAP PRE-FLIGHT — no Stripe call yet. Read-only, via the SECURITY DEFINER helper (§2.1).
  const [quote] = await withIdentity(env, identity, (tx) =>
    tx`select * from app.checkout_quote(${body.quoteId}, ${body.vehicleClassId})`
  );
  if (!quote) return json(404, { error: "quote_not_found" });
  if (!quote.is_chargeable) return json(409, { error: "quote_not_chargeable" });   // QUOTE-10
  if (quote.expires_at <= new Date())                                              // decorative pre-check
    return json(409, { error: "quote_expired", action: "requote" });

  // 2) Call Stripe OUTSIDE any DB transaction (rls-hyperdrive.md:484 — one transaction per
  //    logical unit of work, never held open across a network call).
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      ui_mode: "elements",
      adaptive_pricing: { enabled: true },
      expand: ["payment_intent"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: quote.total_rappen,
            product_data: { name: "Airport transfer" },
          },
        },
      ],
      metadata: { quote_id: body.quoteId },
    },
    { idempotencyKey: body.idempotencyKey },
  );

  // 3) ONE transaction: create the booking, bind the snapshot, record the payment attempt.
  //    This is where QUOTE-04 is ACTUALLY enforced — everything above is UX, not security.
  try {
    const booking = await withIdentity(env, identity, async (tx) => {
      const [b] = await tx`insert into public.bookings
        (customer_id, contact_name, contact_email, contact_phone, idempotency_key, quote_id, is_return)
        values (${identity.customerId}, ${body.name}, ${body.email}, ${body.phone},
                ${body.idempotencyKey}, ${body.quoteId}, ${body.isReturn}) returning id, reference`;

      await tx`update public.price_snapshots set booking_id = ${b.id}
                where id = ${quote.snapshot_id} and booking_id is null`;   // the ONE permitted mutation

      // Coupon redemption, if any — row-locked here, not reserved earlier. See §7.
      if (body.couponCode) {
        await tx`select id from public.coupons where code = ${body.couponCode} for update`;
        await tx`insert into public.coupon_redemptions (coupon_id, booking_id, customer_id)
                  select id, ${b.id}, ${identity.customerId ?? null}
                  from public.coupons where code = ${body.couponCode}`;
      }

      // Fires tg_payment_matches_snapshot() — THE authoritative check. Re-reads expires_at,
      // is_chargeable, rate_version status and charged amount from the DB row, ignoring
      // everything the request body or step 1 claimed.
      await tx`insert into public.booking_payments
        (booking_id, snapshot_id, stripe_checkout_session_id, charged_rappen, status)
        values (${b.id}, ${quote.snapshot_id}, ${session.id}, ${quote.total_rappen}, 'requires_payment')`;

      return b;
    });
    return json(200, { reference: booking.reference, clientSecret: session.client_secret });

  } catch (e) {
    if (isPgError(e, "restrict_violation")) {
      // The transaction rolled back atomically: no booking row, no reference burned,
      // no snapshot bound, no payment row. The Stripe Checkout Session from step 2 is now
      // orphaned but uncharged — expire it explicitly rather than trust Stripe's own
      // cleanup, which is not guaranteed on any short timer for requires_payment_method
      // (the documented 7-day auto-cancel applies to manual-capture requires_capture
      // intents, not this flow — https://docs.stripe.com/api/checkout/sessions/expire).
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      return json(409, { error: "quote_expired", action: "requote" });
    }
    throw e;
  }
}
```

[Note 2026-09-05: ADR-014 §1 — Checkout Session, not a bare PaymentIntent. See `.planning/ADR-014-owner-sitting-2026-08-22.md` §1 and `07-CONTEXT.md` D-04/D-07/D-08.]

**Why a UI countdown is decorative, demonstrated:** step 1's `expires_at <= new Date()` check is a courtesy — it saves a wasted Stripe call and gives a fast error. **Delete it entirely** (comment it out) and nothing about correctness changes, because step 3's `insert into booking_payments` still fires `tg_payment_matches_snapshot()`, which re-reads `s.expires_at` from Postgres itself and raises `restrict_violation` regardless of what the request body, the client JS, or step 1 believed. A client can:

- skip loading `checkout.dc.html`'s countdown UI entirely,
- hold a `quote_id` open for hours and replay the exact original POST body via `curl`,
- patch the bundled JS to always show "0:29 remaining",

— none of it changes the outcome, because none of it touches the value the trigger reads. Concretely:

```bash
# A quote_id manufactured/held past its 30-minute window, POSTed directly, browser never involved:
curl -sS -X POST https://vamostaxi.eu/api/checkout \
  -H 'content-type: application/json' \
  -d '{"quoteId":"<expired-uuid>","vehicleClassId":"<uuid>", "name":"Test","email":"t@test.ch", …}'
# → HTTP 409 {"error":"quote_expired","action":"requote"}
```

And the pgTAP-level proof this repo already promises (`charge_gate.test.sql`, `02-SCHEMA-DRAFT.md:2174`) is the same claim one layer down, with no HTTP route in front of it at all:

```sql
-- charge_gate.test.sql (extends the planned coverage)
select plan(3);

-- 1. A snapshot whose expires_at is already past raises, even inserted directly.
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     values (:'booking_id', :'expired_snapshot_id', 'pi_test_expired', :'total_rappen', 'requires_payment') $$,
  'restrict_violation'
);

-- 2. A snapshot id that does not exist raises the §2.2 guard, not a silent pass.
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     values (:'booking_id', -1, 'pi_test_missing', :'total_rappen', 'requires_payment') $$,
  'restrict_violation'
);

-- 3. Forged expires_at on the request path is impossible: it is not a column
--    booking_payments carries at all, only price_snapshots controls it.
select ok(
  not exists (select 1 from information_schema.columns
              where table_name = 'booking_payments' and column_name = 'expires_at')
);

select * from finish();
```

---

## 4. Clock discipline

**Rule: no timestamp used in an expiry decision is ever computed in the Worker. Every one is computed in Postgres, inside the same statement or transaction that later compares it.**

- `expires_at` at quote-insert time is written as `now() + interval '30 minutes'` in the SQL text of the `INSERT`, not as a JS `Date` bound as a parameter:
  ```sql
  insert into public.price_snapshots (…, expires_at, …)
  values (…, now() + interval '30 minutes' * s.quote_lock_minutes / 30, …)  -- see §6, settings-driven
  ```
  (Or simpler, if the multiplier is fetched as a plain interval already: `now() + (select quote_lock_minutes from public.settings) * interval '1 minute'`.) Never `expiresAt: new Date(Date.now() + 30*60*1000)` passed as a bound parameter — that reintroduces the Worker's clock into the one place it must not appear.
- The comparison at charge time, `s.expires_at <= now()`, is Postgres's own `now()` inside `tg_payment_matches_snapshot()`. Postgres defines `now()` as "equivalent to `transaction_timestamp()` … the start time of the current transaction" ([PG date/time functions](https://www.postgresql.org/docs/current/functions-datetime.html)) — frozen for the whole transaction, which is exactly the semantics wanted: one consistent "is this expired, as of the instant this checkout was submitted to the DB" decision, not a value that could tick mid-transaction and disagree with itself between the pre-flight read and the gate.
- `timestamptz` is stored normalized to UTC internally regardless of session `timezone` GUC ([PG date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html)); the only place a local timezone matters in this schema is `next_booking_reference()`'s `Europe/Zurich` year-partitioning, which is unrelated to expiry.
- **There is exactly one clock in this comparison** (Supabase's Postgres instance) — not two. "Clock skew between Worker and Postgres" is a non-issue for correctness by construction, because the Worker's `Date.now()` never enters an expiry decision. The only place the Worker's clock appears at all is the **UI countdown's own tick**, comparing the browser's local clock against the server-returned `expires_at` string — purely cosmetic, and any drift there only ever makes the on-screen timer early or late by the drift amount; §3 shows that has zero bearing on the actual gate.

---

## 5. Expiry sweep — reconciling "sweep" with insert-only

The instruction to reconcile these carefully is warranted: **as drafted, a Cron sweep cannot mutate `price_snapshots` at all**, and — once traced through — **it does not need to.**

- `tg_append_only()` blocks every UPDATE/DELETE except the one `booking_id` NULL→non-NULL case (§0 above). It applies to *every* role, `service_role` included — the REVOKE at `02-SCHEMA-DRAFT.md:1625` explicitly lists `service_role` among the roles stripped of UPDATE/DELETE, and `FORCE ROW LEVEL SECURITY` (§10) means even `BYPASSRLS`-style privilege doesn't help against the *trigger* layer, which the file itself notes is "not redundant with the grants" for exactly this reason.
- **A row does not need marking to *be* expired.** `expires_at <= now()` combined with `booking_id is null` already *is* "this quote lapsed unbought" — a fully derived predicate, true or false at read time, needing no write to represent. That is precisely why `tg_payment_matches_snapshot()` needs no cooperation from a sweep: it re-derives the same predicate itself, live, every time.
- **So: nothing. A quote-expiry Cron job that mutates `price_snapshots` should not exist.** `GSD-LAUNCH.md`'s Phase 5 line 6 ("Cron … expire stale quotes") describes a job that, under this schema, has zero correctness work to do — it is a holdover from a mental model (a mutable `status` column on the quote) that this design deliberately replaced. Flag this back into `GSD-LAUNCH.md` §Phase 5 alongside the `price_chf` correction already noted in `price-snapshot.md:387`.
- **`LIFE-07`'s other half — "no-shows are swept" — is a genuinely different job**, on `bookings`/`booking_legs` (mutable tables, Phase 9's roll-up trigger territory per U21), not on `price_snapshots`. Keep the two apart: one Cron Trigger, two unrelated concerns, only one of which (no-show) does any writing.
- **What a `price_snapshots`-adjacent Cron job *can* legitimately do** is read-only analytics — counting today's unconverted quotes for a funnel dashboard — which needs no special path beyond a normal `vamos_staff`-identity query over `HYPERDRIVE_NOCACHE` (the `price_snapshots_expiry` index already supports it). This is optional, not required for QUOTE-04, and not this lane's job to build.
- **Storage/retention of ancient unbound rows is a real, separate, deferred question**, not a QUOTE-04 concern: unbound `price_snapshots` rows currently live forever (nothing can delete them). At Zurich volume this is "trivially small" per `price-snapshot.md:746` for years. If retention hygiene is ever wanted, it must be a narrow, named, audited path — never an open DELETE grant, which would defeat D19's whole point:
  ```sql
  -- NOT built in Phase 4. Sketch only, for whenever retention policy is answered.
  create or replace function public.purge_unbought_quotes(p_older_than interval)
  returns bigint language plpgsql security definer set search_path = '' as $$
  declare n bigint;
  begin
    -- Table owner runs this; the append-only trigger does not fire for the owner's
    -- own DDL-adjacent maintenance path the way it does for role-scoped DML — this
    -- function is the one sanctioned exception, exactly like next_booking_reference().
    delete from public.price_snapshots
     where booking_id is null and expires_at < now() - p_older_than;
    get diagnostics n = row_count;
    return n;
  end $$;
  revoke all on function public.purge_unbought_quotes(interval) from public;
  grant execute on function public.purge_unbought_quotes(interval) to service_role;
  ```
  **UNCERTAIN — do not build this in Phase 4.** It needs an owner answer to "how long do we keep a quote nobody bought" (a genuine data-retention/GDPR-minimization policy question, not an engineering one), the same class of question ADR-002/ADR-005 already route to the owner. Settle it the same way: add to `docs/build/OWNER-ANSWERS.md`, and only then land this function in a dated migration.

---

## 6. Renewal — what happens when the quote expires mid-checkout

**Decision: always a fresh `/api/quote` call. There is no partial "extend my existing quote" endpoint.**

- The 409 in §3.1's catch block carries `action: "requote"`. The client re-submits the same trip parameters (route, datetime, pax, bags) to `POST /api/quote`, which returns brand-new `price_snapshots` rows with a brand-new `quote_id`, priced against **whatever `rate_versions` row is `live` right now** — never the old `rate_version_id`.
- **This is correct, not just simpler.** LIFE-03's protection ("the policy stored on the booking, not whatever the policy says today") exists for *purchased* bookings, where the customer already paid under a specific promise. An unbought, expired quote was never a promise kept — nothing is owed to it. If the owner republished the CHF matrix in the intervening 30 minutes, the honest thing is a new price, shown before payment, never a silently different charge.
- **No mid-flight rate-version drift is possible within a single quote's lifetime** either: `rate_version_is_live` and `total_rappen` are frozen at the *original* snapshot's INSERT and never touched again (§0), so nothing about the *first* quote can drift while it's still valid — only a *renewal* can land under a different version, and it does so transparently as a new quote the customer sees before paying.
- **Cost is not a reason to build a lighter-weight renew path.** Mapbox geocode/route results are already KV-cached 24 h by place-id pair per `GSD-LAUNCH.md` Phase 4 item 1, so a re-quote after an expired checkout is a cache hit on the expensive part; only the price arithmetic re-runs, which is cheap. Building a second, narrower "renew" code path buys nothing and doubles the surface QUOTE-04 has to be correct on.

---

## 7. Interaction with U7 (coupon consumption) and the "soft KV reservation" idea

**This design answers U7 implicitly as: consume at booking-creation (= payment) time, via a row lock inside the same transaction — no KV reservation.**

- The schema already forces this: `coupon_redemptions.booking_id uuid not null` (`02-SCHEMA-DRAFT.md:750`). A redemption row cannot exist before a `bookings` row does, and a `bookings` row is only created inside checkout's single transaction (§3.1 step 3) — never at quote time. So "does an abandoned quote burn a coupon use" is already **no**, by the shape of the FK, independent of what this brief recommends.
- **Race safety for a scarce coupon (`global_limit`) does not need KV at all.** The redemption path in §3.1 step 3 takes `select id from public.coupons where code = … for update` *before* counting existing redemptions and inserting the new one, inside the same transaction that will also bind the snapshot and insert the payment row. Postgres's row lock serializes concurrent checkouts on the same code correctly — two customers racing for the last slot of a capped coupon get a first-committer-wins outcome at the moment they actually commit to pay, which is the only moment that matters.
- **`price-snapshot.md`'s "soft KV reservation for the 30-minute window" was solving a different problem than the one that exists here**: reserving a slot *at quote time* so a customer who is actively quoting doesn't lose a scarce code to someone else mid-checkout. That is a legitimate future UX improvement (avoid a "sorry, that code just ran out" surprise at the last step) but it is **additive, not required for correctness** — the `FOR UPDATE` lock already prevents overselling; a reservation only prevents the *UX* cost of a fair race being lost. Building it now would mean: KV entry keyed by (coupon_id, quote_id) with a 30-minute TTL and a soft-decremented counter, reconciled against the real `coupon_redemptions` count at redemption time — extra infrastructure, extra a KV-vs-DB consistency question, for a UX polish item that has no owner ask behind it yet.
- **Recommendation for Phase 4: build only the `FOR UPDATE` lock. Do not build the KV reservation.** If the owner later confirms scarce/high-demand codes are a real pattern (a marketing push where a capped code visibly sells out mid-checkout for real customers), add the KV soft-reservation as a pure UX layer on top — it does not touch `price_snapshots`, `expires_at`, or this lane's gate, so it can land independently without a schema change.
- **Residency note, since a KV reservation would be keyed by something request-scoped:** if this is ever built, the key must be `(coupon_id, quote_id)` — both non-personal, random-UUID/integer identifiers — never `customer_id`, `booking_id`, or email, per the binding rule already set in `02-RESEARCH.md:454` ("keys are place-id pairs and flight numbers, never `customer_id`/`booking_id`/email"). `quote_id` is already the right shape (a bare UUID with no PII embedded); this is a reminder to whoever builds it, not new policy.

---

## 8. One more thing worth fixing while here: the 30 minutes should be a named setting, not a literal

`REQUIREMENTS.md` states "30 minutes" as an owner-approved product number (unlike the NULL waiting allowances) — so it needs **no** `data-tok` gap and **no** owner sign-off to seed. But this project already has a precedent for exactly this shape of value: `settings.chauffeur_turnaround_minutes integer not null default 30` — "an internal dispatch parameter, never rendered on a public surface," seeded with a real default rather than NULL, editable later without a redeploy. Quote-lock duration is the same shape: an engine parameter, not a customer-facing promise that a booking needs to remember forever (nothing downstream — refunds, disputes — ever needs to know *what the lock duration setting was*, only whether `expires_at` had passed; unlike `free_cancel_hours`, it does **not** belong in `settings_versions`/`policy` jsonb).

```sql
-- extends 0006_settings.sql (or a Phase 4 migration)
alter table public.settings
  add column quote_lock_minutes integer not null default 30 check (quote_lock_minutes > 0);
```

```sql
-- price snapshot insert, Phase 4's quote engine
insert into public.price_snapshots (…, expires_at, …)
select …, now() + (s.quote_lock_minutes || ' minutes')::interval, …
  from public.settings s where s.id = 1;
```

---

## 9. Uncertainties carried forward, with the exact check that settles each

| # | Uncertainty | What settles it |
|---|---|---|
| **A** | Whether `security definer` on `tg_payment_matches_snapshot()` (§2.2) has any unintended interaction with the `booking_payments_column_whitelist` trigger, which is *not* proposed as `security definer`. | Add both triggers to a local Supabase instance, run `charge_gate.test.sql` end to end as `authenticated` and as `vamos_guest`, assert identical behaviour to today's invoker-rights version for every non-error path. |
| **B** | Exact wording Stripe uses/guarantees for auto-cancellation of an unconfirmed `requires_payment_method` PaymentIntent — I could not find a documented short timer for this status (only the 7-day `requires_capture` uncaptured-intent rule, a different flow). | `docs.stripe.com/api/checkout/sessions/expire` + a support/docs confirmation before relying on *anything* other than the explicit `stripe.checkout.sessions.expire()` call in §3.1's catch block. Until confirmed, treat explicit expire as mandatory, not a nice-to-have. |
| **C** | Retention window for unbound `price_snapshots` rows (§5's `purge_unbought_quotes`). | Owner answer in `docs/build/OWNER-ANSWERS.md`, same channel as ADR-002/ADR-005. Do not build the purge function until answered. |
| **D** | Whether a KV soft-reservation for scarce coupons (§7) is ever actually needed — depends on whether the owner runs capped-quantity promotional codes at a volume where the race is user-visible. | Owner/marketing input on planned coupon campaigns; not a technical unknown. |
| **E** | `now()` semantics inside `sql.begin(async (tx) => {...})` sequential-await form (§3.1 uses this, not the pipelined array form) — confirm all statements in one `withIdentity` call share one transaction start time, not per-statement `statement_timestamp()`-like drift. | `begin; select now(); select pg_sleep(2); select now();` locally — both `now()` calls must return the identical value (transaction-start semantics), confirming §4's "one clock" claim empirically, not just from docs. |

---

## RECOMMENDATION

**The 30-minute quote lock is `price_snapshots.expires_at` in Postgres — full stop, no KV involved in the lock itself — enforced by the existing `BEFORE INSERT` trigger on `booking_payments` at the moment the checkout POST creates the PaymentIntent row, which fires before any 3-D Secure/TWINT detour and therefore needs no `expires_at` extension at payment time (that line in `02-SCHEMA-DRAFT.md:1323` contradicts the append-only trigger and should be deleted). Before Phase 4 writes checkout code, land three fixes into the Phase 2 migration files: (1) `app.checkout_quote(quote_id, vehicle_class_id)`, a `SECURITY DEFINER` read function mirroring `app.booking_has_manage_token()`, because no RLS policy currently lets any client role read an unbound snapshot; (2) `SECURITY DEFINER` + `set search_path = ''` + an explicit `if not found` guard on `tg_payment_matches_snapshot()`, because as drafted it depends on an RLS-filtered NULL row happening to still trip the `IS DISTINCT FROM` check rather than failing explicitly; (3) `settings.quote_lock_minutes integer not null default 30`, computed into `expires_at` via `now() + interval` inside the same INSERT statement — never a JS-computed timestamp bound as a parameter, so the Worker's clock never enters an expiry decision. A UI countdown is decorative and demonstrably so: deleting the client-side check changes nothing, because the same `restrict_violation` fires from a bare `curl` or a raw pgTAP insert with no HTTP layer at all. The `price_snapshots_expiry` index built for 'LIFE-07 stale-quote sweep' backs no mutating Cron job — `price_snapshots` is insert-only under D19 even for `service_role`, and an expired-unbought quote needs no mark or delete to *be* expired, since `expires_at <= now()` is already the fact; a genuine storage-retention purge is a separate, deferred, owner-gated decision (`purge_unbought_quotes`, sketched not built). A customer whose quote expires mid-checkout always gets a fresh `/api/quote` under whatever rate version is currently live — never a partial renew — because LIFE-03's protection is for paid bookings, not abandoned quotes. U7 is answered by the schema's own FK shape (`coupon_redemptions.booking_id not null`): coupons are consumed inside the same checkout transaction that creates the booking, guarded by `SELECT … FOR UPDATE` on the coupon row, not by a KV reservation at quote time — build the row lock now, defer the KV soft-reservation until the owner confirms capped-code campaigns actually need it.**